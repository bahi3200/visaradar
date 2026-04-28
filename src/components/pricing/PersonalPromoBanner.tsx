import { motion } from "framer-motion";
import { Sparkles, Clock, ArrowLeft } from "lucide-react";
import { Link } from "react-router-dom";
import { usePersonalPromo } from "@/hooks/usePersonalPromo";
import { formatCountdown } from "@/lib/promoUtils";

interface Props {
  /** Optional CTA target — defaults to /pricing. */
  ctaTo?: string;
  /** Optional CTA label — defaults to "اشترك الآن". */
  ctaLabel?: string;
  /** Hide the CTA button (use when banner already lives on /pricing). */
  hideCta?: boolean;
}

/**
 * Reminder banner — only renders for logged-in users that never subscribed,
 * during their personal 7-day window. Purely informational: no real discount
 * is applied to package prices, this is a motivational nudge with a countdown.
 */
export default function PersonalPromoBanner({ ctaTo = "/pricing", ctaLabel = "اشترك الآن", hideCta }: Props) {
  const { eligible, remainingMs, discountPct } = usePersonalPromo();

  if (!eligible) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
      className="relative overflow-hidden rounded-xl border border-accent/30 bg-gradient-to-l from-accent/15 via-accent/10 to-primary/15 p-4 mb-6 flex items-center justify-between flex-wrap gap-3"
      role="region"
      aria-label="عرض ترحيبي شخصي"
    >
      <div className="flex items-center gap-3 flex-wrap">
        <div className="w-9 h-9 rounded-lg bg-accent/25 flex items-center justify-center shrink-0">
          <Sparkles className="w-4 h-4 text-accent" aria-hidden />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-bold text-foreground">
            عرض ترحيبي خاص بك — خصم {discountPct}% عند الاشتراك
          </p>
          <p className="text-[11px] text-muted-foreground inline-flex items-center gap-1.5 mt-0.5">
            <Clock className="w-3 h-3 text-primary" aria-hidden />
            <span>ينتهي خلال</span>
            <span className="font-mono font-bold tabular-nums text-foreground" aria-live="polite">
              {formatCountdown(remainingMs)}
            </span>
          </p>
        </div>
      </div>
      {!hideCta && (
        <Link
          to={ctaTo}
          className="inline-flex items-center gap-2 bg-accent hover:bg-accent/90 text-accent-foreground text-xs font-bold px-5 py-2.5 rounded-full transition-all shrink-0"
        >
          {ctaLabel}
          <ArrowLeft className="w-3.5 h-3.5" />
        </Link>
      )}
    </motion.div>
  );
}