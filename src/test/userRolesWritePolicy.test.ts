import { describe, it, expect } from "vitest";

/**
 * Mirrors the INSERT / UPDATE / DELETE policies on public.user_roles:
 *
 *   INSERT ("Only admins can insert roles"):
 *     WITH CHECK: has_role(auth.uid(), 'admin')
 *
 *   UPDATE ("Only admins can update roles"):
 *     USING: has_role(auth.uid(), 'admin')
 *
 *   DELETE ("Only admins can delete roles"):
 *     USING: has_role(auth.uid(), 'admin')
 *
 * No permissive policy exists for these commands for non-admin users, so by
 * default every non-admin write must be rejected — this is the gate that
 * prevents privilege escalation (e.g. a regular user inserting an 'admin'
 * row for themselves).
 *
 * This test asserts the intended write access matrix:
 *   - admins CAN insert / update / delete any row
 *   - non-admins (regular users / moderators) CANNOT insert / update / delete
 *     ANY row — not even one targeting their own user_id
 *   - anonymous callers CANNOT write
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

function canInsertRow(caller: Caller, _row: UserRoleRow): boolean {
  if (!caller.uid) return false;
  return caller.isAdmin; // WITH CHECK: has_role(uid, 'admin')
}

function canUpdateRow(caller: Caller, _row: UserRoleRow): boolean {
  if (!caller.uid) return false;
  return caller.isAdmin; // USING: has_role(uid, 'admin')
}

function canDeleteRow(caller: Caller, _row: UserRoleRow): boolean {
  if (!caller.uid) return false;
  return caller.isAdmin; // USING: has_role(uid, 'admin')
}

const ALICE = "11111111-1111-1111-1111-111111111111";
const BOB = "22222222-2222-2222-2222-222222222222";
const CAROL_ADMIN = "33333333-3333-3333-3333-333333333333";
const DAVE_MOD = "44444444-4444-4444-4444-444444444444";

const ALICE_USER_ROW: UserRoleRow = { id: "r1", user_id: ALICE, role: "user" };
const BOB_USER_ROW: UserRoleRow = { id: "r2", user_id: BOB, role: "user" };
const ADMIN_ROW: UserRoleRow = { id: "r3", user_id: CAROL_ADMIN, role: "admin" };

describe("user_roles write policies — only admins can INSERT / UPDATE / DELETE", () => {
  describe("INSERT", () => {
    it("admin CAN insert any role row", () => {
      const caller: Caller = { uid: CAROL_ADMIN, isAdmin: true };
      expect(canInsertRow(caller, { id: "new", user_id: BOB, role: "moderator" })).toBe(true);
    });

    it("regular user CANNOT insert an admin row for themselves (privilege escalation blocked)", () => {
      const caller: Caller = { uid: ALICE, isAdmin: false };
      const escalation: UserRoleRow = { id: "evil", user_id: ALICE, role: "admin" };
      expect(canInsertRow(caller, escalation)).toBe(false);
    });

    it("regular user CANNOT insert any row, even a 'user' row for themselves", () => {
      const caller: Caller = { uid: ALICE, isAdmin: false };
      expect(canInsertRow(caller, { id: "x", user_id: ALICE, role: "user" })).toBe(false);
    });

    it("regular user CANNOT insert a row targeting another user", () => {
      const caller: Caller = { uid: ALICE, isAdmin: false };
      expect(canInsertRow(caller, { id: "x", user_id: BOB, role: "admin" })).toBe(false);
    });

    it("moderator (non-admin) CANNOT insert any row, including granting themselves admin", () => {
      const caller: Caller = { uid: DAVE_MOD, isAdmin: false };
      expect(canInsertRow(caller, { id: "x", user_id: DAVE_MOD, role: "admin" })).toBe(false);
    });

    it("anonymous caller CANNOT insert", () => {
      const caller: Caller = { uid: null, isAdmin: false };
      expect(canInsertRow(caller, { id: "x", user_id: ALICE, role: "user" })).toBe(false);
    });
  });

  describe("UPDATE", () => {
    it("admin CAN update any row", () => {
      const caller: Caller = { uid: CAROL_ADMIN, isAdmin: true };
      expect(canUpdateRow(caller, BOB_USER_ROW)).toBe(true);
    });

    it("regular user CANNOT promote their own row to admin", () => {
      const caller: Caller = { uid: ALICE, isAdmin: false };
      expect(canUpdateRow(caller, ALICE_USER_ROW)).toBe(false);
    });

    it("regular user CANNOT update another user's row", () => {
      const caller: Caller = { uid: ALICE, isAdmin: false };
      expect(canUpdateRow(caller, BOB_USER_ROW)).toBe(false);
    });

    it("moderator (non-admin) CANNOT update any row", () => {
      const caller: Caller = { uid: DAVE_MOD, isAdmin: false };
      expect(canUpdateRow(caller, ADMIN_ROW)).toBe(false);
    });

    it("anonymous caller CANNOT update", () => {
      const caller: Caller = { uid: null, isAdmin: false };
      expect(canUpdateRow(caller, ALICE_USER_ROW)).toBe(false);
    });
  });

  describe("DELETE", () => {
    it("admin CAN delete any row", () => {
      const caller: Caller = { uid: CAROL_ADMIN, isAdmin: true };
      expect(canDeleteRow(caller, BOB_USER_ROW)).toBe(true);
    });

    it("regular user CANNOT delete their own row (cannot self-revoke or tamper)", () => {
      const caller: Caller = { uid: ALICE, isAdmin: false };
      expect(canDeleteRow(caller, ALICE_USER_ROW)).toBe(false);
    });

    it("regular user CANNOT delete an admin's row to take over", () => {
      const caller: Caller = { uid: ALICE, isAdmin: false };
      expect(canDeleteRow(caller, ADMIN_ROW)).toBe(false);
    });

    it("moderator (non-admin) CANNOT delete any row", () => {
      const caller: Caller = { uid: DAVE_MOD, isAdmin: false };
      expect(canDeleteRow(caller, ADMIN_ROW)).toBe(false);
    });

    it("anonymous caller CANNOT delete", () => {
      const caller: Caller = { uid: null, isAdmin: false };
      expect(canDeleteRow(caller, ALICE_USER_ROW)).toBe(false);
    });
  });
});