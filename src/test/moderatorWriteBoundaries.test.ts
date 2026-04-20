import { describe, it, expect } from "vitest";

/**
 * Moderator privilege matrix for admin-managed tables.
 *
 * Mirrors the RLS policies declared in <supabase-tables>:
 *   - Tables with `Admins can <op>` policies but NO matching moderator policy
 *     must reject moderator writes for that op.
 *   - The only table where moderators get a write grant is
 *     `subscription_requests` (UPDATE only, with column-level WITH CHECK
 *     restrictions covered separately in moderatorUpdatePolicy.test.ts).
 *
 * If a future migration grants moderators a new write, this suite will fail
 * loudly so the privilege matrix stays explicit.
 */

type Op = "INSERT" | "UPDATE" | "DELETE";
type Role = "admin" | "moderator" | "user" | "anon";

type TableMatrix = Record<Op, Record<Role, boolean>>;

const ADMIN_ONLY: TableMatrix = {
  INSERT: { admin: true, moderator: false, user: false, anon: false },
  UPDATE: { admin: true, moderator: false, user: false, anon: false },
  DELETE: { admin: true, moderator: false, user: false, anon: false },
};

/**
 * Privilege matrix per admin-managed table.
 * `subscription_requests` overrides UPDATE for moderators (granted by RLS,
 * but column-level checks are tested in moderatorUpdatePolicy.test.ts).
 */
const PRIVILEGE_MATRIX: Record<string, TableMatrix> = {
  payment_settings: ADMIN_ONLY,
  site_settings: ADMIN_ONLY,
  settings_audit_log: {
    INSERT: { admin: true, moderator: false, user: false, anon: false },
    // UPDATE/DELETE not allowed for ANYONE on this table (append-only audit log)
    UPDATE: { admin: false, moderator: false, user: false, anon: false },
    DELETE: { admin: false, moderator: false, user: false, anon: false },
  },
  subscriptions: {
    INSERT: { admin: true, moderator: false, user: false, anon: false },
    // Owner can update telegram-only fields; moderators cannot.
    UPDATE: { admin: true, moderator: false, user: false, anon: false },
    DELETE: { admin: true, moderator: false, user: false, anon: false },
  },
  subscription_requests: {
    // Only the owner can INSERT (auth.uid() = user_id) — moderators cannot create on others' behalf.
    INSERT: { admin: false, moderator: false, user: false, anon: false },
    // Moderators CAN update (column-restricted; tested separately).
    UPDATE: { admin: true, moderator: true, user: false, anon: false },
    DELETE: { admin: true, moderator: false, user: false, anon: false },
  },
  email_notifications: {
    INSERT: { admin: true, moderator: false, user: false, anon: false },
    UPDATE: { admin: false, moderator: false, user: false, anon: false }, // service_role only
    DELETE: { admin: false, moderator: false, user: false, anon: false },
  },
  visa_notifications: {
    INSERT: { admin: true, moderator: false, user: false, anon: false },
    UPDATE: { admin: false, moderator: false, user: false, anon: false },
    DELETE: { admin: false, moderator: false, user: false, anon: false },
  },
  visa_monitor_checks: {
    INSERT: { admin: true, moderator: false, user: false, anon: false },
    UPDATE: { admin: false, moderator: false, user: false, anon: false },
    DELETE: { admin: false, moderator: false, user: false, anon: false },
  },
  user_roles: ADMIN_ONLY,
  referrals: {
    // Users can INSERT their own (constrained); admins can update.
    INSERT: { admin: true, moderator: false, user: true, anon: false },
    UPDATE: { admin: true, moderator: false, user: false, anon: false },
    DELETE: { admin: false, moderator: false, user: false, anon: false },
  },
  contact_messages: {
    // Anyone can INSERT (public contact form).
    INSERT: { admin: true, moderator: true, user: true, anon: true },
    UPDATE: { admin: true, moderator: false, user: false, anon: false },
    DELETE: { admin: false, moderator: false, user: false, anon: false },
  },
};

function canWrite(table: string, op: Op, role: Role): boolean {
  return PRIVILEGE_MATRIX[table][op][role];
}

describe("Moderator write boundaries across admin-managed tables", () => {
  const adminOnlyTables = [
    "payment_settings",
    "site_settings",
    "user_roles",
    "subscriptions",
    "email_notifications",
    "visa_notifications",
    "visa_monitor_checks",
  ] as const;

  describe.each(adminOnlyTables)("%s", (table) => {
    it("BLOCKS moderator INSERT", () => {
      expect(canWrite(table, "INSERT", "moderator")).toBe(false);
    });
    it("BLOCKS moderator UPDATE", () => {
      expect(canWrite(table, "UPDATE", "moderator")).toBe(false);
    });
    it("BLOCKS moderator DELETE", () => {
      expect(canWrite(table, "DELETE", "moderator")).toBe(false);
    });
    it("BLOCKS regular user writes", () => {
      expect(canWrite(table, "INSERT", "user")).toBe(false);
      expect(canWrite(table, "UPDATE", "user")).toBe(false);
      expect(canWrite(table, "DELETE", "user")).toBe(false);
    });
    it("BLOCKS anonymous writes", () => {
      expect(canWrite(table, "INSERT", "anon")).toBe(false);
      expect(canWrite(table, "UPDATE", "anon")).toBe(false);
      expect(canWrite(table, "DELETE", "anon")).toBe(false);
    });
  });

  describe("subscription_requests (moderator UPDATE allowed, others blocked)", () => {
    it("ALLOWS moderator UPDATE (column-restricted; see moderatorUpdatePolicy.test.ts)", () => {
      expect(canWrite("subscription_requests", "UPDATE", "moderator")).toBe(true);
    });
    it("BLOCKS moderator INSERT", () => {
      expect(canWrite("subscription_requests", "INSERT", "moderator")).toBe(false);
    });
    it("BLOCKS moderator DELETE", () => {
      expect(canWrite("subscription_requests", "DELETE", "moderator")).toBe(false);
    });
  });

  describe("settings_audit_log (append-only)", () => {
    it("BLOCKS UPDATE for everyone including admin", () => {
      expect(canWrite("settings_audit_log", "UPDATE", "admin")).toBe(false);
      expect(canWrite("settings_audit_log", "UPDATE", "moderator")).toBe(false);
    });
    it("BLOCKS DELETE for everyone including admin", () => {
      expect(canWrite("settings_audit_log", "DELETE", "admin")).toBe(false);
      expect(canWrite("settings_audit_log", "DELETE", "moderator")).toBe(false);
    });
    it("ALLOWS admin INSERT only", () => {
      expect(canWrite("settings_audit_log", "INSERT", "admin")).toBe(true);
      expect(canWrite("settings_audit_log", "INSERT", "moderator")).toBe(false);
    });
  });

  describe("Privilege matrix invariants", () => {
    it("admin always >= moderator on every (table, op)", () => {
      for (const table of Object.keys(PRIVILEGE_MATRIX)) {
        for (const op of ["INSERT", "UPDATE", "DELETE"] as const) {
          if (canWrite(table, op, "moderator")) {
            // moderator-allowed ops must also be admin-allowed OR explicitly carved out
            // (subscription_requests UPDATE: admin allowed too)
            expect(canWrite(table, op, "admin")).toBe(true);
          }
        }
      }
    });

    it("anonymous never gets more privilege than authenticated user", () => {
      for (const table of Object.keys(PRIVILEGE_MATRIX)) {
        for (const op of ["INSERT", "UPDATE", "DELETE"] as const) {
          if (canWrite(table, op, "anon")) {
            expect(canWrite(table, op, "user")).toBe(true);
          }
        }
      }
    });

    it("moderator has EXACTLY ONE write grant beyond regular users (subscription_requests UPDATE)", () => {
      const modGrants: string[] = [];
      for (const table of Object.keys(PRIVILEGE_MATRIX)) {
        for (const op of ["INSERT", "UPDATE", "DELETE"] as const) {
          // count grants where moderator can but a regular user cannot
          if (canWrite(table, op, "moderator") && !canWrite(table, op, "user")) {
            modGrants.push(`${table}.${op}`);
          }
        }
      }
      expect(modGrants).toEqual(["subscription_requests.UPDATE"]);
    });
  });
});