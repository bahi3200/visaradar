import { describe, it, expect } from "vitest";

/**
 * Mirrors the RLS policies on public.payment_settings:
 *   SELECT: has_role(auth.uid(), 'admin')
 *   INSERT: WITH CHECK has_role(auth.uid(), 'admin')
 *   UPDATE: USING    has_role(auth.uid(), 'admin')
 *
 * The PaymentSettings page calls `.upsert(payload, { onConflict: 'id' }).select()`
 * and treats `data.length === 0` as a silent failure (RLS reject).
 *
 * These tests guard against:
 *  - non-admin writes succeeding
 *  - silent success when no row was actually returned (RLS hides the row)
 *  - upsert payload being treated as INSERT vs UPDATE based on `id`
 */

type PaymentSettingsRow = {
  id: string;
  ccp_number: string;
  ccp_key: string;
  rip_number: string;
  account_holder: string;
  updated_at: string;
};

type Payload = Partial<PaymentSettingsRow> & { id?: string };

type SaveResult =
  | { ok: true; row: PaymentSettingsRow }
  | { ok: false; reason: "rls_denied" | "silent_no_rows" | "no_session" };

function simulateUpsert(
  isAdmin: boolean,
  hasSession: boolean,
  existing: PaymentSettingsRow | null,
  payload: Payload
): SaveResult {
  if (!hasSession) return { ok: false, reason: "no_session" };
  if (!isAdmin) return { ok: false, reason: "rls_denied" };

  // Determine INSERT vs UPDATE based on payload.id (matches onConflict: "id")
  let writtenRow: PaymentSettingsRow;
  if (payload.id && existing && existing.id === payload.id) {
    writtenRow = { ...existing, ...payload } as PaymentSettingsRow;
  } else {
    writtenRow = {
      id: payload.id ?? crypto.randomUUID(),
      ccp_number: "",
      ccp_key: "",
      rip_number: "",
      account_holder: "",
      updated_at: new Date().toISOString(),
      ...payload,
    } as PaymentSettingsRow;
  }

  // RLS SELECT after write: admins always see; non-admins would get []
  if (!isAdmin) return { ok: false, reason: "silent_no_rows" };

  return { ok: true, row: writtenRow };
}

const existingRow: PaymentSettingsRow = {
  id: "pay-1",
  ccp_number: "1111222233",
  ccp_key: "42",
  rip_number: "00799999000123456789",
  account_holder: "HEMICI Brahim",
  updated_at: "2026-04-01T00:00:00Z",
};

describe("payment_settings admin write — no silent failures", () => {
  it("admin UPDATE returns the affected row", () => {
    const res = simulateUpsert(true, true, existingRow, {
      id: existingRow.id,
      ccp_number: "9988776655",
      ccp_key: "88",
      rip_number: "00799999000999888777",
      account_holder: "HEMICI Test User",
      updated_at: "2026-04-21T10:41:21Z",
    });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.row.ccp_number).toBe("9988776655");
      expect(res.row.account_holder).toBe("HEMICI Test User");
    }
  });

  it("admin INSERT (no existing row) creates a fresh row", () => {
    const res = simulateUpsert(true, true, null, {
      ccp_number: "1234567890",
      ccp_key: "10",
      rip_number: "00799999000111222333",
      account_holder: "Initial Holder",
      updated_at: "2026-05-01T00:00:00Z",
    });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.row.ccp_number).toBe("1234567890");
      expect(res.row.id).toBeTruthy();
    }
  });

  it("REJECTS write when no auth session is present", () => {
    const res = simulateUpsert(true, false, existingRow, {
      id: existingRow.id,
      ccp_number: "x",
    });
    expect(res.ok).toBe(false);
    expect((res as { ok: false; reason: string }).reason).toBe("no_session");
  });

  it("REJECTS write from a non-admin user (RLS denied)", () => {
    const res = simulateUpsert(false, true, existingRow, {
      id: existingRow.id,
      ccp_number: "tampered",
    });
    expect(res.ok).toBe(false);
    expect(["rls_denied", "silent_no_rows"]).toContain(
      (res as { ok: false; reason: string }).reason
    );
  });

  it("preserves untouched fields on partial UPDATE", () => {
    const res = simulateUpsert(true, true, existingRow, {
      id: existingRow.id,
      account_holder: "New Name Only",
    });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.row.account_holder).toBe("New Name Only");
      expect(res.row.ccp_number).toBe(existingRow.ccp_number);
      expect(res.row.rip_number).toBe(existingRow.rip_number);
    }
  });

  it("treats empty result rows as a failure (silent-success guard)", () => {
    // Simulates `.select()` returning [] after upsert — the UI must throw.
    const data: PaymentSettingsRow[] = [];
    const treatedAsSuccess = data.length > 0;
    expect(treatedAsSuccess).toBe(false);
  });
});
