import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

/** Personal promo config — hard-coded per product spec (no DB write). */
export const PERSONAL_PROMO = {
  /** Discount percentage shown to the user (informational only — prices unchanged). */
  discountPct: 15,
  /** Window length, in days, starting from the user's signup date. */
  windowDays: 7,
} as const;

export type PersonalPromoState = {
  /** Should the reminder banner be shown right now? */
  eligible: boolean;
  /** ms remaining until the personal window closes, 0 when expired. */
  remainingMs: number;
  /** Window end as Date, or null when not eligible. */
  endsAt: Date | null;
  discountPct: number;
};

/**
 * Detects logged-in users that NEVER subscribed and exposes a personal
 * 7-day promo window starting at their signup date. Pure UI reminder —
 * no real discount is applied to package prices.
 */
export function usePersonalPromo(): PersonalPromoState {
  const { user } = useAuth();

  // Has the user ever had ANY subscription row (any status)?
  const { data: hasEverSubscribed } = useQuery({
    queryKey: ["has-ever-subscribed", user?.id],
    queryFn: async () => {
      if (!user) return false;
      const { count, error } = await supabase
        .from("subscriptions")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id);
      if (error) return false;
      return (count ?? 0) > 0;
    },
    enabled: !!user,
    staleTime: 60_000,
  });

  const [now, setNow] = useState<Date>(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  if (!user || hasEverSubscribed === undefined) {
    return { eligible: false, remainingMs: 0, endsAt: null, discountPct: PERSONAL_PROMO.discountPct };
  }
  if (hasEverSubscribed) {
    return { eligible: false, remainingMs: 0, endsAt: null, discountPct: PERSONAL_PROMO.discountPct };
  }

  const createdAt = user.created_at ? new Date(user.created_at) : null;
  if (!createdAt || isNaN(createdAt.getTime())) {
    return { eligible: false, remainingMs: 0, endsAt: null, discountPct: PERSONAL_PROMO.discountPct };
  }

  const endsAt = new Date(createdAt.getTime() + PERSONAL_PROMO.windowDays * 24 * 60 * 60 * 1000);
  const remainingMs = Math.max(0, endsAt.getTime() - now.getTime());
  return {
    eligible: remainingMs > 0,
    remainingMs,
    endsAt,
    discountPct: PERSONAL_PROMO.discountPct,
  };
}