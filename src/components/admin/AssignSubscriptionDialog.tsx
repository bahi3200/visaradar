import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Crown, Loader2 } from "lucide-react";

const COUNTRY_OPTIONS = [
  { code: "IT", flag: "🇮🇹", name: "إيطاليا" },
  { code: "FR", flag: "🇫🇷", name: "فرنسا" },
  { code: "ES", flag: "🇪🇸", name: "إسبانيا" },
  { code: "DE", flag: "🇩🇪", name: "ألمانيا" },
  { code: "GR", flag: "🇬🇷", name: "اليونان" },
];

type Package = {
  id: string;
  name_ar: string;
  duration_months: number;
  max_countries: number;
  is_golden: boolean;
  service_type: string;
  is_active: boolean;
  sort_order: number;
};

type Target = {
  id: string;
  email: string;
  full_name: string;
  hasSubscription: boolean;
  currentPackageName?: string;
};

export default function AssignSubscriptionDialog({
  target,
  onClose,
  onDone,
}: {
  target: Target | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const [packages, setPackages] = useState<Package[]>([]);
  const [packageId, setPackageId] = useState<string>("");
  const [countries, setCountries] = useState<string[]>([]);
  const [serviceType, setServiceType] = useState<"visa" | "jobs" | "both">("both");
  const [monthsOverride, setMonthsOverride] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);

  const selectedPackage = useMemo(
    () => packages.find((p) => p.id === packageId) || null,
    [packages, packageId],
  );

  useEffect(() => {
    if (!target) return;
    (async () => {
      const { data, error } = await supabase
        .from("packages")
        .select("id,name_ar,duration_months,max_countries,is_golden,service_type,is_active,sort_order")
        .eq("is_active", true)
        .order("sort_order", { ascending: true });
      if (error) {
        toast.error("فشل تحميل الباقات");
        return;
      }
      setPackages((data || []) as Package[]);
    })();
    setPackageId("");
    setCountries([]);
    setServiceType("both");
    setMonthsOverride("");
  }, [target]);

  useEffect(() => {
    if (selectedPackage && selectedPackage.service_type !== "both") {
      setServiceType(selectedPackage.service_type as any);
    }
    // Trim countries if exceeds package max
    if (selectedPackage && countries.length > selectedPackage.max_countries) {
      setCountries((prev) => prev.slice(0, selectedPackage.max_countries));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [packageId]);

  const toggleCountry = (code: string) => {
    if (!selectedPackage) return;
    setCountries((prev) => {
      if (prev.includes(code)) return prev.filter((c) => c !== code);
      if (prev.length >= selectedPackage.max_countries) {
        toast.error(`الحد الأقصى ${selectedPackage.max_countries} دولة لهذه الباقة`);
        return prev;
      }
      return [...prev, code];
    });
  };

  const submit = async () => {
    if (!target || !selectedPackage) {
      toast.error("اختر باقة");
      return;
    }
    if (countries.length === 0) {
      toast.error("اختر دولة واحدة على الأقل");
      return;
    }
    const months = monthsOverride.trim()
      ? parseInt(monthsOverride, 10)
      : selectedPackage.duration_months;
    if (!months || months <= 0 || months > 60) {
      toast.error("مدة غير صالحة");
      return;
    }

    setSubmitting(true);
    try {
      // If user already has active subscription(s), expire them (upgrade flow)
      if (target.hasSubscription) {
        const { error: expireErr } = await supabase
          .from("subscriptions")
          .update({ status: "expired", updated_at: new Date().toISOString() })
          .eq("user_id", target.id)
          .eq("status", "active");
        if (expireErr) throw expireErr;
      }

      const expiresAt = new Date();
      expiresAt.setMonth(expiresAt.getMonth() + months);

      const { error: insErr } = await supabase.from("subscriptions").insert({
        user_id: target.id,
        package_id: selectedPackage.id,
        countries,
        service_type: serviceType,
        expires_at: expiresAt.toISOString(),
      });
      if (insErr) throw insErr;

      // Best-effort: log a payment event for admin trail
      await supabase.from("payment_events").insert({
        user_id: target.id,
        event_type: target.hasSubscription ? "admin_upgrade" : "admin_grant",
        status: "success",
        message: `تم ${target.hasSubscription ? "ترقية" : "منح"} اشتراك "${selectedPackage.name_ar}" يدوياً من قبل الإدارة (${months} شهر، الدول: ${countries.join("، ")})`,
      }).then(() => {}).catch(() => {});

      toast.success(
        target.hasSubscription
          ? `تمت ترقية ${target.full_name || target.email} إلى ${selectedPackage.name_ar}`
          : `تم منح ${selectedPackage.name_ar} للمستخدم ${target.full_name || target.email}`,
      );
      onDone();
      onClose();
    } catch (err: any) {
      toast.error(err.message || "فشل تنفيذ العملية");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={!!target} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto" dir="rtl">
        <DialogHeader>
          <DialogTitle className="text-right flex items-center gap-2">
            <Crown className="w-4 h-4 text-yellow-400" />
            {target?.hasSubscription ? "ترقية اشتراك" : "منح اشتراك"}
          </DialogTitle>
          <DialogDescription className="text-right">
            {target?.full_name || target?.email}
            {target?.hasSubscription && target.currentPackageName && (
              <span className="block mt-1 text-xs text-orange-400">
                الاشتراك الحالي: {target.currentPackageName} — سيتم إنهاؤه واستبداله.
              </span>
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label className="text-xs">الباقة</Label>
            <div className="grid grid-cols-1 gap-2 mt-2">
              {packages.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setPackageId(p.id)}
                  className={`text-right p-3 rounded-lg border transition ${
                    packageId === p.id
                      ? "border-primary bg-primary/10"
                      : "border-border/50 hover:bg-secondary/30"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-sm flex items-center gap-1">
                      {p.is_golden && <Crown className="w-3 h-3 text-yellow-400" />}
                      {p.name_ar}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {p.duration_months} شهر • حتى {p.max_countries} دولة
                    </span>
                  </div>
                </button>
              ))}
              {packages.length === 0 && (
                <p className="text-xs text-muted-foreground text-center py-4">
                  لا توجد باقات نشطة
                </p>
              )}
            </div>
          </div>

          {selectedPackage && (
            <>
              <div>
                <Label className="text-xs">
                  الدول ({countries.length}/{selectedPackage.max_countries})
                </Label>
                <div className="flex flex-wrap gap-2 mt-2">
                  {COUNTRY_OPTIONS.map((c) => {
                    const active = countries.includes(c.code);
                    return (
                      <button
                        key={c.code}
                        type="button"
                        onClick={() => toggleCountry(c.code)}
                        className={`text-xs px-3 py-1.5 rounded-lg border transition ${
                          active
                            ? "bg-primary/15 text-primary border-primary/40"
                            : "bg-secondary/30 border-border/50 text-muted-foreground"
                        }`}
                      >
                        {c.flag} {c.name}
                      </button>
                    );
                  })}
                </div>
              </div>

              {selectedPackage.service_type === "both" && (
                <div>
                  <Label className="text-xs">نوع الخدمة</Label>
                  <div className="flex gap-2 mt-2">
                    {(["both", "visa", "jobs"] as const).map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => setServiceType(s)}
                        className={`text-xs px-3 py-1.5 rounded-lg border ${
                          serviceType === s
                            ? "bg-primary/15 text-primary border-primary/40"
                            : "bg-secondary/30 border-border/50 text-muted-foreground"
                        }`}
                      >
                        {s === "both" ? "الكل" : s === "visa" ? "تأشيرات" : "وظائف"}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <Label className="text-xs">
                  المدة (شهور) — اتركه فارغاً لاستخدام مدة الباقة ({selectedPackage.duration_months})
                </Label>
                <Input
                  type="number"
                  min={1}
                  max={60}
                  placeholder={String(selectedPackage.duration_months)}
                  value={monthsOverride}
                  onChange={(e) => setMonthsOverride(e.target.value)}
                  className="mt-2"
                />
              </div>
            </>
          )}

          <div className="flex gap-2 justify-end pt-2">
            <Button variant="outline" onClick={onClose} disabled={submitting}>
              إلغاء
            </Button>
            <Button onClick={submit} disabled={submitting || !selectedPackage}>
              {submitting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : target?.hasSubscription ? (
                "ترقية الاشتراك"
              ) : (
                "منح الاشتراك"
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}