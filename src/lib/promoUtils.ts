/**
 * Promo helpers — fixed-price promo, scheduled by start/end dates.
 * Promo is "active" when promo_price is set AND now() ∈ [starts, ends].
 * Either bound may be null → treated as open-ended on that side.
 */

export type PromoFields = {
  price: number | null;
  promo_price: number | null;
  promo_starts_at: string | null;
  promo_ends_at: string | null;
};

export type PromoState = {
  isPromo: boolean;
  effectivePrice: number | null;
  originalPrice: number | null;
  discountPct: number | null;
  endsAt: Date | null;
  startsAt: Date | null;
};

export function getPromoState(pkg: PromoFields, now: Date = new Date()): PromoState {
  const original = pkg.price ?? null;
  const promoPrice = pkg.promo_price ?? null;
  const starts = pkg.promo_starts_at ? new Date(pkg.promo_starts_at) : null;
  const ends = pkg.promo_ends_at ? new Date(pkg.promo_ends_at) : null;

  const valid =
    promoPrice !== null &&
    promoPrice >= 0 &&
    original !== null &&
    promoPrice < original &&
    (!starts || starts <= now) &&
    (!ends || ends > now);

  if (!valid) {
    return {
      isPromo: false,
      effectivePrice: original,
      originalPrice: original,
      discountPct: null,
      endsAt: ends,
      startsAt: starts,
    };
  }

  const discountPct = Math.round(((original! - promoPrice!) / original!) * 100);
  return {
    isPromo: true,
    effectivePrice: promoPrice,
    originalPrice: original,
    discountPct,
    endsAt: ends,
    startsAt: starts,
  };
}

/** Whether ANY package in the list has an active promo right now. */
export function hasAnyActivePromo(packages: PromoFields[], now: Date = new Date()): boolean {
  return packages.some((p) => getPromoState(p, now).isPromo);
}

/** Highest discount percentage across all active promos (for banner headline). */
export function maxDiscountPct(packages: PromoFields[], now: Date = new Date()): number {
  return packages.reduce((acc, p) => {
    const s = getPromoState(p, now);
    return s.isPromo && s.discountPct ? Math.max(acc, s.discountPct) : acc;
  }, 0);
}

/** Earliest end date among active promos — drives the banner countdown. */
export function earliestPromoEnd(packages: PromoFields[], now: Date = new Date()): Date | null {
  let earliest: Date | null = null;
  for (const p of packages) {
    const s = getPromoState(p, now);
    if (s.isPromo && s.endsAt) {
      if (!earliest || s.endsAt < earliest) earliest = s.endsAt;
    }
  }
  return earliest;
}

/** Format a remaining duration (ms) as Arabic countdown, e.g. "٢ ي ٠٤:٣٢:١٠". */
export function formatCountdown(ms: number): string {
  if (ms <= 0) return "انتهى";
  const totalSec = Math.floor(ms / 1000);
  const days = Math.floor(totalSec / 86400);
  const hours = Math.floor((totalSec % 86400) / 3600);
  const minutes = Math.floor((totalSec % 3600) / 60);
  const seconds = totalSec % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  if (days > 0) return `${days} ي ${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
}