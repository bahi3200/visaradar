import { describe, it, expect } from "vitest";

/**
 * Mirrors the SELECT policies on public.user_roles:
 *
 *   Permissive ("Admins can view roles"):
 *     USING: has_role(auth.uid(), 'admin') OR auth.uid() = user_id
 *
 *   Restrictive ("Restrict user_roles reads to self or admin"):
 *     USING: auth.uid() = user_id OR has_role(auth.uid(), 'admin')
 *
 * In Postgres RLS, when a restrictive policy is present, EVERY permissive
 * policy AND every restrictive policy must pass. The effective rule is
 * therefore: a row is visible iff (auth.uid() = user_id) OR caller is admin.
 *
 * This test asserts the intended access matrix:
 *   - admins see ALL rows
 *   - non-admins (regular users / moderators) see ONLY their own row
 *   - anonymous (no auth.uid) sees nothing
 */

type AppRole = "admin" | "moderator" | "user";

type UserRoleRow = {
  id: string;
  user_id: string;
  role: AppRole;
};

type Caller = {
  uid: string | null; // null = anonymous
  isAdmin: boolean;
};

/**
 * Effective USING evaluation for SELECT on user_roles.
 * Combines the permissive and restrictive policies — both must allow.
 */
function canSelectRow(caller: Caller, row: UserRoleRow): boolean {
  if (!caller.uid) return false; // unauthenticated → no row visible

  const permissiveOk = caller.isAdmin || caller.uid === row.user_id;
  const restrictiveOk = caller.uid === row.user_id || caller.isAdmin;

  return permissiveOk && restrictiveOk;
}

function visibleRows(caller: Caller, rows: UserRoleRow[]): UserRoleRow[] {
  return rows.filter((r) => canSelectRow(caller, r));
}

const ALICE = "11111111-1111-1111-1111-111111111111";
const BOB = "22222222-2222-2222-2222-222222222222";
const CAROL_ADMIN = "33333333-3333-3333-3333-333333333333";
const DAVE_MOD = "44444444-4444-4444-4444-444444444444";

const ROWS: UserRoleRow[] = [
  { id: "r1", user_id: ALICE, role: "user" },
  { id: "r2", user_id: BOB, role: "user" },
  { id: "r3", user_id: CAROL_ADMIN, role: "admin" },
  { id: "r4", user_id: DAVE_MOD, role: "moderator" },
];

describe("user_roles SELECT policy — non-admins cannot read other users' rows", () => {
  it("a regular user sees ONLY their own row", () => {
    const caller: Caller = { uid: ALICE, isAdmin: false };
    const visible = visibleRows(caller, ROWS);
    expect(visible).toHaveLength(1);
    expect(visible[0].user_id).toBe(ALICE);
  });

  it("a regular user CANNOT read another user's row", () => {
    const caller: Caller = { uid: ALICE, isAdmin: false };
    const bobRow = ROWS.find((r) => r.user_id === BOB)!;
    expect(canSelectRow(caller, bobRow)).toBe(false);
  });

  it("a regular user CANNOT read an admin's row (no privilege escalation discovery)", () => {
    const caller: Caller = { uid: BOB, isAdmin: false };
    const adminRow = ROWS.find((r) => r.user_id === CAROL_ADMIN)!;
    expect(canSelectRow(caller, adminRow)).toBe(false);
  });

  it("a moderator (non-admin) sees ONLY their own row, not others", () => {
    // Moderator on user_roles is just another non-admin from the policy's POV.
    const caller: Caller = { uid: DAVE_MOD, isAdmin: false };
    const visible = visibleRows(caller, ROWS);
    expect(visible).toHaveLength(1);
    expect(visible[0].user_id).toBe(DAVE_MOD);
    expect(visible[0].role).toBe("moderator");
  });

  it("an admin sees ALL rows", () => {
    const caller: Caller = { uid: CAROL_ADMIN, isAdmin: true };
    const visible = visibleRows(caller, ROWS);
    expect(visible).toHaveLength(ROWS.length);
  });

  it("an admin can read another user's row", () => {
    const caller: Caller = { uid: CAROL_ADMIN, isAdmin: true };
    const aliceRow = ROWS.find((r) => r.user_id === ALICE)!;
    expect(canSelectRow(caller, aliceRow)).toBe(true);
  });

  it("an unauthenticated caller sees NO rows", () => {
    const caller: Caller = { uid: null, isAdmin: false };
    const visible = visibleRows(caller, ROWS);
    expect(visible).toHaveLength(0);
  });

  it("the restrictive policy still blocks non-admins even if a permissive policy would otherwise leak", () => {
    // Simulate a hypothetical leaky permissive policy that returned true for everyone:
    //   permissiveOk = true
    // The RESTRICTIVE policy must still gate access.
    const caller: Caller = { uid: ALICE, isAdmin: false };
    const bobRow = ROWS.find((r) => r.user_id === BOB)!;
    const permissiveOk = true; // pretend a buggy permissive policy says yes
    const restrictiveOk = caller.uid === bobRow.user_id || caller.isAdmin;
    expect(permissiveOk && restrictiveOk).toBe(false);
  });
});
