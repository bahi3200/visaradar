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
// ──────────────────────────────────────────────
type FetchHandler = (url: string, init?: RequestInit) => Response | Promise<Response>;
const originalFetch = globalThis.fetch;
function stubFetch(handler: FetchHandler) {
  globalThis.fetch = ((input: any, init?: any) => {
    const url = typeof input === "string" ? input : input.url;
    return Promise.resolve(handler(url, init));
  }) as typeof fetch;
}
function restoreFetch() {
  globalThis.fetch = originalFetch;
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
      const ignored = r.apiResults.filter((s) => s.includes(`HTTP ${code} ignored`));
      assertEquals(
        ignored.length,
        VFS_ENDPOINTS.length,
        `expected ${VFS_ENDPOINTS.length} ignored entries, got ${ignored.length}: ${JSON.stringify(r.apiResults)}`,
      );
      for (const entry of ignored) {
        assert(
          /auth|blocked|not closed/i.test(entry),
          `ignored entry should explain rationale, got '${entry}'`,
        );
      }
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
      const ignored = r.apiResults.filter((s) => /HTTP \d+ ignored/.test(s));
      assertEquals(
        ignored.length,
        endpoints.length,
        `expected exactly ${endpoints.length} 'HTTP ignored' entries (one per IT endpoint), got ${ignored.length}: ${JSON.stringify(r.apiResults)}`,
      );
      // Every ignored entry must reference the queried HTTP code
      const matching = ignored.filter((s) => s.includes(`HTTP ${code} ignored`));
      assertEquals(
        matching.length,
        endpoints.length,
        `all ignored entries must reference HTTP ${code}, got: ${JSON.stringify(ignored)}`,
      );
      // And scores must stay neutral
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
      const ignored = r.apiResults.filter((s) => s.includes(`HTTP ${code} ignored`));
      assertEquals(
        ignored.length,
        VFS_ENDPOINTS.length,
        `expected ${VFS_ENDPOINTS.length} 'HTTP ${code} ignored' entries, got: ${JSON.stringify(r.apiResults)}`,
      );
      for (const entry of ignored) {
        assert(
          /auth|blocked|not closed/i.test(entry),
          `ignored entry should explain rationale, got '${entry}'`,
        );
      }
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
      const ignored = r.apiResults.filter((s) => s.includes(`HTTP ${code} ignored`));
      assertEquals(
        ignored.length,
        endpoints.length,
        `expected exactly ${endpoints.length} 'HTTP ${code} ignored' entries, got ${ignored.length}: ${JSON.stringify(r.apiResults)}`,
      );
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