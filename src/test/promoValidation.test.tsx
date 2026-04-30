import React, { useState } from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

const toastError = vi.fn();
vi.mock("sonner", () => ({
  toast: { error: (...args: unknown[]) => toastError(...args), success: vi.fn() },
}));

import { toast } from "sonner";

/**
 * Mirrors the validation logic in src/pages/ManagePackages.tsx for:
 *  - discount percentage >= 100 -> reject + alert + toast
 *  - promo_price >= original price -> reject + inline error + toast
 */
function PromoValidationHarness({ price = 1000 }: { price?: number }) {
  const [promoPrice, setPromoPrice] = useState(0);
  const [rejectedPct, setRejectedPct] = useState<number | null>(null);
  const [rejectedPromoPrice, setRejectedPromoPrice] = useState<number | null>(null);

  const onPctChange = (raw: string) => {
    if (raw === "") { setPromoPrice(0); return; }
    const rawPct = Number(raw);
    if (!price || price <= 0) {
      toast.error("\u062D\u062F\u0651\u062F \u0627\u0644\u0633\u0639\u0631 \u0627\u0644\u0623\u0635\u0644\u064A \u0623\u0648\u0644\u0627\u064B");
      return;
    }
    if (rawPct >= 100) {
      setRejectedPct(rawPct);
      toast.error("\u0646\u0633\u0628\u0629 \u0627\u0644\u062E\u0635\u0645 \u064A\u062C\u0628 \u0623\u0646 \u062A\u0643\u0648\u0646 \u0623\u0642\u0644 \u0645\u0646 100%");
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
      toast.error("\u0627\u0644\u0633\u0639\u0631 \u0627\u0644\u062A\u0631\u0648\u064A\u062C\u064A \u064A\u062C\u0628 \u0623\u0646 \u064A\u0643\u0648\u0646 \u0623\u0642\u
