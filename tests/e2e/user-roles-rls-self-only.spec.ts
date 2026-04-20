import { test, expect } from "../../playwright-fixture";
import { createClient } from "@supabase/supabase-js";

/**
 * E2E: SELECT on public.user_roles only returns the caller's own row.
 *
 * The combined permissive + restrictive RLS policies on user_roles should
 * limit a non-admin authenticated user to seeing exclusively rows where
 * `user_id = auth.uid()`.
 *
 * Flow:
 *   1. Sign up a fresh user via the public anon client.
 *   2. Confirm the user's email via the `e2e-confirm-user` admin function so
 *      a real authenticated session can be established.
 *   3. Sign in with password to obtain that session.
 *   4. Run a SELECT * FROM user_roles and assert:
 *        - request succeeds (no error)
 *        - every returned row has user_id === auth user id
 *        - they cannot see any other user's row (e.g. the seeded admin)
 */

const SUPABASE_URL = "https://frhrvkzkihxaopnsznrj.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZyaHJ2a3praWh4YW9wbnN6bnJqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY0NzE0OTYsImV4cCI6MjA5MjA0NzQ5Nn0.lNR_XeuQCxWgSvm6GlHJf0oTFtyBiCHy43_aIrFrSgc";

function newClient() {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function uniqueEmail(prefix: string) {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  return `${prefix}-${stamp}@e2e.test.local`;
}

async function confirmE2eEmail(email: string): Promise<boolean> {
  const secret = process.env.E2E_ADMIN_SECRET;
  if (!secret) return false;
  const res = await fetch(`${SUPABASE_URL}/functions/v1/e2e-confirm-user`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-e2e-secret": secret,
      apikey: SUPABASE_ANON_KEY,
      authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    },
    body: JSON.stringify({ email, action: "confirm" }),
  });
  return res.ok;
}

test.describe("user_roles RLS — SELECT returns only the caller's own row", () => {
  test("a regular user only sees their own user_roles row (and not other users')", async () => {
    const password = "TestPassw0rd!Strong";
    const email = uniqueEmail("urls-self");

    const client = newClient();
    const { data: signUp, error: signUpErr } = await client.auth.signUp({
      email,
      password,
    });
    expect(signUpErr, `signUp: ${signUpErr?.message}`).toBeNull();
    const user = signUp.user;
    expect(user?.id).toBeTruthy();

    // If email confirmation is required, no session is returned. Use the
    // E2E admin edge function to confirm the address, then sign in.
    if (!signUp.session) {
      const confirmed = await confirmE2eEmail(email);
      if (!confirmed) {
        test.skip(
          true,
          "Email confirmation required and E2E_ADMIN_SECRET is not configured — cannot bootstrap session.",
        );
        return;
      }
      const { error: signInErr } = await client.auth.signInWithPassword({ email, password });
      expect(signInErr, `signIn after confirm: ${signInErr?.message}`).toBeNull();
    }

    // Sanity: this user is NOT an admin. has_role() should be false.
    // The INSERT policy on user_roles only permits admins to insert, so
    // the user starts with zero rows in user_roles. We do not try to insert
    // a row here because that would (correctly) be rejected by RLS.

    const { data: rows, error: selectErr } = await client
      .from("user_roles")
      .select("id,user_id,role");

    // The query itself must succeed — RLS hides rows, it does not error.
    expect(selectErr, `select user_roles: ${selectErr?.message}`).toBeNull();
    expect(Array.isArray(rows)).toBe(true);

    // Every visible row, if any, MUST belong to the caller. No exceptions.
    for (const row of rows ?? []) {
      expect(
        row.user_id,
        `RLS leaked a row owned by another user: ${JSON.stringify(row)}`
      ).toBe(user!.id);
    }

    // And no row should claim the 'admin' role for this fresh user.
    const adminRows = (rows ?? []).filter((r) => r.role === "admin");
    expect(adminRows).toHaveLength(0);

    await client.auth.signOut();
  });
});