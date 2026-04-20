import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-e2e-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

/**
 * E2E-only admin endpoint: programmatically confirm a test user's email
 * (and optionally delete it) so Playwright can run authenticated assertions
 * against the live backend without skipping when email confirmation is on.
 *
 * SECURITY HARDENING:
 *  - Caller must present a shared secret (E2E_ADMIN_SECRET) via either the
 *    `x-e2e-secret` header or `{ secret }` body field. Constant-time compare.
 *  - Caller may only act on emails that match the e2e suffix
 *    (`@e2e.test.local`). Production users cannot be touched.
 *  - Only two actions are supported: `confirm` and `delete`.
 */

const E2E_EMAIL_SUFFIX = "@e2e.test.local";

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return json(405, { error: "method_not_allowed" });
  }

  const expected = Deno.env.get("E2E_ADMIN_SECRET");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const supabaseUrl = Deno.env.get("SUPABASE_URL");

  if (!expected || !serviceRoleKey || !supabaseUrl) {
    console.error("e2e-confirm-user: missing required env vars");
    return json(500, { error: "server_misconfigured" });
  }

  let body: { email?: unknown; action?: unknown; secret?: unknown };
  try {
    body = await req.json();
  } catch {
    return json(400, { error: "invalid_json" });
  }

  const headerSecret = req.headers.get("x-e2e-secret") ?? "";
  const bodySecret = typeof body.secret === "string" ? body.secret : "";
  const provided = headerSecret || bodySecret;
  if (!provided || !timingSafeEqual(provided, expected)) {
    return json(401, { error: "unauthorized" });
  }

  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const action = typeof body.action === "string" ? body.action : "confirm";

  if (!email || !email.endsWith(E2E_EMAIL_SUFFIX)) {
    return json(400, {
      error: "invalid_email",
      detail: `email must end with ${E2E_EMAIL_SUFFIX}`,
    });
  }
  if (action !== "confirm" && action !== "delete") {
    return json(400, { error: "invalid_action", detail: "must be 'confirm' or 'delete'" });
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Find the user by email by paging through admin.listUsers (no direct lookup
  // by email is exposed in the JS SDK).
  let target: { id: string; email?: string | null } | null = null;
  for (let page = 1; page <= 20 && !target; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) {
      console.error("listUsers error", error);
      return json(500, { error: "list_users_failed", detail: error.message });
    }
    target = data.users.find((u) => (u.email ?? "").toLowerCase() === email) ?? null;
    if (data.users.length < 1000) break;
  }

  if (!target) {
    return json(404, { error: "user_not_found", email });
  }

  if (action === "delete") {
    const { error } = await admin.auth.admin.deleteUser(target.id);
    if (error) {
      console.error("deleteUser error", error);
      return json(500, { error: "delete_failed", detail: error.message });
    }
    return json(200, { ok: true, action: "delete", user_id: target.id, email });
  }

  // confirm
  const { data, error } = await admin.auth.admin.updateUserById(target.id, {
    email_confirm: true,
  });
  if (error) {
    console.error("updateUserById error", error);
    return json(500, { error: "confirm_failed", detail: error.message });
  }

  return json(200, {
    ok: true,
    action: "confirm",
    user_id: target.id,
    email,
    email_confirmed_at: data.user?.email_confirmed_at ?? null,
  });
});