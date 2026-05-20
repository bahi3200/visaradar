import { describe, it, expect } from "vitest";

/**
 * Mirrors the visibility/disable logic on src/pages/SubscribeRequest.tsx
 * for the payment-info block, the CTA scroll button, the receipt upload
 * area, and submit-time validation.
 *
 * Source of truth (kept in sync with the page):
 *   hasPaymentInfo       = Boolean(paymentSettings && (ccp || rip))
 *   paymentInfoMissing   = Boolean(selectedPackageId) && !loading && !fetching && !hasPaymentInfo
 *   showPaymentBlock     = !alreadySub && !preparing && hasPaymentInfo
 *   showErrorBlock       = !alreadySub && !preparing && paymentInfoMissing
 *   showReceiptUpload    = !alreadySub && !preparing && (!selectedPackageId || hasPaymentInfo)
 *   ctaEnabled (scroll)  = showPaymentBlock (CTA lives inside that block)
 *   submitBlocked        = !hasPaymentInfo
 */

type PaymentSettings = {
  ccp_number?: string | null;
  rip_number?: string | null;
  ccp_key?: string | null;
  account_holder?: string | null;
} | null | undefined;

type Inputs = {
  paymentSettings: PaymentSettings;
  paymentError?: unknown;
  paymentLoading: boolean;
  paymentFetching: boolean;
  selectedPackageId: string | null;
  isPreparingPayment: boolean;
  isAlreadySubscribed: boolean;
};

function computeGate(i: Inputs) {
  const hasPaymentInfo = Boolean(
    i.paymentSettings && (i.paymentSettings.ccp_number || i.paymentSettings.rip_number),
  );
  const paymentInfoMissing =
    Boolean(i.selectedPackageId) && !i.paymentLoading && !i.paymentFetching && !hasPaymentInfo;

  const showPaymentBlock = !i.isAlreadySubscribed && !i.isPreparingPayment && hasPaymentInfo;
  const showErrorBlock = !i.isAlreadySubscribed && !i.isPreparingPayment && paymentInfoMissing;
  const showReceiptUpload =
    !i.isAlreadySubscribed && !i.isPreparingPayment && (!i.selectedPackageId || hasPaymentInfo);
  const ctaEnabled = showPaymentBlock;
  const submitBlocked = !hasPaymentInfo;

  return { hasPaymentInfo, paymentInfoMissing, showPaymentBlock, showErrorBlock, showReceiptUpload, ctaEnabled, submitBlocked };
}

const baseInputs: Inputs = {
  paymentSettings: null,
  paymentError: null,
  paymentLoading: false,
  paymentFetching: false,
  selectedPackageId: "pkg-1",
  isPreparingPayment: false,
  isAlreadySubscribed: false,
};

describe("SubscribeRequest — payment gate", () => {
  it("hides payment block, CTA AND receipt upload when fetch failed (empty settings)", () => {
    const r = computeGate({ ...baseInputs, paymentError: new Error("network"), paymentSettings: null });
    expect(r.showPaymentBlock).toBe(false);
    expect(r.ctaEnabled).toBe(false);
    expect(r.showReceiptUpload).toBe(false);
    expect(r.showErrorBlock).toBe(true);
    expect(r.submitBlocked).toBe(true);
  });

  it("hides receipt upload + CTA when payment settings row exists but has no numbers", () => {
    const r = computeGate({
      ...baseInputs,
      paymentSettings: { ccp_number: "", rip_number: "", account_holder: "X" },
    });
    expect(r.hasPaymentInfo).toBe(false);
    expect(r.showPaymentBlock).toBe(false);
    expect(r.ctaEnabled).toBe(false);
    expect(r.showReceiptUpload).toBe(false);
    expect(r.showErrorBlock).toBe(true);
  });

  it("does NOT show error block while still loading (avoids flicker)", () => {
    const r = computeGate({ ...baseInputs, paymentLoading: true });
    expect(r.showErrorBlock).toBe(false);
    expect(r.showPaymentBlock).toBe(false);
    expect(r.showReceiptUpload).toBe(false);
  });

  it("does NOT show error block while refetching (isFetching)", () => {
    const r = computeGate({ ...baseInputs, paymentFetching: true });
    expect(r.showErrorBlock).toBe(false);
  });

  it("shows payment block, CTA AND receipt upload when valid CCP exists", () => {
    const r = computeGate({
      ...baseInputs,
      paymentSettings: { ccp_number: "1111222233", ccp_key: "42", account_holder: "X" },
    });
    expect(r.hasPaymentInfo).toBe(true);
    expect(r.showPaymentBlock).toBe(true);
    expect(r.ctaEnabled).toBe(true);
    expect(r.showReceiptUpload).toBe(true);
    expect(r.showErrorBlock).toBe(false);
    expect(r.submitBlocked).toBe(false);
  });

  it("shows payment block when only RIP exists (BaridiMob-only setup)", () => {
    const r = computeGate({
      ...baseInputs,
      paymentSettings: { rip_number: "00799999000123456789" },
    });
    expect(r.hasPaymentInfo).toBe(true);
    expect(r.showPaymentBlock).toBe(true);
    expect(r.ctaEnabled).toBe(true);
  });

  it("when no package is selected: no error block, no payment block, receipt area allowed to render", () => {
    const r = computeGate({ ...baseInputs, selectedPackageId: null, paymentSettings: null });
    expect(r.paymentInfoMissing).toBe(false);
    expect(r.showErrorBlock).toBe(false);
    expect(r.showPaymentBlock).toBe(false);
    expect(r.showReceiptUpload).toBe(true);
  });

  it("hides everything when user is already subscribed", () => {
    const r = computeGate({
      ...baseInputs,
      isAlreadySubscribed: true,
      paymentSettings: { ccp_number: "1111222233" },
    });
    expect(r.showPaymentBlock).toBe(false);
    expect(r.ctaEnabled).toBe(false);
    expect(r.showReceiptUpload).toBe(false);
    expect(r.showErrorBlock).toBe(false);
  });

  it("hides everything while payment is being prepared (loading screen state)", () => {
    const r = computeGate({
      ...baseInputs,
      isPreparingPayment: true,
      paymentSettings: { ccp_number: "1111222233" },
    });
    expect(r.showPaymentBlock).toBe(false);
    expect(r.ctaEnabled).toBe(false);
    expect(r.showReceiptUpload).toBe(false);
    expect(r.showErrorBlock).toBe(false);
  });

  it("submit is blocked when hasPaymentInfo is false (matches issues.push guard)", () => {
    const r = computeGate({ ...baseInputs, paymentSettings: null });
    expect(r.submitBlocked).toBe(true);
  });
});
