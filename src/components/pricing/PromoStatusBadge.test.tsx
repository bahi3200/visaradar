import { describe, it, expect } from "vitest";
import { computePromoStatus } from "./PromoStatusBadge";

const now = new Date("2026-04-28T12:00:00Z");
const day = 24 * 60 * 60 * 1000;

describe("computePromoStatus", () => {
  it("returns 'none' when promo_price is null", () => {
    expect(
      computePromoStatus(
        { price: 5000, promo_price: null, promo_starts_at: null, promo_ends_at: null },
        now,
      ),
    ).toBe("none");
  });

  it("returns 'none' when promo_price is not lower than price", () => {
    expect(
      computePromoStatus(
        { price: 5000, promo_price: 5000, promo_starts_at: null, promo_ends_at: null },
        now,
      ),
    ).toBe("none");
  });

  it("returns 'expired' when end date is in the past", () => {
    expect(
      computePromoStatus(
        {
          price: 5000,
          promo_price: 4000,
          promo_starts_at: new Date(now.getTime() - 7 * day).toISOString(),
          promo_ends_at: new Date(now.getTime() - 1 * day).toISOString(),
        },
        now,
      ),
    ).toBe("expired");
  });

  it("returns 'scheduled' when start date is in the future", () => {
    expect(
      computePromoStatus(
        {
          price: 5000,
          promo_price: 4000,
          promo_starts_at: new Date(now.getTime() + 1 * day).toISOString(),
          promo_ends_at: new Date(now.getTime() + 7 * day).toISOString(),
        },
        now,
      ),
    ).toBe("scheduled");
  });

  it("returns 'active' when current time is within the window", () => {
    expect(
      computePromoStatus(
        {
          price: 5000,
          promo_price: 4000,
          promo_starts_at: new Date(now.getTime() - 1 * day).toISOString(),
          promo_ends_at: new Date(now.getTime() + 1 * day).toISOString(),
        },
        now,
      ),
    ).toBe("active");
  });

  it("returns 'active' when both bounds are null but promo_price is valid", () => {
    expect(
      computePromoStatus(
        { price: 5000, promo_price: 4000, promo_starts_at: null, promo_ends_at: null },
        now,
      ),
    ).toBe("active");
  });
});