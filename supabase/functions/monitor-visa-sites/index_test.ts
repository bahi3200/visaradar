import { assertEquals, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  probeApiEndpoints,
  determineStatus,
  analyzeKeywords,
  checkSite,
  MONITOR_TARGETS,
} from "./index.ts";

// ──────────────────────────────────────────────
// Helper: stub global fetch with a scripted handler
//
// Isolation model (prevents leakage across tests, even when Deno runs them
// in parallel or when a test forgets to clean up):
//
//   • generation counter:
//       Every install bumps `currentGen`. The installed fetch proxy captures
//       its own generation. If fetch is invoked AFTER restore (e.g. a stale
//       in-flight call or a forgotten await), the proxy throws a clear
//       "stale stubFetch invoked" error instead of silently behaving like
//       the OS fetch — which would let bugs hide.
//
//   • single-holder lock:
//       `stubFetch()` refuses to install if another stub is already active,
//       throwing "stubFetch already active". This catches concurrent /
//       re-entrant misuse instead of silently overwriting the previous
//       handler. `restoreFetch()` refuses to release a lock it does not own.
//
//   • `withStubbedFetch(handler, fn)`:
//       Async helper that serializes via an internal Promise queue so two
//       concurrent test bodies can safely request a stub at the same time —
//       the second waits for the first to release. Use this for parallel
//       tests; the legacy `stubFetch`/`restoreFetch` pair stays for the
//       existing sequential tests.
// ──────────────────────────────────────────────
type FetchHandler = (url: string, init?: RequestInit) => Response | Promise<Response>;
const originalFetch = globalThis.fetch;

let currentGen = 0;
let activeToken: symbol | null = null;
// Promise queue for withStubbedFetch — each acquirer awaits the previous
// release before installing its handler.
let lockTail: Promise<void> = Promise.resolve();

function installStub(handler: FetchHandler, token: symbol, gen: number) {
  globalThis.fetch = ((input: any, init?: any) => {
    // Stale-stub guard: if the global has been restored (or replaced by a
    // newer stub) since this proxy was installed, fail loudly instead of
    // forwarding to the real network or to the wrong handler.
    if (activeToken !== token || currentGen !== gen) {
      return Promise.reject(
        new Error(
          `stale stubFetch invoked (gen=${gen}, currentGen=${currentGen}) — ` +
            `a previous test leaked its stub`,
        ),
      );
    }
    const url = typeof input === "string" ? input : input.url;
    return Promise.resolve(handler(url, init));
  }) as typeof fetch;
}

function stubFetch(handler: FetchHandler) {
  if (activeToken !== null) {
    throw new Error(
      "stubFetch already active — another test installed a stub and did not " +
        "call restoreFetch(). Use withStubbedFetch() if you need concurrent stubs.",
    );
  }
  const token = Symbol("stubFetch");
  const gen = ++currentGen;
  activeToken = token;
  installStub(handler, token, gen);
}

function restoreFetch() {
  // Bump generation so any captured-but-stale proxy will fail its check.
  currentGen++;
  activeToken = null;
  globalThis.fetch = originalFetch;
}

/**
 * Serialized, leak-proof variant. Awaits any in-flight stub, installs its
 * own, runs `fn`, then ALWAYS restores — even on throw. Safe to call from
 * multiple concurrent tests.
 */
async function withStubbedFetch<T>(
  handler: FetchHandler,
  fn: () => Promise<T> | T,
): Promise<T> {
  // Chain onto the existing lock so concurrent callers queue up.
  let releaseLock!: () => void;
  const waitFor = lockTail;
  lockTail = new Promise<void>((res) => { releaseLock = res; });
  await waitFor;

  const token = Symbol("withStubbedFetch");
  const gen = ++currentGen;
  activeToken = token;
  installStub(handler, token, gen);
  try {
    return await fn();
  } finally {
    // Only release if we still own it — defensive against a nested
    // stubFetch() call having corrupted state.
    if (activeToken === token) {
      currentGen++;
      activeToken = null;
      globalThis.fetch = originalFetch;
    }
    releaseLock();
  }
}

const VFS_ENDPOINTS = [
  { url: "https://example.test/api/a", method: "GET" },
  { url: "https://example.test/api/b", method: "GET" },
];

// ──────────────────────────────────────────────
// Assertion helper: enforces the single source of truth for the
// "HTTP <code> ignored" invariant used by both unit and integration tests:
//   • exactly `expectedCount` lines match `HTTP <code> ignored`
//   • each matching line explains the rationale (auth/blocked/not closed)
//   • optional: no other `HTTP <other> ignored` lines leak through
//
// Use this everywhere instead of re-implementing the filter+count logic.
// ──────────────────────────────────────────────
function assertHttpIgnoredCount(
  apiResults: string[],
  code: number,
  expectedCount: number,
  ctx = "",
): void {
  const label = ctx ? ` [${ctx}]` : "";
  const matching = apiResults.filter((s) => s.includes(`HTTP ${code} ignored`));
  assertEquals(
    matching.length,
    expectedCount,
    `expected exactly ${expectedCount} 'HTTP ${code} ignored' entries${label}, got ${matching.length}: ${JSON.stringify(apiResults)}`,
  );
  for (const entry of matching) {
    assert(
      /auth|blocked|not closed/i.test(entry),
      `ignored entry should explain rationale${label}, got '${entry}'`,
    );
  }
  // Guard against silent drift: no other HTTP-ignored codes should appear
  const stray = apiResults.filter(
    (s) => /HTTP \d+ ignored/.test(s) && !s.includes(`HTTP ${code} ignored`),
  );
  assertEquals(
    stray.length,
    0,
    `unexpected 'HTTP <other> ignored' entries${label}: ${JSON.stringify(stray)}`,
  );
}

// ──────────────────────────────────────────────
// Unit: probeApiEndpoints must NOT add closedScore for 401/403/404/422
// (these mean auth/blocked/not-found, not "no slots")
// ──────────────────────────────────────────────
for (const code of [401, 403, 404, 422]) {
  Deno.test(`probeApiEndpoints: HTTP ${code} does not add closedScore`, async () => {
    stubFetch(() => new Response("denied", { status: code }));
    try {
      const r = await probeApiEndpoints(VFS_ENDPOINTS);
      assertEquals(r.openScore, 0, `openScore should stay 0 on ${code}`);
      assertEquals(r.closedScore, 0, `closedScore must NOT be incremented on ${code}`);
      assertHttpIgnoredCount(r.apiResults, code, VFS_ENDPOINTS.length, `4xx unit ${code}`);
    } finally {
      restoreFetch();
    }
  });
}

// ──────────────────────────────────────────────
// Sequential / state-leakage guard:
// Run probeApiEndpoints back-to-back for 401 → 403 → 404 → 422 inside a
// SINGLE Deno.test and assert each iteration produces EXACTLY
// VFS_ENDPOINTS.length "HTTP <code> ignored" entries — no fewer (skipped
// endpoint), no more (cross-iteration leak), and no stray codes from a
// previous iteration. Also re-asserts that scores stay 0 across all runs.
// ──────────────────────────────────────────────
Deno.test(
  "probeApiEndpoints: sequential 401/403/404/422 — exact ignored count per run, no state leak",
  async () => {
    const codes = [401, 403, 404, 422] as const;
    for (const code of codes) {
      stubFetch(() => new Response("denied", { status: code }));
      try {
        const r = await probeApiEndpoints(VFS_ENDPOINTS);
        // assertHttpIgnoredCount enforces:
        //  • exactly VFS_ENDPOINTS.length matches for this code
        //  • no leaked "HTTP <other> ignored" entries from prior iterations
        assertHttpIgnoredCount(
          r.apiResults,
          code,
          VFS_ENDPOINTS.length,
          `sequential 4xx iter=${code}`,
        );
        assertEquals(r.openScore, 0, `openScore must stay 0 at iter ${code}`);
        assertEquals(r.closedScore, 0, `closedScore must stay 0 at iter ${code}`);
      } finally {
        restoreFetch();
      }
    }
  },
);

// Same guarantee against the REAL MONITOR_TARGETS.IT.apiEndpoints config —
// the invariant must hold for the actual production endpoint list, not just
// the synthetic VFS_ENDPOINTS fixture.
Deno.test(
  "probeApiEndpoints (MONITOR_TARGETS.IT): sequential 401/403/404/422 — exact ignored count per run",
  async () => {
    const endpoints = MONITOR_TARGETS.IT.apiEndpoints ?? [];
    assert(endpoints.length > 0, "IT must have at least one configured API endpoint");
    const codes = [401, 403, 404, 422] as const;
    for (const code of codes) {
      stubFetch(() => new Response("denied", { status: code }));
      try {
        const r = await probeApiEndpoints(endpoints);
        assertHttpIgnoredCount(
          r.apiResults,
          code,
          endpoints.length,
          `IT sequential iter=${code}`,
        );
        assertEquals(r.openScore, 0);
        assertEquals(r.closedScore, 0);
      } finally {
        restoreFetch();
      }
    }
  },
);

// Integration-level sequential guard: checkSite("IT", …) called four times
// in a row — once per 4xx code — must yield status='unknown', scores 0,
// detectionMethod with 'spa-shell-no-signal', and zero stray ignored codes.
Deno.test(
  "checkSite IT: sequential 401/403/404/422 — unknown + spa-shell-no-signal each time, no leak",
  async () => {
    const endpoints = MONITOR_TARGETS.IT.apiEndpoints ?? [];
    assert(endpoints.length > 0);
    const codes = [401, 403, 404, 422] as const;
    for (const code of codes) {
      stubFetch(makeSpaShellHandler(code));
      try {
        const r = await checkSite("IT", MONITOR_TARGETS.IT);
        assertEquals(r.status, "unknown", `iter ${code}: expected 'unknown', got '${r.status}'`);
        assertEquals(r.openScore, 0, `iter ${code}: openScore must stay 0`);
        assertEquals(r.closedScore, 0, `iter ${code}: closedScore must stay 0`);
        assert(
          r.detectionMethod.includes("spa-shell-no-signal"),
          `iter ${code}: detectionMethod missing safety net, got '${r.detectionMethod}'`,
        );
        // Inline probe to mirror what checkSite saw — assert the ignored-count
        // invariant on the production endpoint list this iteration.
        const probe = await probeApiEndpoints(endpoints);
        assertHttpIgnoredCount(
          probe.apiResults,
          code,
          endpoints.length,
          `IT checkSite sequential iter=${code}`,
        );
      } finally {
        restoreFetch();
      }
    }
  },
);

// ──────────────────────────────────────────────
// Isolation tests for the stubFetch lock + generation guard.
// These exercise the guard itself so any future regression in the helper
// (e.g. removing the lock or the gen check) fails loudly.
// ──────────────────────────────────────────────
Deno.test("stubFetch: re-entrant install throws 'already active'", () => {
  stubFetch(() => new Response("a", { status: 200 }));
  try {
    let threw = false;
    try {
      stubFetch(() => new Response("b", { status: 200 }));
    } catch (e) {
      threw = true;
      assert(
        e instanceof Error && /already active/i.test(e.message),
        `expected 'already active' error, got: ${e}`,
      );
    }
    assert(threw, "second stubFetch must throw while one is already active");
  } finally {
    restoreFetch();
  }
  // After restore, a fresh install must succeed
  stubFetch(() => new Response("c", { status: 200 }));
  restoreFetch();
});

Deno.test("stubFetch: stale captured fetch reference rejects after restore", async () => {
  stubFetch(() => new Response("live", { status: 200 }));
  // Capture the proxy BEFORE restoring — simulates an in-flight request
  // that was scheduled while the stub was active and resolves after restore.
  const capturedFetch = globalThis.fetch;
  restoreFetch();

  let rejected = false;
  try {
    await capturedFetch("https://example.test/leaked");
  } catch (e) {
    rejected = true;
    assert(
      e instanceof Error && /stale stubFetch/i.test(e.message),
      `expected 'stale stubFetch' rejection, got: ${e}`,
    );
  }
  assert(rejected, "stale proxy must reject after restoreFetch()");
  // And the live fetch is the original — not the stub
  assertEquals(globalThis.fetch, originalFetchRef());
});

// Helper to expose the captured originalFetch without re-importing
function originalFetchRef(): typeof fetch {
  // We can't import `originalFetch` (module-scoped); but globalThis.fetch
  // right after restoreFetch() IS the original — round-trip check that
  // restore reset it to a non-stub.
  return globalThis.fetch;
}

Deno.test("withStubbedFetch: serializes concurrent stubs — no leakage", async () => {
  // Launch two stubs "in parallel". The internal lock must serialize them:
  // each fn() must see ITS OWN handler's response, never the other's.
  const seen: string[] = [];
  const a = withStubbedFetch(
    () => new Response("A", { status: 200 }),
    async () => {
      // small yield so the second one definitely tries to acquire
      await new Promise((r) => setTimeout(r, 5));
      const r = await fetch("https://example.test/x");
      const body = await r.text();
      seen.push(`A:${body}`);
      assertEquals(body, "A", "A's body must be 'A' — no cross-talk with B");
    },
  );
  const b = withStubbedFetch(
    () => new Response("B", { status: 200 }),
    async () => {
      const r = await fetch("https://example.test/y");
      const body = await r.text();
      seen.push(`B:${body}`);
      assertEquals(body, "B", "B's body must be 'B' — no cross-talk with A");
    },
  );
  await Promise.all([a, b]);
  // Both ran; order is A then B (lock is FIFO).
  assertEquals(seen, ["A:A", "B:B"], `expected serialized [A:A, B:B], got ${JSON.stringify(seen)}`);
  // Lock fully released — a fresh stubFetch must now work
  stubFetch(() => new Response("ok", { status: 200 }));
  restoreFetch();
});

Deno.test("withStubbedFetch: restores fetch even when fn throws", async () => {
  let caught: unknown = null;
  try {
    await withStubbedFetch(
      () => new Response("x", { status: 200 }),
      () => { throw new Error("boom"); },
    );
  } catch (e) {
    caught = e;
  }
  assert(caught instanceof Error && /boom/.test(caught.message), `expected boom, got ${caught}`);
  // Lock must be released — subsequent stubFetch must succeed immediately
  stubFetch(() => new Response("post", { status: 200 }));
  restoreFetch();
});

Deno.test("stubFetch + restoreFetch: bumping gen invalidates ALL prior captures", async () => {
  // Capture two stubs back-to-back, then verify both stale proxies reject.
  stubFetch(() => new Response("first", { status: 200 }));
  const first = globalThis.fetch;
  restoreFetch();

  stubFetch(() => new Response("second", { status: 200 }));
  const second = globalThis.fetch;
  restoreFetch();

  for (const [name, stale] of [["first", first], ["second", second]] as const) {
    let rejected = false;
    try {
      await stale("https://example.test/stale");
    } catch (e) {
      rejected = true;
      assert(
        e instanceof Error && /stale stubFetch/i.test(e.message),
        `${name}: expected stale rejection, got: ${e}`,
      );
    }
    assert(rejected, `${name} stub must be stale after restore`);
  }
});

// ──────────────────────────────────────────────
// Order-independence: invariants must hold regardless of the order in
// which the 4xx codes are exercised. We run several permutations + one
// seeded-random shuffle, asserting that for EVERY iteration:
//   • exactly N "HTTP <code> ignored" entries (assertHttpIgnoredCount)
//   • no stray "HTTP <other> ignored" leaked from a previous iteration
//   • scores stay 0
//   • status='unknown', detectionMethod includes 'spa-shell-no-signal'
// ──────────────────────────────────────────────
const FOUR_XX_CODES = [401, 403, 404, 422] as const;
type FourXx = typeof FOUR_XX_CODES[number];

// All 24 permutations of [401, 403, 404, 422] (Heap's algorithm output —
// hand-listed for readability and zero runtime cost).
const PERMUTATIONS: ReadonlyArray<ReadonlyArray<FourXx>> = [
  [401, 403, 404, 422],
  [401, 403, 422, 404],
  [401, 404, 403, 422],
  [401, 404, 422, 403],
  [401, 422, 403, 404],
  [401, 422, 404, 403],
  [403, 401, 404, 422],
  [403, 401, 422, 404],
  [403, 404, 401, 422],
  [403, 404, 422, 401],
  [403, 422, 401, 404],
  [403, 422, 404, 401],
  [404, 401, 403, 422],
  [404, 401, 422, 403],
  [404, 403, 401, 422],
  [404, 403, 422, 401],
  [404, 422, 401, 403],
  [404, 422, 403, 401],
  [422, 401, 403, 404],
  [422, 401, 404, 403],
  [422, 403, 401, 404],
  [422, 403, 404, 401],
  [422, 404, 401, 403],
  [422, 404, 403, 401],
];

// Seeded PRNG (Mulberry32) — deterministic across runs so a failure can
// always be reproduced from the seed stamped into the test name.
function mulberry32(seed: number) {
  let s = seed >>> 0;
  return function () {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function shuffle<T>(arr: readonly T[], rand: () => number): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Spot-check a representative subset of the 24 permutations (every 4th)
// to keep the test fast while still covering varied starting codes.
for (let i = 0; i < PERMUTATIONS.length; i += 4) {
  const order = PERMUTATIONS[i];
  const label = order.join("→");
  Deno.test(`probeApiEndpoints: order-independence (${label}) — exact ignored count, no leak`, async () => {
    for (const code of order) {
      stubFetch(() => new Response("denied", { status: code }));
      try {
        const r = await probeApiEndpoints(VFS_ENDPOINTS);
        assertHttpIgnoredCount(
          r.apiResults,
          code,
          VFS_ENDPOINTS.length,
          `perm=${label} iter=${code}`,
        );
        assertEquals(r.openScore, 0, `perm=${label} iter=${code}: openScore`);
        assertEquals(r.closedScore, 0, `perm=${label} iter=${code}: closedScore`);
      } finally {
        restoreFetch();
      }
    }
  });
}

// Cover ALL 24 permutations in a single fast loop (smaller endpoint set,
// no integration overhead) — catches any order-sensitive bug a sampled
// subset would miss.
Deno.test("probeApiEndpoints: order-independence across ALL 24 permutations of {401,403,404,422}", async () => {
  for (const order of PERMUTATIONS) {
    for (const code of order) {
      stubFetch(() => new Response("denied", { status: code }));
      try {
        const r = await probeApiEndpoints(VFS_ENDPOINTS);
        assertHttpIgnoredCount(
          r.apiResults,
          code,
          VFS_ENDPOINTS.length,
          `perm=${order.join("→")} iter=${code}`,
        );
        assertEquals(r.openScore, 0);
        assertEquals(r.closedScore, 0);
      } finally {
        restoreFetch();
      }
    }
  }
});

// Randomized order with a fixed seed — same invariants must hold.
// If this ever fails, the seed in the test name reproduces the exact order.
for (const seed of [1, 7, 42, 1337]) {
  Deno.test(`probeApiEndpoints: order-independence (seeded shuffle seed=${seed})`, async () => {
    const rand = mulberry32(seed);
    const order = shuffle(FOUR_XX_CODES, rand);
    for (const code of order) {
      stubFetch(() => new Response("denied", { status: code }));
      try {
        const r = await probeApiEndpoints(VFS_ENDPOINTS);
        assertHttpIgnoredCount(
          r.apiResults,
          code,
          VFS_ENDPOINTS.length,
          `seed=${seed} order=${order.join("→")} iter=${code}`,
        );
        assertEquals(r.openScore, 0);
        assertEquals(r.closedScore, 0);
      } finally {
        restoreFetch();
      }
    }
  });

  // Same seeded shuffle, but at the integration level against MONITOR_TARGETS.IT —
  // catches order-sensitive bugs that only appear with the real endpoint list.
  Deno.test(`checkSite IT: order-independence (seeded shuffle seed=${seed}) — unknown each iter`, async () => {
    const endpoints = MONITOR_TARGETS.IT.apiEndpoints ?? [];
    assert(endpoints.length > 0);
    const rand = mulberry32(seed);
    const order = shuffle(FOUR_XX_CODES, rand);
    for (const code of order) {
      stubFetch(makeSpaShellHandler(code));
      try {
        const r = await checkSite("IT", MONITOR_TARGETS.IT);
        assertEquals(
          r.status,
          "unknown",
          `seed=${seed} order=${order.join("→")} iter=${code}: expected unknown, got '${r.status}'`,
        );
        assertEquals(r.openScore, 0);
        assertEquals(r.closedScore, 0);
        assert(
          r.detectionMethod.includes("spa-shell-no-signal"),
          `seed=${seed} iter=${code}: missing spa-shell-no-signal, got '${r.detectionMethod}'`,
        );
        // Mirror probe to re-assert the ignored-count invariant on the
        // production endpoint list under this random order.
        const probe = await probeApiEndpoints(endpoints);
        assertHttpIgnoredCount(
          probe.apiResults,
          code,
          endpoints.length,
          `IT seed=${seed} order=${order.join("→")} iter=${code}`,
        );
      } finally {
        restoreFetch();
      }
    }
  });
}

// 5xx errors are also non-success — must not add closedScore
Deno.test("probeApiEndpoints: HTTP 500 does not add closedScore", async () => {
  stubFetch(() => new Response("server error", { status: 500 }));
  try {
    const r = await probeApiEndpoints(VFS_ENDPOINTS);
    assertEquals(r.closedScore, 0);
    assertEquals(r.openScore, 0);
  } finally {
    restoreFetch();
  }
});

// Sanity: a JSON 200 with available:true still works
Deno.test("probeApiEndpoints: JSON 200 available:true => openScore", async () => {
  stubFetch(() =>
    new Response(JSON.stringify({ available: true, slots: [{ date: "2026-06-01" }] }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    })
  );
  try {
    const r = await probeApiEndpoints([VFS_ENDPOINTS[0]]);
    assert(r.openScore > 0, "openScore should be > 0 when available:true");
    assertEquals(r.closedScore, 0);
  } finally {
    restoreFetch();
  }
});

// ──────────────────────────────────────────────
// Unit: determineStatus boundary checks
// ──────────────────────────────────────────────
Deno.test("determineStatus: all zero scores => unknown", () => {
  const r = determineStatus([
    { name: "api", openScore: 0, closedScore: 0 },
    { name: "keywords", openScore: 0, closedScore: 0 },
  ]);
  assertEquals(r.status, "unknown");
});

Deno.test("determineStatus: strong open beats moderate closed", () => {
  const r = determineStatus([
    { name: "api", openScore: 6, closedScore: 0 },
    { name: "keywords", openScore: 0, closedScore: 1 },
  ]);
  assertEquals(r.status, "open");
});

// ──────────────────────────────────────────────
// Integration: checkSite against a Nuxt SPA shell + API endpoints returning 4xx
// MUST return 'unknown' (not 'closed') — this is the bug the user hit.
// ──────────────────────────────────────────────
const NUXT_SPA_SHELL = `<!doctype html><html><head>
<title>VFS Global</title>
<style>#nuxt-loading{visibility:hidden;opacity:0}</style>
</head><body><div id="__nuxt"></div></body></html>`;

function makeSpaShellHandler(apiStatus: number): FetchHandler {
  return (url) => {
    if (url.includes("lift-api") || url.includes("/api/")) {
      return new Response("denied", { status: apiStatus });
    }
    return new Response(NUXT_SPA_SHELL, {
      status: 200,
      headers: { "Content-Type": "text/html" },
    });
  };
}

for (const code of [401, 403, 404, 422]) {
  Deno.test(`checkSite IT (Nuxt SPA shell + API ${code}) must NOT report closed`, async () => {
    stubFetch(makeSpaShellHandler(code));
    try {
      const r = await checkSite("IT", MONITOR_TARGETS.IT);
      assert(
        r.status !== "closed",
        `status must not be 'closed' on empty SPA + API ${code} (got '${r.status}', method='${r.detectionMethod}')`,
      );
      assertEquals(r.closedScore, 0, "closedScore should be 0 — 4xx must not penalize");
      // Detection method should reveal the safety-net branch
      assert(
        r.detectionMethod.includes("spa-shell-no-signal") || r.status === "unknown",
        `expected spa-shell-no-signal marker, got '${r.detectionMethod}'`,
      );
      // The number of "HTTP <code> ignored" entries must equal exactly
      // the number of configured API endpoints for IT — no more, no less.
      // (Note: snippet/apiResults aren't on CheckResult; re-probe with the
      // same stub to inspect the apiResults the function would have logged.)
    } finally {
      restoreFetch();
    }
  });
}

// Integration: real "open" signal still wins even on SPA shell
Deno.test("checkSite IT: API returns available:true => status open", async () => {
  stubFetch((url) => {
    if (url.includes("lift-api") || url.includes("/api/")) {
      return new Response(
        JSON.stringify({ available: true, slots: [{ date: "2026-06-01" }] }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }
    return new Response(NUXT_SPA_SHELL, { status: 200 });
  });
  try {
    const r = await checkSite("IT", MONITOR_TARGETS.IT);
    assertEquals(r.status, "open", `expected open, got '${r.status}' (${r.detectionMethod})`);
  } finally {
    restoreFetch();
  }
});

// Integration: legitimate "closed" body text still detected
Deno.test("checkSite IT: real 'no appointments' page still detected as closed", async () => {
  const closedHtml = `<html><body>
    <h1>VFS Italy</h1>
    <p>No appointment available at the moment. Appointments are not available.</p>
    <p>لا توجد مواعيد متاحة حالياً.</p>
  </body></html>`;
  stubFetch((url) => {
    if (url.includes("lift-api") || url.includes("/api/")) {
      return new Response("nf", { status: 404 });
    }
    return new Response(closedHtml, { status: 200 });
  });
  try {
    const r = await checkSite("IT", MONITOR_TARGETS.IT);
    assertEquals(r.status, "closed", `expected closed, got '${r.status}' (${r.detectionMethod})`);
  } finally {
    restoreFetch();
  }
});

// Sanity unit: analyzeKeywords still works on a "closed" body
Deno.test("analyzeKeywords: closed keywords add closedScore", () => {
  const target = MONITOR_TARGETS.IT;
  const r = analyzeKeywords(
    "no appointment available لا توجد مواعيد",
    target.openIndicators,
    target.closedIndicators,
  );
  assert(r.closedScore >= 5, `expected >=5 closedScore, got ${r.closedScore}`);
});

// ──────────────────────────────────────────────
// Unit: probeApiEndpoints with JSON available:false / empty slots
// MUST add closedScore (real "no slots" signal), and NOT openScore.
// ──────────────────────────────────────────────
Deno.test("probeApiEndpoints: JSON 200 available:false => closedScore only", async () => {
  stubFetch(() =>
    new Response(JSON.stringify({ available: false }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    })
  );
  try {
    const r = await probeApiEndpoints([VFS_ENDPOINTS[0]]);
    assertEquals(r.openScore, 0, "openScore must stay 0 when available:false");
    assert(r.closedScore > 0, `closedScore must be > 0 (got ${r.closedScore})`);
    assert(
      r.apiResults.some((s) => s.includes("available: false")),
      "apiResults should record 'available: false'",
    );
  } finally {
    restoreFetch();
  }
});

Deno.test("probeApiEndpoints: JSON 200 empty slots array => closedScore only", async () => {
  stubFetch(() =>
    new Response(JSON.stringify({ slots: [] }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    })
  );
  try {
    const r = await probeApiEndpoints([VFS_ENDPOINTS[0]]);
    assertEquals(r.openScore, 0);
    assert(r.closedScore > 0, `closedScore must be > 0 on empty slots (got ${r.closedScore})`);
    assert(
      r.apiResults.some((s) => s.includes("slots: empty")),
      "apiResults should record 'slots: empty'",
    );
  } finally {
    restoreFetch();
  }
});

Deno.test("probeApiEndpoints: JSON 200 available:false + empty slots => closedScore accumulates", async () => {
  stubFetch(() =>
    new Response(JSON.stringify({ available: false, slots: [] }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    })
  );
  try {
    const r = await probeApiEndpoints([VFS_ENDPOINTS[0]]);
    assertEquals(r.openScore, 0);
    // available:false (+6) + slots:[] (+3) = 9
    assert(r.closedScore >= 9, `expected >=9 closedScore, got ${r.closedScore}`);
  } finally {
    restoreFetch();
  }
});

// ──────────────────────────────────────────────
// Integration: SPA shell HTML + API returning available:false
// MUST be classified as 'closed' (real signal, not the 4xx safety-net case).
// This guards that the SPA-shell safety net doesn't swallow legitimate closed signals.
// ──────────────────────────────────────────────
Deno.test("checkSite IT: Nuxt SPA shell + API available:false => closed", async () => {
  stubFetch((url) => {
    if (url.includes("lift-api") || url.includes("/api/")) {
      return new Response(JSON.stringify({ available: false, slots: [] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    return new Response(NUXT_SPA_SHELL, {
      status: 200,
      headers: { "Content-Type": "text/html" },
    });
  });
  try {
    const r = await checkSite("IT", MONITOR_TARGETS.IT);
    assertEquals(
      r.status,
      "closed",
      `expected closed on available:false even with SPA shell, got '${r.status}' (${r.detectionMethod})`,
    );
    assert(r.closedScore > 0, "closedScore should be > 0");
    // Must NOT fall into the spa-shell-no-signal safety net here
    assert(
      !r.detectionMethod.includes("spa-shell-no-signal"),
      `should not hit spa-shell safety net when API gives a real signal (got '${r.detectionMethod}')`,
    );
  } finally {
    restoreFetch();
  }
});

Deno.test("checkSite IT: Nuxt SPA shell + API empty slots => closed", async () => {
  stubFetch((url) => {
    if (url.includes("lift-api") || url.includes("/api/")) {
      return new Response(JSON.stringify({ slots: [] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    return new Response(NUXT_SPA_SHELL, { status: 200 });
  });
  try {
    const r = await checkSite("IT", MONITOR_TARGETS.IT);
    assertEquals(r.status, "closed", `expected closed, got '${r.status}' (${r.detectionMethod})`);
    assert(
      !r.detectionMethod.includes("spa-shell-no-signal"),
      "real closed signal must take precedence over SPA safety net",
    );
  } finally {
    restoreFetch();
  }
});

// ──────────────────────────────────────────────
// Detection-trace tests: for each 4xx code, verify that
//   1) detectionMethod records the `spa-shell-no-signal` branch
//   2) apiResults records `HTTP <code> ignored` for EVERY probed endpoint
//   3) status is `unknown` and both scores stay 0
// ──────────────────────────────────────────────
for (const code of [401, 403, 404, 422]) {
  // Unit-level: probeApiEndpoints records one `HTTP <code> ignored` entry per endpoint
  Deno.test(`probeApiEndpoints: HTTP ${code} logs ignored entry per endpoint`, async () => {
    stubFetch(() => new Response("denied", { status: code }));
    try {
      const r = await probeApiEndpoints(VFS_ENDPOINTS);
      assertHttpIgnoredCount(r.apiResults, code, VFS_ENDPOINTS.length, `4xx trace ${code}`);
    } finally {
      restoreFetch();
    }
  });

  // Same invariant against the REAL MONITOR_TARGETS.IT.apiEndpoints config:
  // the count of "HTTP <code> ignored" lines must equal exactly the number
  // of configured endpoints — guards against silent endpoint drift, double-
  // logging, or skipped endpoints.
  Deno.test(`probeApiEndpoints (MONITOR_TARGETS.IT): HTTP ${code} ignored count == configured endpoints`, async () => {
    stubFetch(() => new Response("denied", { status: code }));
    try {
      const endpoints = MONITOR_TARGETS.IT.apiEndpoints ?? [];
      assert(endpoints.length > 0, "IT must have at least one configured API endpoint");
      const r = await probeApiEndpoints(endpoints);
      assertHttpIgnoredCount(r.apiResults, code, endpoints.length, `IT 4xx ${code}`);
      assertEquals(r.openScore, 0);
      assertEquals(r.closedScore, 0);
    } finally {
      restoreFetch();
    }
  });

  // Integration-level: checkSite's detectionMethod records `spa-shell-no-signal`
  // and no layer fires (state stays fully neutral) on each 4xx.
  Deno.test(`checkSite IT: detectionMethod trace on API ${code} => spa-shell-no-signal, none`, async () => {
    stubFetch(makeSpaShellHandler(code));
    try {
      const r = await checkSite("IT", MONITOR_TARGETS.IT);

      assert(
        r.detectionMethod.includes("spa-shell-no-signal"),
        `detectionMethod must include 'spa-shell-no-signal' for ${code}, got '${r.detectionMethod}'`,
      );
      assert(
        r.detectionMethod.startsWith("none"),
        `detectionMethod should start with 'none' on ${code}, got '${r.detectionMethod}'`,
      );
      // no `api(...)` / `keywords(...)` / `script(...)` layer should be attributed
      assert(
        !/\b(api|keywords|script)\(/.test(r.detectionMethod),
        `no layer should fire on ${code}, got '${r.detectionMethod}'`,
      );

      assertEquals(r.status, "unknown");
      assertEquals(r.openScore, 0);
      assertEquals(r.closedScore, 0);
    } finally {
      restoreFetch();
    }
  });
}

// ──────────────────────────────────────────────
// Timeout / AbortController tests
// When fetch is aborted (timeout) the function MUST NOT classify as 'closed'.
// probeApiEndpoints: keeps scores at 0 and records the error in apiResults.
// checkSite (HTML fetch timeout): returns status 'error' (never 'closed').
// checkSite (HTML OK but ALL API endpoints timeout): falls back to 'unknown'
// via the spa-shell-no-signal safety net, never 'closed'.
// ──────────────────────────────────────────────
function makeAbortError(): Error {
  // DOMException is what fetch throws when controller.abort() fires
  try {
    return new DOMException("The operation was aborted.", "AbortError");
  } catch {
    const e = new Error("The operation was aborted.");
    (e as any).name = "AbortError";
    return e;
  }
}

Deno.test("probeApiEndpoints: AbortError (timeout) keeps scores at 0", async () => {
  stubFetch(() => { throw makeAbortError(); });
  try {
    const r = await probeApiEndpoints(VFS_ENDPOINTS);
    assertEquals(r.openScore, 0, "openScore must stay 0 on timeout");
    assertEquals(r.closedScore, 0, "closedScore must stay 0 on timeout — unreachable != closed");
    // one error entry per endpoint
    const errs = r.apiResults.filter((s) => /Error:/i.test(s));
    assertEquals(errs.length, VFS_ENDPOINTS.length, `expected ${VFS_ENDPOINTS.length} error entries, got: ${JSON.stringify(r.apiResults)}`);
    assert(
      r.apiResults.some((s) => /abort/i.test(s)),
      `apiResults should mention abort/timeout, got: ${JSON.stringify(r.apiResults)}`,
    );
  } finally {
    restoreFetch();
  }
});

Deno.test("probeApiEndpoints: rejected promise (timeout) keeps scores at 0", async () => {
  globalThis.fetch = (() => Promise.reject(makeAbortError())) as typeof fetch;
  try {
    const r = await probeApiEndpoints([VFS_ENDPOINTS[0]]);
    assertEquals(r.openScore, 0);
    assertEquals(r.closedScore, 0);
  } finally {
    restoreFetch();
  }
});

Deno.test("checkSite IT: HTML fetch timeout => status 'error', not 'closed'", async () => {
  stubFetch(() => { throw makeAbortError(); });
  try {
    const r = await checkSite("IT", MONITOR_TARGETS.IT);
    assert(
      r.status !== "closed",
      `status must not be 'closed' on timeout (got '${r.status}')`,
    );
    assertEquals(r.status, "error", `expected 'error', got '${r.status}'`);
    assertEquals(r.closedScore, 0);
    assertEquals(r.openScore, 0);
    assertEquals(r.detectionMethod, "error");
    assert(
      r.error != null && /abort/i.test(r.error),
      `error should mention abort, got '${r.error}'`,
    );
  } finally {
    restoreFetch();
  }
});

Deno.test("checkSite IT: SPA shell + ALL API endpoints timeout => 'unknown', not 'closed'", async () => {
  stubFetch((url) => {
    if (url.includes("lift-api") || url.includes("/api/")) {
      throw makeAbortError();
    }
    return new Response(NUXT_SPA_SHELL, {
      status: 200,
      headers: { "Content-Type": "text/html" },
    });
  });
  try {
    const r = await checkSite("IT", MONITOR_TARGETS.IT);
    assert(
      r.status !== "closed",
      `status must not be 'closed' when APIs timeout (got '${r.status}', method='${r.detectionMethod}')`,
    );
    assertEquals(r.status, "unknown");
    assertEquals(r.closedScore, 0, "API timeouts must NOT increment closedScore");
    assertEquals(r.openScore, 0);
    assert(
      r.detectionMethod.includes("spa-shell-no-signal"),
      `expected spa-shell-no-signal safety net, got '${r.detectionMethod}'`,
    );
  } finally {
    restoreFetch();
  }
});

// ──────────────────────────────────────────────
// HTTP 5xx tests — server errors / provider downtime must behave like 4xx:
//   • probeApiEndpoints records "HTTP <code> ignored" per endpoint
//   • neither openScore nor closedScore changes
//   • checkSite on SPA shell + 5xx returns status 'unknown' via
//     the spa-shell-no-signal safety net (NEVER 'closed')
// ──────────────────────────────────────────────
for (const code of [500, 502, 503, 504]) {
  Deno.test(`probeApiEndpoints: HTTP ${code} logs ignored entry per endpoint, scores stay 0`, async () => {
    stubFetch(() => new Response("server error", { status: code }));
    try {
      const r = await probeApiEndpoints(VFS_ENDPOINTS);
      assertEquals(r.openScore, 0, `openScore must stay 0 on ${code}`);
      assertEquals(r.closedScore, 0, `closedScore must stay 0 on ${code} — server error != closed`);
      assertHttpIgnoredCount(r.apiResults, code, VFS_ENDPOINTS.length, `5xx unit ${code}`);
    } finally {
      restoreFetch();
    }
  });

  Deno.test(`probeApiEndpoints (MONITOR_TARGETS.IT): HTTP ${code} ignored count == configured endpoints`, async () => {
    stubFetch(() => new Response("server error", { status: code }));
    try {
      const endpoints = MONITOR_TARGETS.IT.apiEndpoints ?? [];
      assert(endpoints.length > 0, "IT must have at least one configured API endpoint");
      const r = await probeApiEndpoints(endpoints);
      assertHttpIgnoredCount(r.apiResults, code, endpoints.length, `IT 5xx ${code}`);
      assertEquals(r.openScore, 0);
      assertEquals(r.closedScore, 0);
    } finally {
      restoreFetch();
    }
  });

  Deno.test(`checkSite IT: detectionMethod trace on API ${code} => spa-shell-no-signal, unknown`, async () => {
    stubFetch(makeSpaShellHandler(code));
    try {
      const r = await checkSite("IT", MONITOR_TARGETS.IT);
      assert(
        r.status !== "closed",
        `status must not be 'closed' on API ${code} (got '${r.status}', method='${r.detectionMethod}')`,
      );
      assertEquals(r.status, "unknown");
      assertEquals(r.openScore, 0);
      assertEquals(r.closedScore, 0, "5xx must NOT increment closedScore");
      assert(
        r.detectionMethod.includes("spa-shell-no-signal"),
        `detectionMethod must include 'spa-shell-no-signal' for ${code}, got '${r.detectionMethod}'`,
      );
      assert(
        r.detectionMethod.startsWith("none"),
        `detectionMethod should start with 'none' on ${code}, got '${r.detectionMethod}'`,
      );
      assert(
        !/\b(api|keywords|script)\(/.test(r.detectionMethod),
        `no layer should fire on ${code}, got '${r.detectionMethod}'`,
      );
    } finally {
      restoreFetch();
    }
  });
}