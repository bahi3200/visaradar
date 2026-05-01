import React, { useEffect, useState } from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

const toastError = vi.fn();
vi.mock("sonner", () => ({
  toast: { error: (...args) => toastError(...args), success: vi.fn() },
}));

import { toast } from "sonner";

/**
 * Mirror of canonical messages defined in src/pages/ManagePackages.tsx.
 * Kept in sync to assert the same wording is used in onChange and Save-time.
 */
const PROMO_PRICE_INVALID_MSG = "السعر الترويجي يجب أن يكون أقل من السعر الأصلي";
const buildPromoPriceSaveError = (promo: number, price: number) =>
  `${PROMO_PRICE_INVALID_MSG} — لا يمكن الحفظ: ${promo.toLocaleString()} د.ج ≥ ${price.toLocaleString()} د.ج`;

function PromoValidationHarness({ price = 1000 }: { price?: number }) {
  const [promoPrice, setPromoPrice] = useState(0);
  const [rejectedPct, setRejectedPct] = useState<number | null>(null);
  const [rejectedPromoPrice, setRejectedPromoPrice] = useState<number | null>(null);

  const onPctChange = (raw: string) => {
    if (raw === "") { setPromoPrice(0); return; }
    const rawPct = Number(raw);
    if (!price || price <= 0) {
      toast.error("حدّد السعر الأصلي أولاً");
      return;
    }
    if (rawPct >= 100) {
      setRejectedPct(rawPct);
      toast.error("نسبة الخصم يجب أن تكون أقل من 100% — لا يمكن أن يكون السعر مجانيًا");
      return;
    }
    setRejectedPct(null);
    const pct = Math.max(0, Math.min(99, rawPct));
    setPromoPrice(Math.round((price * (100 - pct)) / 100));
  };

  const onPromoPriceChange = (raw: string) => {
    const value = Number(raw);
    if (price > 0 && value >= price) {
      setRejectedPromoPrice(value);
      toast.error("السعر الترويجي يجب أن يكون أقل من السعر الأصلي");
      return;
    }
    setRejectedPromoPrice(null);
    setPromoPrice(value);
  };

  const promoTooHigh = promoPrice > 0 && price > 0 && promoPrice >= price;

  return (
    <div>
      <span data-testid="promo-price">{promoPrice}</span>
      {rejectedPct !== null && (
        <div role="alert" data-testid="pct-alert">
          تم رفض القيمة {rejectedPct}% — نسبة الخصم لا يمكن أن تساوي أو تتجاوز 100%
        </div>
      )}
      {rejectedPromoPrice !== null && (
        <div role="alert" data-testid="promo-price-alert">
          تم رفض السعر الترويجي ({rejectedPromoPrice} د.ج) — يجب أن يكون أقل من السعر الأصلي ({price} د.ج)
        </div>
      )}
      <input aria-label="pct-input" onChange={(e) => onPctChange(e.target.value)} />
      <input aria-label="promo-price-input" value={promoPrice} onChange={(e) => onPromoPriceChange(e.target.value)} />
      {promoTooHigh && (
        <p role="alert" data-testid="inline-error">
          يجب أن يكون أقل من السعر الأصلي ({price} د.ج). لن يتم حفظ العرض.
        </p>
      )}
    </div>
  );
}

describe("Promo validation — discount percentage >= 100%", () => {
  beforeEach(() => toastError.mockClear());

  it("rejects 100% — does not update promo price and shows alert + toast", () => {
    render(<PromoValidationHarness price={1000} />);
    fireEvent.change(screen.getByLabelText("pct-input"), { target: { value: "100" } });
    expect(screen.getByTestId("promo-price").textContent).toBe("0");
    expect(screen.getByTestId("pct-alert").textContent).toContain("100");
    expect(toastError).toHaveBeenCalledWith(expect.stringContaining("نسبة الخصم يجب أن تكون أقل من 100%"));
  });

  it("rejects 150% the same way", () => {
    render(<PromoValidationHarness price={1000} />);
    fireEvent.change(screen.getByLabelText("pct-input"), { target: { value: "150" } });
    expect(screen.getByTestId("promo-price").textContent).toBe("0");
    expect(screen.getByTestId("pct-alert").textContent).toContain("150");
    expect(toastError).toHaveBeenCalledTimes(1);
  });

  it("accepts 99% — updates promo price and clears alert", () => {
    render(<PromoValidationHarness price={1000} />);
    fireEvent.change(screen.getByLabelText("pct-input"), { target: { value: "99" } });
    expect(screen.getByTestId("promo-price").textContent).toBe("10");
    expect(screen.queryByTestId("pct-alert")).toBeNull();
    expect(toastError).not.toHaveBeenCalled();
  });
});

describe("Promo validation — promo_price >= original price", () => {
  beforeEach(() => toastError.mockClear());

  it("rejects equal value (1000 vs 1000) and shows alert + toast", () => {
    render(<PromoValidationHarness price={1000} />);
    fireEvent.change(screen.getByLabelText("promo-price-input"), { target: { value: "1000" } });
    expect(screen.getByTestId("promo-price").textContent).toBe("0");
    expect(screen.getByTestId("promo-price-alert").textContent).toContain("يجب أن يكون أقل من السعر الأصلي");
    expect(toastError).toHaveBeenCalledWith("السعر الترويجي يجب أن يكون أقل من السعر الأصلي");
  });

  it("rejects greater value (1500 vs 1000)", () => {
    render(<PromoValidationHarness price={1000} />);
    fireEvent.change(screen.getByLabelText("promo-price-input"), { target: { value: "1500" } });
    expect(screen.getByTestId("promo-price").textContent).toBe("0");
    expect(screen.getByTestId("promo-price-alert").textContent).toContain("1500");
    expect(toastError).toHaveBeenCalledTimes(1);
  });

  it("accepts lower value (800 vs 1000) — updates and clears alerts", () => {
    render(<PromoValidationHarness price={1000} />);
    fireEvent.change(screen.getByLabelText("promo-price-input"), { target: { value: "800" } });
    expect(screen.getByTestId("promo-price").textContent).toBe("800");
    expect(screen.queryByTestId("promo-price-alert")).toBeNull();
    expect(screen.queryByTestId("inline-error")).toBeNull();
    expect(toastError).not.toHaveBeenCalled();
  });

  it("blocks update when bumping from valid value to >= price", () => {
    render(<PromoValidationHarness price={1000} />);
    const input = screen.getByLabelText("promo-price-input");
    fireEvent.change(input, { target: { value: "900" } });
    expect(screen.getByTestId("promo-price").textContent).toBe("900");
    fireEvent.change(input, { target: { value: "1000" } });
    expect(screen.getByTestId("promo-price").textContent).toBe("900");
    expect(screen.getByTestId("promo-price-alert")).toBeTruthy();
  });
});

/**
 * Mirrors the production auto-clear behavior in ManagePackages:
 *   useEffect(() => {
 *     if (rejectedPromoPrice === null) return;
 *     if (price > 0 && promoPrice > 0 && promoPrice < price) {
 *       setRejectedPromoPrice(null);
 *     }
 *   }, [price, promoPrice, rejectedPromoPrice]);
 *
 * This harness lets the user freely set promoPrice (no input-handler guard),
 * then asserts the alert clears reactively when the value becomes valid.
 */
function AutoClearHarness({
  initialPrice = 1000,
  initialMode = "price",
}: {
  initialPrice?: number;
  initialMode?: "price" | "pct";
}) {
  const [price, setPrice] = useState(initialPrice);
  const [promoPrice, setPromoPrice] = useState(0);
  const [rejectedPromoPrice, setRejectedPromoPrice] = useState<number | null>(null);
  const [promoInputMode, setPromoInputMode] = useState<"price" | "pct">(initialMode);

  useEffect(() => {
    if (rejectedPromoPrice === null) return;
    if (promoInputMode !== "price") return;
    if (price > 0 && promoPrice > 0 && promoPrice < price) {
      setRejectedPromoPrice(null);
    }
  }, [price, promoPrice, rejectedPromoPrice, promoInputMode]);

  return (
    <div>
      <span data-testid="price">{price}</span>
      <span data-testid="promo-price">{promoPrice}</span>
      <span data-testid="rejected">{rejectedPromoPrice === null ? "null" : String(rejectedPromoPrice)}</span>
      <span data-testid="mode">{promoInputMode}</span>
      {rejectedPromoPrice !== null && (
        <div role="alert" data-testid="promo-price-alert">
          تم رفض السعر الترويجي ({rejectedPromoPrice} د.ج)
        </div>
      )}
      <input
        aria-label="price-input"
        value={price}
        onChange={(e) => setPrice(Number(e.target.value))}
      />
      <input
        aria-label="promo-price-input"
        value={promoPrice}
        onChange={(e) => setPromoPrice(Number(e.target.value))}
      />
      <button
        data-testid="seed-rejected"
        onClick={() => setRejectedPromoPrice(1500)}
      >
        seed
      </button>
      <button data-testid="mode-pct" onClick={() => setPromoInputMode("pct")}>
        pct
      </button>
      <button data-testid="mode-price" onClick={() => setPromoInputMode("price")}>
        price
      </button>
    </div>
  );
}

describe("Promo validation — rejectedPromoPrice auto-clear", () => {
  it("clears alert automatically when promo_price becomes < price", () => {
    render(<AutoClearHarness initialPrice={1000} />);
    fireEvent.click(screen.getByTestId("seed-rejected"));
    expect(screen.getByTestId("promo-price-alert")).toBeTruthy();

    fireEvent.change(screen.getByLabelText("promo-price-input"), { target: { value: "800" } });

    expect(screen.queryByTestId("promo-price-alert")).toBeNull();
    expect(screen.getByTestId("rejected").textContent).toBe("null");
  });

  it("keeps alert visible when promo_price equals original price", () => {
    render(<AutoClearHarness initialPrice={1000} />);
    fireEvent.click(screen.getByTestId("seed-rejected"));
    fireEvent.change(screen.getByLabelText("promo-price-input"), { target: { value: "1000" } });

    expect(screen.getByTestId("promo-price-alert")).toBeTruthy();
    expect(screen.getByTestId("rejected").textContent).toBe("1500");
  });

  it("keeps alert visible when promo_price is greater than original price", () => {
    render(<AutoClearHarness initialPrice={1000} />);
    fireEvent.click(screen.getByTestId("seed-rejected"));
    fireEvent.change(screen.getByLabelText("promo-price-input"), { target: { value: "1200" } });

    expect(screen.getByTestId("promo-price-alert")).toBeTruthy();
  });

  it("keeps alert visible when promo_price is zero (not yet entered)", () => {
    render(<AutoClearHarness initialPrice={1000} />);
    fireEvent.click(screen.getByTestId("seed-rejected"));
    fireEvent.change(screen.getByLabelText("promo-price-input"), { target: { value: "0" } });

    expect(screen.getByTestId("promo-price-alert")).toBeTruthy();
  });

  it("clears alert when original price is raised above promo_price", () => {
    render(<AutoClearHarness initialPrice={500} />);
    fireEvent.change(screen.getByLabelText("promo-price-input"), { target: { value: "800" } });
    fireEvent.click(screen.getByTestId("seed-rejected"));
    expect(screen.getByTestId("promo-price-alert")).toBeTruthy();

    fireEvent.change(screen.getByLabelText("price-input"), { target: { value: "2000" } });

    expect(screen.queryByTestId("promo-price-alert")).toBeNull();
  });

  it("re-shows alert if a fresh rejection happens after a previous auto-clear", () => {
    render(<AutoClearHarness initialPrice={1000} />);
    fireEvent.click(screen.getByTestId("seed-rejected"));
    fireEvent.change(screen.getByLabelText("promo-price-input"), { target: { value: "800" } });
    expect(screen.queryByTestId("promo-price-alert")).toBeNull();

    // Bump promo back to an invalid value, then re-seed: alert must persist.
    fireEvent.change(screen.getByLabelText("promo-price-input"), { target: { value: "1500" } });
    fireEvent.click(screen.getByTestId("seed-rejected"));
    expect(screen.getByTestId("promo-price-alert")).toBeTruthy();
  });
});

describe("Promo validation — edge cases (decimals, empty, zero, NaN)", () => {
  beforeEach(() => toastError.mockClear());

  it("rejects exact decimal equality (1000.50 vs 1000.50)", () => {
    render(<PromoValidationHarness price={1000.5} />);
    fireEvent.change(screen.getByLabelText("promo-price-input"), { target: { value: "1000.50" } });
    expect(screen.getByTestId("promo-price-alert")).toBeTruthy();
    expect(screen.getByTestId("promo-price").textContent).toBe("0");
  });

  it("accepts a value just below by a fraction (999.99 vs 1000)", () => {
    render(<PromoValidationHarness price={1000} />);
    fireEvent.change(screen.getByLabelText("promo-price-input"), { target: { value: "999.99" } });
    expect(screen.queryByTestId("promo-price-alert")).toBeNull();
    expect(screen.getByTestId("promo-price").textContent).toBe("999.99");
    expect(toastError).not.toHaveBeenCalled();
  });

  it("rejects a value just above by a fraction (1000.01 vs 1000)", () => {
    render(<PromoValidationHarness price={1000} />);
    fireEvent.change(screen.getByLabelText("promo-price-input"), { target: { value: "1000.01" } });
    expect(screen.getByTestId("promo-price-alert")).toBeTruthy();
    expect(screen.getByTestId("promo-price").textContent).toBe("0");
  });

  it("treats empty input as 0 — no rejection alert and no toast", () => {
    render(<PromoValidationHarness price={1000} />);
    fireEvent.change(screen.getByLabelText("promo-price-input"), { target: { value: "" } });
    expect(screen.queryByTestId("promo-price-alert")).toBeNull();
    expect(screen.queryByTestId("inline-error")).toBeNull();
    expect(screen.getByTestId("promo-price").textContent).toBe("0");
    expect(toastError).not.toHaveBeenCalled();
  });

  it("does not flag promo_price = 0 even when price is set", () => {
    render(<PromoValidationHarness price={1000} />);
    fireEvent.change(screen.getByLabelText("promo-price-input"), { target: { value: "0" } });
    expect(screen.queryByTestId("promo-price-alert")).toBeNull();
    expect(screen.queryByTestId("inline-error")).toBeNull();
    expect(screen.getByTestId("promo-price").textContent).toBe("0");
  });

  it("clears alert auto-clear with decimal boundary (799.99 < 800)", () => {
    render(<AutoClearHarness initialPrice={800} />);
    fireEvent.click(screen.getByTestId("seed-rejected"));
    fireEvent.change(screen.getByLabelText("promo-price-input"), { target: { value: "799.99" } });
    expect(screen.queryByTestId("promo-price-alert")).toBeNull();
  });

  it("keeps alert visible at decimal equality in auto-clear (800.00 = 800)", () => {
    render(<AutoClearHarness initialPrice={800} />);
    fireEvent.click(screen.getByTestId("seed-rejected"));
    fireEvent.change(screen.getByLabelText("promo-price-input"), { target: { value: "800.00" } });
    expect(screen.getByTestId("promo-price-alert")).toBeTruthy();
  });

  it("does not auto-clear when promo_price is empty (NaN) even if previously rejected", () => {
    render(<AutoClearHarness initialPrice={1000} />);
    fireEvent.click(screen.getByTestId("seed-rejected"));
    // Empty string -> Number("") === 0, mirroring production form input behavior
    fireEvent.change(screen.getByLabelText("promo-price-input"), { target: { value: "" } });
    expect(screen.getByTestId("promo-price-alert")).toBeTruthy();
    expect(screen.getByTestId("rejected").textContent).toBe("1500");
  });

  it("does not auto-clear when original price is 0", () => {
    render(<AutoClearHarness initialPrice={1000} />);
    // Set promo invalid first so auto-clear doesn't trigger when seeding
    fireEvent.change(screen.getByLabelText("promo-price-input"), { target: { value: "1500" } });
    fireEvent.click(screen.getByTestId("seed-rejected"));
    expect(screen.getByTestId("promo-price-alert")).toBeTruthy();
    // Drop original price to 0 — guard requires price > 0, so alert stays
    fireEvent.change(screen.getByLabelText("price-input"), { target: { value: "0" } });
    expect(screen.getByTestId("promo-price-alert")).toBeTruthy();
  });
});

describe("Promo validation — auto-clear gated by promoInputMode", () => {
  it("does NOT auto-clear when mode is 'pct' even if promo_price becomes valid", () => {
    render(<AutoClearHarness initialPrice={1000} initialMode="pct" />);
    fireEvent.click(screen.getByTestId("seed-rejected"));
    expect(screen.getByTestId("promo-price-alert")).toBeTruthy();

    fireEvent.change(screen.getByLabelText("promo-price-input"), { target: { value: "800" } });

    // Alert must persist because we're not in "price" mode.
    expect(screen.getByTestId("promo-price-alert")).toBeTruthy();
    expect(screen.getByTestId("rejected").textContent).toBe("1500");
  });

  it("does NOT auto-clear in 'pct' mode when original price is raised", () => {
    render(<AutoClearHarness initialPrice={500} initialMode="pct" />);
    fireEvent.change(screen.getByLabelText("promo-price-input"), { target: { value: "800" } });
    fireEvent.click(screen.getByTestId("seed-rejected"));
    expect(screen.getByTestId("promo-price-alert")).toBeTruthy();

    fireEvent.change(screen.getByLabelText("price-input"), { target: { value: "2000" } });

    expect(screen.getByTestId("promo-price-alert")).toBeTruthy();
  });

  it("auto-clears immediately after switching from 'pct' back to 'price' if value is valid", () => {
    render(<AutoClearHarness initialPrice={1000} initialMode="pct" />);
    fireEvent.click(screen.getByTestId("seed-rejected"));
    fireEvent.change(screen.getByLabelText("promo-price-input"), { target: { value: "800" } });
    expect(screen.getByTestId("promo-price-alert")).toBeTruthy();

    fireEvent.click(screen.getByTestId("mode-price"));

    expect(screen.queryByTestId("promo-price-alert")).toBeNull();
    expect(screen.getByTestId("rejected").textContent).toBe("null");
  });

  it("preserves alert when toggling 'price' -> 'pct' with valid value (no clear in pct)", () => {
    render(<AutoClearHarness initialPrice={1000} initialMode="price" />);
    // Seed while invalid so the alert sticks before we switch
    fireEvent.change(screen.getByLabelText("promo-price-input"), { target: { value: "1500" } });
    fireEvent.click(screen.getByTestId("seed-rejected"));
    expect(screen.getByTestId("promo-price-alert")).toBeTruthy();

    fireEvent.click(screen.getByTestId("mode-pct"));
    // Even if promo becomes valid in pct mode, alert must stay
    fireEvent.change(screen.getByLabelText("promo-price-input"), { target: { value: "700" } });

    expect(screen.getByTestId("promo-price-alert")).toBeTruthy();
  });
});
