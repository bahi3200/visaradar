import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  formatRelativeArabic,
  formatLinkedSince,
  formatFullDateAr,
} from "./relativeTime";

const NOW = new Date("2026-04-20T12:00:00Z").getTime();

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

const ago = (ms: number) => new Date(NOW - ms);
const ahead = (ms: number) => new Date(NOW + ms);

const SEC = 1000;
const MIN = 60 * SEC;
const HR = 60 * MIN;
const DAY = 24 * HR;
const MONTH = 30 * DAY;
const YEAR = 365 * DAY;

describe("formatRelativeArabic", () => {
  describe("invalid inputs", () => {
    it("returns empty string for null", () => {
      expect(formatRelativeArabic(null)).toBe("");
    });
    it("returns empty string for undefined", () => {
      expect(formatRelativeArabic(undefined)).toBe("");
    });
    it("returns empty string for empty string", () => {
      expect(formatRelativeArabic("")).toBe("");
    });
    it("returns empty string for invalid date string", () => {
      expect(formatRelativeArabic("not-a-date")).toBe("");
    });
    it("returns empty string for invalid Date object", () => {
      expect(formatRelativeArabic(new Date("invalid"))).toBe("");
    });
  });

  describe("seconds", () => {
    it("returns 'قبل لحظات' for less than 45 seconds", () => {
      expect(formatRelativeArabic(ago(10 * SEC))).toBe("قبل لحظات");
      expect(formatRelativeArabic(ago(44 * SEC))).toBe("قبل لحظات");
    });
  });

  describe("minutes", () => {
    it("returns 'قبل دقيقة' for ~1 minute", () => {
      expect(formatRelativeArabic(ago(60 * SEC))).toBe("قبل دقيقة");
    });
    it("returns 'قبل دقيقتين' for exactly 2 minutes", () => {
      expect(formatRelativeArabic(ago(2 * MIN))).toBe("قبل دقيقتين");
    });
    it("returns 'قبل N دقائق' for 3-10 minutes", () => {
      expect(formatRelativeArabic(ago(5 * MIN))).toBe("قبل 5 دقائق");
      expect(formatRelativeArabic(ago(10 * MIN))).toBe("قبل 10 دقائق");
    });
    it("returns 'قبل N دقيقة' for 11-59 minutes", () => {
      expect(formatRelativeArabic(ago(30 * MIN))).toBe("قبل 30 دقيقة");
    });
  });

  describe("hours", () => {
    it("returns 'قبل ساعة' for ~1 hour", () => {
      expect(formatRelativeArabic(ago(HR))).toBe("قبل ساعة");
    });
    it("returns 'قبل ساعتين' for exactly 2 hours", () => {
      expect(formatRelativeArabic(ago(2 * HR))).toBe("قبل ساعتين");
    });
    it("returns 'قبل N ساعات' for 3-10 hours", () => {
      expect(formatRelativeArabic(ago(5 * HR))).toBe("قبل 5 ساعات");
    });
    it("returns 'قبل N ساعة' for 11-23 hours", () => {
      expect(formatRelativeArabic(ago(15 * HR))).toBe("قبل 15 ساعة");
    });
  });

  describe("days", () => {
    it("returns 'قبل يوم' for ~1 day", () => {
      expect(formatRelativeArabic(ago(DAY))).toBe("قبل يوم");
    });
    it("returns 'قبل يومين' for exactly 2 days", () => {
      expect(formatRelativeArabic(ago(2 * DAY))).toBe("قبل يومين");
    });
    it("returns 'قبل N أيام' for 3-10 days", () => {
      expect(formatRelativeArabic(ago(5 * DAY))).toBe("قبل 5 أيام");
    });
    it("returns 'قبل N يوماً' for 11-29 days", () => {
      expect(formatRelativeArabic(ago(20 * DAY))).toBe("قبل 20 يوماً");
    });
  });

  describe("months", () => {
    it("returns 'قبل شهر' for ~1 month", () => {
      expect(formatRelativeArabic(ago(MONTH))).toBe("قبل شهر");
    });
    it("returns 'قبل شهرين' for exactly 2 months", () => {
      expect(formatRelativeArabic(ago(2 * MONTH))).toBe("قبل شهرين");
    });
    it("returns 'قبل N أشهر' for 3-10 months", () => {
      expect(formatRelativeArabic(ago(5 * MONTH))).toBe("قبل 5 أشهر");
    });
  });

  describe("years", () => {
    it("returns 'قبل سنة' for ~1 year", () => {
      expect(formatRelativeArabic(ago(YEAR))).toBe("قبل سنة");
    });
    it("returns 'قبل سنتين' for exactly 2 years", () => {
      expect(formatRelativeArabic(ago(2 * YEAR))).toBe("قبل سنتين");
    });
    it("returns 'قبل N سنوات' for 3-10 years", () => {
      expect(formatRelativeArabic(ago(5 * YEAR))).toBe("قبل 5 سنوات");
    });
    it("returns 'قبل N سنة' for 11+ years", () => {
      expect(formatRelativeArabic(ago(15 * YEAR))).toBe("قبل 15 سنة");
    });
  });

  describe("future dates", () => {
    it("replaces 'قبل' with 'خلال' for future minutes", () => {
      expect(formatRelativeArabic(ahead(5 * MIN))).toBe("خلال 5 دقائق");
    });
    it("replaces 'قبل' with 'خلال' for future days", () => {
      expect(formatRelativeArabic(ahead(3 * DAY))).toBe("خلال 3 أيام");
    });
    it("handles 'خلال لحظات' for near-future", () => {
      expect(formatRelativeArabic(ahead(10 * SEC))).toBe("خلال لحظات");
    });
  });

  describe("input types", () => {
    it("accepts ISO string", () => {
      const iso = new Date(NOW - 5 * MIN).toISOString();
      expect(formatRelativeArabic(iso)).toBe("قبل 5 دقائق");
    });
    it("accepts Date object", () => {
      expect(formatRelativeArabic(ago(5 * MIN))).toBe("قبل 5 دقائق");
    });
  });
});

describe("formatLinkedSince", () => {
  it("returns empty string for invalid input", () => {
    expect(formatLinkedSince(null)).toBe("");
    expect(formatLinkedSince("invalid")).toBe("");
  });
  it("replaces 'قبل' with 'مرتبط منذ' for past dates", () => {
    expect(formatLinkedSince(ago(3 * DAY))).toBe("مرتبط منذ 3 أيام");
  });
  it("replaces 'قبل لحظات' correctly", () => {
    expect(formatLinkedSince(ago(10 * SEC))).toBe("مرتبط منذ لحظات");
  });
  it("does not transform future-prefix 'خلال'", () => {
    // future dates are unusual for "linked since" but should pass through
    expect(formatLinkedSince(ahead(5 * MIN))).toBe("خلال 5 دقائق");
  });
});

describe("formatFullDateAr", () => {
  it("returns empty string for invalid input", () => {
    expect(formatFullDateAr(null)).toBe("");
    expect(formatFullDateAr(undefined)).toBe("");
    expect(formatFullDateAr("invalid")).toBe("");
  });
  it("returns a non-empty localized string for valid date", () => {
    const result = formatFullDateAr(new Date("2026-04-20T10:30:00Z"));
    expect(result).toBeTruthy();
    expect(typeof result).toBe("string");
  });
  it("accepts ISO string", () => {
    const result = formatFullDateAr("2026-04-20T10:30:00Z");
    expect(result).toBeTruthy();
  });
});
