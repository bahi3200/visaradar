import { useState } from "react";
import { Link } from "react-router-dom";
import { RefreshCw, Check, Loader2, ArrowLeft, Info, Gift } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/components/ui/use-toast";
import { Switch } from "@/components/ui/switch";

/**
 * Auto-renewal opt-in for CCP/BaridiMob users.
 * When enabled, a renewal subscription_request is auto-created 7 days
 * before expiry — user only needs to pay and upload the receipt.
 */
export default function AutoRenewCard() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [saving, setSaving] = useState(false);

  const { data: sub } = useQuery({
    queryKey: ["auto-renew-sub", user?.id],
    queryFn: async () => {
      if (!user) return null;
      const { data } = await (supabase as any)
        .from("subscriptions")
        .select("id, auto_renew, expires_at, package_id, packages(name_ar, price, promo_price)")
        .eq("user_id", user.id)
        .eq("status", "active")
        .order("expires_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      return data;
    },
    enabled: !!user,
  });

  const { data: pendingRenewal } = useQuery({
    queryKey: ["pending-renewal", sub?.id],
    queryFn: async () => {
      if (!sub?.id) return null;
      const { data } = await (supabase as any)
        .from("subscription_requests")
        .select("id, status, created_at")
        .eq("renewing_subscription_id", sub.id)
        .in("status", ["pending", "under_review"])
        .maybeSingle();
      return data;
    },
    enabled: !!sub?.id,
  });

  const { data: loyalty } = useQuery({
    queryKey: ["renewal-loyalty-discount"],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("site_settings")
        .select("key, value")
        .in("key", ["renewal_loyalty_discount_enabled", "renewal_loyalty_discount_pct"]);
      const map = Object.fromEntries((data ?? []).map((s: any) => [s.key, s.value]));
      return {
        enabled: (map["renewal_loyalty_discount_enabled"] ?? "true") === "true",
        pct: Math.max(0, Math.min(100, Number(map["renewal_loyalty_discount_pct"] ?? "10"))),
      };
    },
  });

  if (!sub) return null;

  const toggle = async (next: boolean) => {
    setSaving(true);
    const { error } = await (supabase as any)
      .from("subscriptions")
      .update({ auto_renew: next })
      .eq("id", sub.id);
    setSaving(false);
    if (error) {
      toast({ title: "تعذّر الحفظ", description: error.message, variant: "destructive" });
      return;
    }
    toast({
      title: next ? "تم تفعيل التجديد التلقائي ✓" : "تم إلغاء التجديد التلقائي",
      description: next
        ? "سيتم إنشاء طلب تجديد جاهز قبل 7 أيام من الانتهاء"
        : "لن يتم إنشاء طلبات تجديد تلقائية",
    });
    qc.invalidateQueries({ queryKey: ["auto-renew-sub", user?.id] });
  };

  const pkg = Array.isArray(sub.packages) ? sub.packages[0] : sub.packages;
  const basePrice = Number(pkg?.promo_price ?? pkg?.price ?? 0);
  const discountActive = !!loyalty?.enabled && (loyalty?.pct ?? 0) > 0;
  const discountAmount = discountActive ? Math.round((basePrice * (loyalty?.pct ?? 0)) / 100) : 0;
  const finalPrice = Math.max(0, basePrice - discountAmount);

  return (
    <div className="gradient-card rounded-xl border border-primary/30 p-4 mb-4">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-lg bg-primary/15 flex items-center justify-center shrink-0">
            <RefreshCw className="w-5 h-5 text-primary" />
          </div>
          <div>
            <p className="text-sm font-bold text-foreground">التجديد التلقائي (CCP/BaridiMob)</p>
            <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">
              عند التفعيل: ننشئ لك طلب تجديد جاهز قبل انتهاء اشتراكك بـ <b>7 أيام</b>،
              وننبّهك عبر تليغرام لتدفع وترفع الإيصال فقط.
            </p>
          </div>
        </div>
        <Switch
          checked={!!sub.auto_renew}
          onCheckedChange={toggle}
          disabled={saving}
          aria-label="تفعيل التجديد التلقائي"
        />
      </div>

      {sub.auto_renew && (
        <div className="rounded-lg bg-primary/5 border border-primary/20 px-3 py-2 text-[11px] text-muted-foreground flex items-start gap-2">
          <Check className="w-3.5 h-3.5 text-primary shrink-0 mt-0.5" />
          <div>
            <span className="font-bold text-foreground">مفعّل</span> — الباقة:{" "}
            <span className="font-bold">{pkg?.name_ar ?? "—"}</span> ·{" "}
            {discountActive ? (
              <>
                <span className="line-through opacity-60">{basePrice.toLocaleString()}</span>{" "}
                <span className="font-bold text-primary">{finalPrice.toLocaleString()} د.ج</span>
              </>
            ) : (
              <span className="font-bold">{basePrice.toLocaleString()} د.ج</span>
            )}
          </div>
        </div>
      )}

      {discountActive && (
        <div className="mt-2 rounded-lg bg-accent/10 border border-accent/30 px-3 py-2 text-[11px] flex items-center gap-2">
          <Gift className="w-3.5 h-3.5 text-accent shrink-0" />
          <span className="text-foreground">
            <b>خصم وفاء {loyalty?.pct}%</b> يُطبَّق تلقائياً على طلب التجديد — وفّر{" "}
            <b className="text-accent">{discountAmount.toLocaleString()} د.ج</b>
          </span>
        </div>
      )}

      {pendingRenewal && (
        <Link
          to="/my-requests"
          className="mt-3 flex items-center justify-between gap-2 rounded-lg bg-accent/10 border border-accent/30 px-3 py-2.5 hover:bg-accent/15 transition-colors"
        >
          <div className="flex items-center gap-2 text-[11px]">
            <Info className="w-3.5 h-3.5 text-accent shrink-0" />
            <span className="text-foreground font-bold">طلب تجديد جاهز بانتظار الدفع</span>
          </div>
          <ArrowLeft className="w-3.5 h-3.5 text-accent" />
        </Link>
      )}

      {saving && (
        <div className="mt-2 flex items-center gap-2 text-[11px] text-muted-foreground">
          <Loader2 className="w-3 h-3 animate-spin" /> جارٍ الحفظ...
        </div>
      )}
    </div>
  );
}