import { Crown, Calendar, Lock, ArrowLeft } from "lucide-react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import { supabase } from "@/integrations/supabase/client";
import type { SubscriptionWithPackage } from "@/types/supabase-extended";

interface Props {
  /** Service type required for "subscribed" state. Defaults to "both" (any subscription grants access). */
  serviceType?: "visa" | "jobs" | "both";
  /** Custom subtitle for the locked banner. */
  lockedSubtitle?: string;
}

export default function AccessStatusCard({
  serviceType = "both",
  lockedSubtitle = "اشترك للوصول الكامل إلى جميع الميزات",
}: Props) {
  const { user } = useAuth();
  const { isPrivileged } = useIsAdmin();

  const { data: subscription } = useQuery<SubscriptionWithPackage | null>({
    queryKey: ["my-subscription", user?.id],
    queryFn: async () => {
      if (!user) return null;
      const { data } = await supabase
        .from("subscriptions")
        .select("*, packages(*)")
        .eq("user_id", user.id)
        .eq("status", "active")
        .maybeSingle();
      return (data as SubscriptionWithPackage | null) ?? null;
    },
    enabled: !!user,
  });

  const matchesService =
    serviceType === "both"
      ? true
      : subscription?.service_type === serviceType || subscription?.service_type === "both";

  const hasAccess = isPrivileged || (!!subscription && matchesService);

  const formatDate = (d: string) =>
    new Date(d).toLocaleDateString("ar-DZ", { year: "numeric", month: "long", day: "numeric" });

  if (!hasAccess) {
    return (
      <div className="gradient-card rounded-xl border border-accent/20 p-4 mb-6 flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-accent/20 flex items-center justify-center">
            <Lock className="w-4 h-4 text-accent" />
          </div>
          <div>
            <p className="text-sm font-bold text-foreground">الوصول الكامل يتطلب اشتراك</p>
            <p className="text-[10px] text-muted-foreground">{lockedSubtitle}</p>
          </div>
        </div>
        <Link
          to={user ? "/pricing" : "/auth/register"}
          className="inline-flex items-center gap-2 bg-accent hover:bg-accent/90 text-accent-foreground text-xs font-bold px-5 py-2.5 rounded-full transition-all"
        >
          اشترك الآن
          <ArrowLeft className="w-3.5 h-3.5" />
        </Link>
      </div>
    );
  }

  return (
    <div className="gradient-card rounded-xl border border-accent/30 p-4 mb-6 flex items-center justify-between flex-wrap gap-3">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-lg gradient-accent flex items-center justify-center">
          <Crown className="w-4 h-4 text-accent-foreground" />
        </div>
        <div>
          <p className="text-sm font-bold text-foreground">
            {subscription ? "مشترك — وصول كامل" : "وصول إداري — كل الميزات"}
          </p>
          <p className="text-[10px] text-muted-foreground">
            {subscription?.packages?.name_ar ?? "صلاحيات المسؤول/المشرف"}
          </p>
        </div>
      </div>
      {subscription && (
        <div className="flex gap-4 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <Calendar className="w-3 h-3 text-primary" />
            من {formatDate(subscription.starts_at)}
          </span>
          <span className="flex items-center gap-1">
            <Calendar className="w-3 h-3 text-destructive" />
            إلى {formatDate(subscription.expires_at)}
          </span>
        </div>
      )}
    </div>
  );
}
