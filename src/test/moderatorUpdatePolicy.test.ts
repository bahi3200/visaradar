import { describe, it, expect } from "vitest";

/**
 * Mirrors the RLS UPDATE policy on public.subscription_requests for moderators:
 *   USING:  has_role(auth.uid(), 'moderator')
 *   WITH CHECK: has_role(auth.uid(), 'moderator')
 *     AND every column EXCEPT moderator_action, moderator_action_at, moderator_id
 *     IS NOT DISTINCT FROM its existing value.
 */

type SubscriptionRequest = {
  id: string;
  user_id: string;
  package_id: string;
  service_type: string;
  countries: string[];
  full_name: string;
  email: string | null;
  phone: string | null;
  telegram_chat_id: string | null;
  receipt_url: string | null;
  status: string;
  reviewed_at: string | null;
  reviewed_by: string | null;
  admin_notes: string | null;
  ai_fraud_detected: boolean | null;
  ai_verification_result: unknown;
  created_at: string;
  updated_at: string;
  moderator_action: string | null;
  moderator_action_at: string | null;
  moderator_id: string | null;
};

const MUTABLE_BY_MODERATOR = new Set([
  "moderator_action",
  "moderator_action_at",
  "moderator_id",
]);

function isNotDistinct(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function canModeratorUpdate(
  isModerator: boolean,
  existing: SubscriptionRequest,
  next: SubscriptionRequest
): boolean {
  if (!isModerator) return false;
  for (const key of Object.keys(existing) as (keyof SubscriptionRequest)[]) {
    if (MUTABLE_BY_MODERATOR.has(key as string)) continue;
    if (!isNotDistinct(existing[key], next[key])) return false;
  }
  return true;
}

const baseRow: SubscriptionRequest = {
  id: "req-1",
  user_id: "user-1",
  package_id: "pkg-1",
  service_type: "both",
  countries: ["FR"],
  full_name: "Ali",
  email: "a@b.com",
  phone: "+213000",
  telegram_chat_id: null,
  receipt_url: "r.jpg",
  status: "pending",
  reviewed_at: null,
  reviewed_by: null,
  admin_notes: null,
  ai_fraud_detected: false,
  ai_verification_result: null,
  created_at: "2026-01-01",
  updated_at: "2026-01-01",
  moderator_action: null,
  moderator_action_at: null,
  moderator_id: null,
};

describe("subscription_requests moderator UPDATE policy", () => {
  it("allows updating only moderator_action / moderator_action_at / moderator_id", () => {
    const next = {
      ...baseRow,
      moderator_action: "approve",
      moderator_action_at: "2026-02-01",
      moderator_id: "mod-1",
    };
    expect(canModeratorUpdate(true, baseRow, next)).toBe(true);
  });

  it("REJECTS changing status", () => {
    const next = { ...baseRow, status: "approved", moderator_action: "approve" };
    expect(canModeratorUpdate(true, baseRow, next)).toBe(false);
  });

  it("REJECTS changing admin_notes", () => {
    const next = { ...baseRow, admin_notes: "tampered" };
    expect(canModeratorUpdate(true, baseRow, next)).toBe(false);
  });

  it("REJECTS changing reviewed_by / reviewed_at", () => {
    const next = { ...baseRow, reviewed_by: "mod-1", reviewed_at: "2026-02-01" };
    expect(canModeratorUpdate(true, baseRow, next)).toBe(false);
  });

  it("REJECTS changing receipt_url or PII fields", () => {
    expect(canModeratorUpdate(true, baseRow, { ...baseRow, receipt_url: "evil.jpg" })).toBe(false);
    expect(canModeratorUpdate(true, baseRow, { ...baseRow, email: "x@y.com" })).toBe(false);
    expect(canModeratorUpdate(true, baseRow, { ...baseRow, phone: "+999" })).toBe(false);
    expect(canModeratorUpdate(true, baseRow, { ...baseRow, full_name: "Mallory" })).toBe(false);
  });

  it("REJECTS changing ai_verification_result or ai_fraud_detected", () => {
    expect(
      canModeratorUpdate(true, baseRow, { ...baseRow, ai_fraud_detected: true })
    ).toBe(false);
    expect(
      canModeratorUpdate(true, baseRow, {
        ...baseRow,
        ai_verification_result: { faked: true },
      })
    ).toBe(false);
  });

  it("REJECTS changing user_id, package_id, service_type, countries", () => {
    expect(canModeratorUpdate(true, baseRow, { ...baseRow, user_id: "user-2" })).toBe(false);
    expect(canModeratorUpdate(true, baseRow, { ...baseRow, package_id: "pkg-2" })).toBe(false);
    expect(canModeratorUpdate(true, baseRow, { ...baseRow, service_type: "visa" })).toBe(false);
    expect(canModeratorUpdate(true, baseRow, { ...baseRow, countries: ["DE"] })).toBe(false);
  });

  it("REJECTS update from non-moderator users", () => {
    const next = { ...baseRow, moderator_action: "approve" };
    expect(canModeratorUpdate(false, baseRow, next)).toBe(false);
  });
});
