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
      assert(
        r.apiResults.some((s) => s.includes(`HTTP ${code} ignored`)),
        `apiResults should record the ignored ${code} response`,
      );
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