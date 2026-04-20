import {
  assertEquals,
  assertExists,
} from "https://deno.land/std@0.224.0/assert/mod.ts";

/**
 * Deno tests for the deployed `e2e-confirm-user` edge function.
 *
 * These tests assert the security guardrails on the rejection paths:
 *   - missing secret  -> 401
 *   - invalid secret  -> 401
 *   - non-@e2e.test.local email -> 400 invalid_email
 *   - unsupported action -> 400 invalid_action
 *   - non-POST method -> 405
 *   - invalid JSON body -> 400 invalid_json
 *
 * They run against the live deployed function so we exercise the same code
 * path the Playwright suite uses. They never mutate real users — every
 * rejection path returns before reaching the admin client.
 *
 * Required env:
 *   - SUPABASE_URL (defaults to the project URL)
 *   - SUPABASE_ANON_KEY (defaults to the project anon key)
 *   - E2E_ADMIN_SECRET (only used to assert that the *correct* secret is
 *     accepted by the email/action validators after auth passes)
 */

const SUPABASE_URL =
  Deno.env.get("SUPABASE_URL") ?? "https://frhrvkzkihxaopnsznrj.supabase.co";
const SUPABASE_ANON_KEY =
  Deno.env.get("SUPABASE_ANON_KEY") ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZyaHJ2a3praWh4YW9wbnN6bnJqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY0NzE0OTYsImV4cCI6MjA5MjA0NzQ5Nn0.lNR_XeuQCxWgSvm6GlHJf0oTFtyBiCHy43_aIrFrSgc";
const FUNCTION_URL = `${SUPABASE_URL}/functions/v1/e2e-confirm-user`;

function callFn(init: {
  method?: string;
  secret?: string | null;
  body?: unknown;
  rawBody?: string;
}) {
  const headers: Record<string, string> = {
    "content-type": "application/json",
    apikey: SUPABASE_ANON_KEY,
    authorization: `Bearer ${SUPABASE_ANON_KEY}`,
  };
  if (init.secret != null) headers["x-e2e-secret"] = init.secret;

  return fetch(FUNCTION_URL, {
    method: init.method ?? "POST",
    headers,
    body:
      init.rawBody !== undefined
        ? init.rawBody
        : init.body !== undefined
          ? JSON.stringify(init.body)
          : undefined,
  });
}

async function readJson(res: Response): Promise<Record<string, unknown>> {
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    return { _raw: text };
  }
}

Deno.test("e2e-confirm-user rejects missing secret with 401", async () => {
  const res = await callFn({
    secret: null,
    body: { email: "anything@e2e.test.local", action: "confirm" },
  });
  assertEquals(res.status, 401);
  const body = await readJson(res);
  assertEquals(body.error, "unauthorized");
});

Deno.test("e2e-confirm-user rejects invalid secret with 401", async () => {
  const res = await callFn({
    secret: "this-is-definitely-not-the-real-secret",
    body: { email: "anything@e2e.test.local", action: "confirm" },
  });
  assertEquals(res.status, 401);
  const body = await readJson(res);
  assertEquals(body.error, "unauthorized");
});

Deno.test("e2e-confirm-user rejects non-@e2e.test.local email with 400", async () => {
  const secret = Deno.env.get("E2E_ADMIN_SECRET");
  if (!secret) {
    console.warn("E2E_ADMIN_SECRET not set — skipping email validator test");
    return;
  }
  const res = await callFn({
    secret,
    body: { email: "victim@gmail.com", action: "confirm" },
  });
  assertEquals(res.status, 400);
  const body = await readJson(res);
  assertEquals(body.error, "invalid_email");
  assertExists(body.detail);
});

Deno.test(
  "e2e-confirm-user rejects empty / missing email with 400",
  async () => {
    const secret = Deno.env.get("E2E_ADMIN_SECRET");
    if (!secret) {
      console.warn("E2E_ADMIN_SECRET not set — skipping email validator test");
      return;
    }
    const res = await callFn({
      secret,
      body: { action: "confirm" },
    });
    assertEquals(res.status, 400);
    const body = await readJson(res);
    assertEquals(body.error, "invalid_email");
  },
);

Deno.test("e2e-confirm-user rejects unsupported action with 400", async () => {
  const secret = Deno.env.get("E2E_ADMIN_SECRET");
  if (!secret) {
    console.warn("E2E_ADMIN_SECRET not set — skipping action validator test");
    return;
  }
  const res = await callFn({
    secret,
    body: {
      email: `nope-${Date.now()}@e2e.test.local`,
      action: "promote-to-admin",
    },
  });
  assertEquals(res.status, 400);
  const body = await readJson(res);
  assertEquals(body.error, "invalid_action");
});

Deno.test("e2e-confirm-user rejects non-POST methods with 405", async () => {
  const res = await fetch(FUNCTION_URL, {
    method: "GET",
    headers: {
      apikey: SUPABASE_ANON_KEY,
      authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    },
  });
  assertEquals(res.status, 405);
  const body = await readJson(res);
  assertEquals(body.error, "method_not_allowed");
});

Deno.test("e2e-confirm-user rejects invalid JSON body with 400", async () => {
  const secret = Deno.env.get("E2E_ADMIN_SECRET") ?? "anything";
  const res = await callFn({
    secret,
    rawBody: "{not valid json",
  });
  assertEquals(res.status, 400);
  const body = await readJson(res);
  assertEquals(body.error, "invalid_json");
});