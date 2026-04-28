import { useEffect, useState } from "react";
import { Sparkles, Clock, CalendarClock, MinusCircle, CheckCircle2 } from "lucide-react";
import { formatCountdown, type PromoFields } from "@/lib/promoUtils";

export type PromoStatus = "active" | "scheduled" | "expired" | "none";

interface Props {
  pkg: PromoFields;
  /** Compact pill (used on cards). Otherwise full panel (used in dialogs). */
  compact?: boolean;
}

const META: Record<PromoStatus, { label: string; cls: string; icon: React.ReactNode; hint: string }> = {
  active: {
    label: "نشط",
    cls: "bg-emerald-500/15 text-emerald-400 border-emerald-500/40",
    icon: <Sparkles className="w-3 h-3" />,
    hint: "العرض ساري الآن للزوار",
  },
  scheduled: {
    label: "مجدول",
    cls: "bg-sky-500/15 text-sky-400 border-sky-500/40",
    icon: <CalendarClock className="w-3 h-3" />,
    hint: "سيبدأ تلقائياً في الموعد المحدّد",
  },
  expired: {
    label: "منتهي",
    cls: "bg-destructive/15 text-destructive border-destructive/40",
    icon: <MinusCircle className="w-3 h-3" />,
    hint: "انقضى تاريخ نهاية العرض",
  },
  none: {
    label: "بدون عرض",
    cls: "bg-muted/40 text-muted-foreground border-border/50",
    icon: <CheckCircle2 className="w-3 h-3" />,
    hint: "لم تتم جدولة أي عرض ترويجي",
  },
};

/** Pure status calculator — exported for reuse/tests. */
export function computePromoStatus(pkg: PromoFields, now: Date = new Date()): PromoStatus {
  const promoPrice = pkg.promo_price ?? null;
  if (promoPrice === null || (pkg.price !== null && promoPrice >= pkg.price)) return "none";

  const starts = pkg.promo_starts_at ? new Date(pkg.promo_starts_at) : null;
  const ends = pkg.promo_ends_at ? new Date(pkg.promo_ends_at) : null;

  if (ends && ends <= now) return "expired";
  if (starts && starts > now) return "scheduled";
  return "active";
}

/**
 * Live promo status badge. Updates every second so the countdown stays
 * accurate without remounting the parent.
 */
export default function PromoStatusBadge({ pkg, compact }: Props) {
  const [now, setNow] = useState<Date>(() => new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const status = computePromoStatus(pkg, now);
  const meta = META[status];

  // Countdown context per state
  let countdown: { label: string; ms: number } | null = null;
  if (status === "active" && pkg.promo_ends_at) {
    countdown = { label: "ينتهي خلال", ms: new Date(pkg.promo_ends_at).getTime() - now.getTime() };
  } else if (status === "scheduled" && pkg.promo_starts_at) {
    countdown = { label: "يبدأ خلال", ms: new Date(pkg.promo_starts_at).getTime() - now.getTime() };
  }

  if (compact) {
    return (
      <span
        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-bold ${meta.cls}`}
        title={meta.hint}
      >
        {meta.icon}
        {meta.label}
        {countdown && countdown.ms > 0 && (
          <span className="font-mono tabular-nums opacity-90" dir="ltr">
            {formatCountdown(countdown.ms)}
          </span>
        )}
      </span>
    );
  }

  return (
    <div className={`rounded-lg border p-3 ${meta.cls}`}>
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="inline-flex items-center gap-2 font-bold text-sm">
          {meta.icon}
          <span>حالة العرض: {meta.label}</span>
        </div>
        {countdown && countdown.ms > 0 && (
          <div className="inline-flex items-center gap-1.5 text-xs">
            <Clock className="w-3 h-3" aria-hidden />
            <span className="opacity-80">{countdown.label}</span>
            <span className="font-mono font-bold tabular-nums" dir="ltr">
              {formatCountdown(countdown.ms)}
            </span>
          </div>
        )}
      </div>
      <p className="text-[11px] mt-1 opacity-80">{meta.hint}</p>
    </div>
  );
}