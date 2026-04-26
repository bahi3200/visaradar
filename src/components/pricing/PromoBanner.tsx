import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Sparkles, Clock } from "lucide-react";
import { earliestPromoEnd, formatCountdown, hasAnyActivePromo, maxDiscountPct, type PromoFields } from "@/lib/promoUtils";

interface Props {
  packages: PromoFields[];
}

/**
 * Sticky promo banner — only renders when at least one package has an active
 * promo. Updates every second to drive the countdown.
 */
export default function PromoBanner({ packages }: Props) {
  const [now, setNow] = useState<Date>(() => new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  if (!hasAnyActivePromo(packages, now)) return null;

  const maxPct = maxDiscountPct(packages, now);
  const endsAt = earliestPromoEnd(packages, now);
  const remainingMs = endsAt ? endsAt.getTime() - now.getTime() : 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: -16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="relative overflow-hidden border-y border-accent/30 bg-gradient-to-l from-accent/15 via-accent/10 to-primary/15"
      role="region"
      aria-label="عرض ترويجي محدود"
    >
      <div className="container py-3 flex flex-wrap items-center justify-center gap-3 text-center">
        <div className="inline-flex items-center gap-2 text-accent font-bold text-sm">
          <Sparkles className="w-4 h-4" aria-hidden />
          <span>عرض محدود</span>
          {maxPct > 0 && (
            <span className="bg-accent text-accent-foreground text-xs font-black px-2 py-0.5 rounded-full">
              خصم حتى {maxPct}%
            </span>
          )}
        </div>
        {endsAt && remainingMs > 0 && (
          <div className="inline-flex items-center gap-2 text-foreground text-xs font-medium">
            <Clock className="w-3.5 h-3.5 text-primary" aria-hidden />
            <span className="text-muted-foreground">ينتهي خلال</span>
            <span className="font-mono font-bold tabular-nums text-foreground" aria-live="polite">
              {formatCountdown(remainingMs)}
            </span>
          </div>
        )}
      </div>
    </motion.div>
  );
}