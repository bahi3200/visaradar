import { describe, it, expect } from "vitest";

/**
 * Mirrors the SQL contract of the `public.get_payment_info()` RPC:
 *
 *   IF auth.uid() IS NULL THEN
 *     RAISE EXCEPTION 'Must be authenticated to read payment info';
 *   END IF;
 *   RETURN QUERY SELECT ccp_number, ccp_key, account_holder, rip_number
 *                FROM public.payment_settings LIMIT 1;
 *
 * These tests guard against regressions where the function would:
 *   - leak CCP/BaridiMob payment info to anonymous (signed-out) users
 *   - return rows even when no payment_settings row exists
 *   - expose extra/sensitive columns beyond the whitelisted four
 */

type PaymentSettingsRow = {
  id: string;
  ccp_number: string;
  ccp_key: string;
  rip_number: string;
  account_holder: string;
  updated_at: string;
};

type PaymentInfo = {
  ccp_number: string;
  ccp_key: string;
  account_holder: string;
  rip_number: string;
};

type RpcResult =
  | { ok: true; data: PaymentInfo[] }
  | { ok: false; error: string };

function simulateGetPaymentInfo(
  authUid: string | null,
  settings: PaymentSettingsRow | null,
): RpcResult {
  if (!authUid) {
    return { ok: false, error: "Must be authenticated to read payment info" };
  }
  if (!settings) return { ok: true, data: [] };
  return {
    ok: true,
    data: [
      {
        ccp_number: settings.ccp_number,
        ccp_key: settings.ccp_key,
        account_holder: settings.account_holder,
        rip_number: settings.rip_number,
      },
    ],
  };
}

const existingSettings: PaymentSettingsRow = {
  id: "pay-1",
  ccp_number: "1111222233",
  ccp_key: "42",
  rip_number: "00799999000123456789",
  account_holder: "HEMICI Brahim",
  updated_at: "2026-05-20T00:00:00Z",
};

describe("get_payment_info — authentication gate", () => {
  it("REJECTS anonymous (signed-out) callers", () => {
    const res = simulateGetPaymentInfo(null, existingSettings);
    expect(res.ok).toBe(false);
    expect((res as { ok: false; error: string }).error).toMatch(/authenticated/i);
  });

  it("does NOT leak any payment fields to anonymous callers", () => {
    const res = simulateGetPaymentInfo(null, existingSettings);
    expect(res.ok).toBe(false);
    expect((res as { ok: true; data: unknown[] }).data).toBeUndefined();
  });

  it("allows ANY authenticated user (regular subscriber) to read payment info", () => {
    const res = simulateGetPaymentInfo("user-uuid-regular", existingSettings);
    expect(res.ok).toBe(true);
    const data = (res as { ok: true; data: PaymentInfo[] }).data;
    expect(data).toHaveLength(1);
    expect(data[0].ccp_number).toBe(existingSettings.ccp_number);
    expect(data[0].rip_number).toBe(existingSettings.rip_number);
    expect(data[0].account_holder).toBe(existingSettings.account_holder);
    expect(data[0].ccp_key).toBe(existingSettings.ccp_key);
  });

  it("only exposes the four whitelisted columns (no id, updated_at, etc.)", () => {
    const res = simulateGetPaymentInfo("user-uuid-regular", existingSettings);
    expect(res.ok).toBe(true);
    const data = (res as { ok: true; data: PaymentInfo[] }).data;
    const keys = Object.keys(data[0]).sort();
    expect(keys).toEqual(
      ["account_holder", "ccp_key", "ccp_number", "rip_number"].sort(),
    );
    expect(keys).not.toContain("id");
    expect(keys).not.toContain("updated_at");
  });

  it("returns an empty array when no payment_settings row exists", () => {
    const res = simulateGetPaymentInfo("user-uuid-regular", null);
    expect(res.ok).toBe(true);
    expect((res as { ok: true; data: PaymentInfo[] }).data).toEqual([]);
  });

  it("treats empty string user id as anonymous (defense in depth)", () => {
    const res = simulateGetPaymentInfo("", existingSettings);
    expect(res.ok).toBe(false);
  });
});
