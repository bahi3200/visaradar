import React, { useEffect, useState } from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

const toastError = vi.fn();
vi.mock("sonner", () => ({
  toast: { error: (...args) => toastError(...args), success: vi.fn() },
}));

import { toast } from "sonner";

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
function AutoClearHarness({ initialPrice = 1000 }: { initialPrice?: number }) {
  const [price, setPrice] = useState(initialPrice);
  const [promoPrice, setPromoPrice] = useState(0);
  const [rejectedPromoPrice, setRejectedPromoPrice] = useState<number | null>(null);

  useEffect(() => {
    if (rejectedPromoPrice === null) return;
    if (price > 0 && promoPrice > 0 && promoPrice < price) {
      setRejectedPromoPrice(null);
    }
  }, [price, promoPrice, rejectedPromoPrice]);

  return (
    <div>
      <span data-testid="price">{price}</span>
      <span data-testid="promo-price">{promoPrice}</span>
      <span data-testid="rejected">{rejectedPromoPrice === null ? "null" : String(rejectedPromoPrice)}</span>
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
