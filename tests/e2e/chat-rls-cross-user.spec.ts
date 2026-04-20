import { test, expect } from "../../playwright-fixture";
import { createClient } from "@supabase/supabase-js";

/**
 * E2E: RLS rejects inserting a chat message into another user's conversation.
 *
 * Flow:
 *   1. Create two real auth users (A and B) via signUp.
 *   2. As user A, create a chat_conversations row owned by A.
 *   3. Sign in as user B, then try to INSERT a chat_messages row whose
 *      conversation_id points at A's conversation.
 *   4. Assert the database REJECTS the insert (RLS WITH CHECK fails).
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

async function deleteE2eUser(email: string): Promise<boolean> {
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
    body: JSON.stringify({ email, action: "delete" }),
  });
  return res.ok;
}

test.describe("chat_messages RLS — cross-user insert", () => {
  const createdEmails: string[] = [];

  test.afterEach(async () => {
    // Clean up all created test users from the live backend
    for (const email of createdEmails) {
      await deleteE2eUser(email);
    }
    createdEmails.length = 0;
  });

  test("rejects inserting a message into another user's conversation", async () => {
    const password = "TestPassw0rd!Strong";
    const emailA = uniqueEmail("rls-a");
    const emailB = uniqueEmail("rls-b");

    // Track emails for cleanup
    createdEmails.push(emailA, emailB);

    // ---- 1) Create user A and a conversation owned by A ----
    const clientA = newClient();
    const { data: signA, error: signAErr } = await clientA.auth.signUp({
      email: emailA,
      password,
    });
    expect(signAErr, `signUp A: ${signAErr?.message}`).toBeNull();
    const userA = signA.user;
    expect(userA?.id).toBeTruthy();

    // If the project requires email confirmation there will be no session.
    // Use the E2E admin edge function to confirm the address, then sign in.
    if (!signA.session) {
      const confirmed = await confirmE2eEmail(emailA);
      if (!confirmed) {
        test.skip(true, "Email confirmation required and E2E_ADMIN_SECRET is not configured — cannot bootstrap session.");
        return;
      }
      const { error: signInErr } = await clientA.auth.signInWithPassword({ email: emailA, password });
      expect(signInErr, `signIn A after confirm: ${signInErr?.message}`).toBeNull();
    }

    const { data: convo, error: convoErr } = await clientA
      .from("chat_conversations")
      .insert({ user_id: userA!.id, title: "owned-by-A" })
      .select("id")
      .single();
    expect(convoErr, `create convo A: ${convoErr?.message}`).toBeNull();
    expect(convo?.id).toBeTruthy();
    const convoId = convo!.id;

    // ---- 2) Create user B in a separate client/session ----
    const clientB = newClient();
    const { data: signB, error: signBErr } = await clientB.auth.signUp({
      email: emailB,
      password,
    });
    expect(signBErr, `signUp B: ${signBErr?.message}`).toBeNull();
    const userB = signB.user;
    expect(userB?.id).toBeTruthy();

    if (!signB.session) {
      const confirmed = await confirmE2eEmail(emailB);
      if (!confirmed) {
        test.skip(true, "Email confirmation required for user B and E2E_ADMIN_SECRET is not configured.");
        return;
      }
      const { error: signInErr } = await clientB.auth.signInWithPassword({ email: emailB, password });
      expect(signInErr, `signIn B after confirm: ${signInErr?.message}`).toBeNull();
    }

    // ---- 3a) B tries to insert into A's convo, with user_id = B (own id) ----
    const attemptOwnId = await clientB.from("chat_messages").insert({
      conversation_id: convoId,
      user_id: userB!.id,
      role: "user",
      content: "intrusion attempt 1",
    });
    expect(
      attemptOwnId.error,
      "RLS must reject B inserting into A's conversation"
    ).not.toBeNull();
    expect(attemptOwnId.error?.code).toMatch(/42501|^PGRST/); // RLS / PostgREST denial

    // ---- 3b) B tries to spoof user_id = A's id ----
    const attemptSpoof = await clientB.from("chat_messages").insert({
      conversation_id: convoId,
      user_id: userA!.id,
      role: "user",
      content: "intrusion attempt 2 (spoofed user_id)",
    });
    expect(
      attemptSpoof.error,
      "RLS must reject spoofed user_id inserts"
    ).not.toBeNull();

    // ---- 4) Sanity: A CAN insert into A's own conversation ----
    const allowed = await clientA.from("chat_messages").insert({
      conversation_id: convoId,
      user_id: userA!.id,
      role: "user",
      content: "legit message",
    });
    expect(allowed.error, `legit insert by A: ${allowed.error?.message}`).toBeNull();

    // ---- 5) Sign out both clients (best-effort cleanup) ----
    await clientA.auth.signOut();
    await clientB.auth.signOut();
  });
});
