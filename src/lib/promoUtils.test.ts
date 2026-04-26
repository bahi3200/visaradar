import { describe, it, expect } from "vitest";
import { getPromoState, hasAnyActivePromo, maxDiscountPct, earliestPromoEnd, formatCountdown } from "./promoUtils";

const NOW = new Date("2026-04-26T12:00:00Z");

const base = {
  price: 1000,
  promo_price: null as number | null,
  promo_starts_at: null as string | null,
  promo_ends_at: null as string | null,
};

describe("getPromoState", () => {
  it("returns isPromo=false when no promo_price set", () => {
    expect(getPromoState(base, NOW).isPromo).toBe(false);
  });

  it("returns isPromo=true when promo active and within window", () => {
    const s = getPromoState({
      ...base,
      promo_price: 800,
      promo_starts_at: "2026-04-25T00:00:00Z",
      promo_ends_at: "2026-04-30T00:00:00Z",
    }, NOW);
    expect(s.isPromo).toBe(true);
    expect(s.effectivePrice).toBe(800);
    expect(s.discountPct).toBe(20);
  });

  it("returns isPromo=false when before start date", () => {
    const s = getPromoState({
      ...base,
      promo_price: 800,
      promo_starts_at: "2026-05-01T00:00:00Z",
      promo_ends_at: "2026-05-10T00:00:00Z",
    }, NOW);
    expect(s.isPromo).toBe(false);
    expect(s.effectivePrice).toBe(1000);
  });

  it("returns isPromo=false when after end date", () => {
    const s = getPromoState({
      ...base,
      promo_price: 800,
      promo_starts_at: "2026-04-01T00:00:00Z",
      promo_ends_at: "2026-04-25T00:00:00Z",
    }, NOW);
    expect(s.isPromo).toBe(false);
  });

  it("rejects promo_price >= original price", () => {
    const s = getPromoState({ ...base, promo_price: 1200, promo_starts_at: null, promo_ends_at: null }, NOW);
    expect(s.isPromo).toBe(false);
  });

  it("treats null start/end as open-ended", () => {
    const s = getPromoState({ ...base, promo_price: 500, promo_starts_at: null, promo_ends_at: null }, NOW);
    expect(s.isPromo).toBe(true);
    expect(s.discountPct).toBe(50);
  });
});

describe("aggregate helpers", () => {
  const pkgs = [
    { ...base, promo_price: 800, promo_starts_at: null, promo_ends_at: "2026-04-28T00:00:00Z" },
    { ...base, price: 2000, promo_price: 1000, promo_starts_at: null, promo_ends_at: "2026-04-27T00:00:00Z" },
    { ...base, price: 500 },
  ];

  it("hasAnyActivePromo true when at least one is active", () => {
    expect(hasAnyActivePromo(pkgs, NOW)).toBe(true);
  });

  it("maxDiscountPct picks highest discount", () => {
    expect(maxDiscountPct(pkgs, NOW)).toBe(50);
  });

  it("earliestPromoEnd returns nearest end date", () => {
    expect(earliestPromoEnd(pkgs, NOW)?.toISOString()).toBe("2026-04-27T00:00:00.000Z");
  });
});

describe("formatCountdown", () => {
  it("formats days+time", () => {
    expect(formatCountdown(2 * 86400_000 + 3 * 3600_000 + 4 * 60_000 + 5_000)).toBe("2 ي 03:04:05");
  });
  it("formats hh:mm:ss when under a day", () => {
    expect(formatCountdown(3661_000)).toBe("01:01:01");
  });
  it("returns انتهى when zero or negative", () => {
    expect(formatCountdown(0)).toBe("انتهى");
    expect(formatCountdown(-100)).toBe("انتهى");
  });
});