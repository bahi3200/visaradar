import AdminLayout from "@/components/AdminLayout";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Save, CreditCard, AlertCircle, X, RefreshCw } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import baridimobLogo from "@/assets/baridimob-logo.png";
import ccpLogo from "@/assets/ccp-logo.png";

const PAYMENT_SETTINGS_QUERY_KEY = ["payment-settings"] as const;

// نوع موحد لصف payment_settings — يطابق ما يعيده .maybeSingle()
type PaymentSettingsRow = {
  id: string;
  ccp_number: string;
  ccp_key: string;
  rip_number: string;
  account_holder: string;
  referrer_bonus_days?: number;
  referred_bonus_days?: number;
  updated_at?: string;
} | null;

export default function PaymentSettingsPage() {
  const queryClient = useQueryClient();
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [ccpNumber, setCcpNumber] = useState("");
  const [ccpKey, setCcpKey] = useState("");
  const [ripNumber, setRipNumber] = useState("");
  const [accountHolder, setAccountHolder] = useState("");
  const [errorDetails, setErrorDetails] = useState<{
    message: string;
    code?: string;
    details?: string;
    hint?: string;
  } | null>(null);

  const { data: settings, isLoading, isFetching } = useQuery<PaymentSettingsRow>({
    queryKey: PAYMENT_SETTINGS_QUERY_KEY,
    queryFn: async () => {
      console.groupCollapsed("[PaymentSettings] FETCH payment_settings");
      const t0 = performance.now();
      const { data, error } = await supabase
        .from("payment_settings")
        .select("*")
        .limit(1)
        .maybeSingle();
      console.log("duration_ms:", (performance.now() - t0).toFixed(1));
      console.log("data:", data);
      if (error) {
        console.error("fetch error:", {
          message: error.message,
          code: (error as any).code,
          details: (error as any).details,
          hint: (error as any).hint,
        });
        console.groupEnd();
        throw error;
      }
      console.groupEnd();
      return (data as PaymentSettingsRow) ?? null;
    },
  });

  // إخفاء إشعار التزامن عند انتهاء التحقق في الخلفية
  // دالة موحدة لتحديث الحقول من بيانات payment_settings
  const applyPaymentSettings = (data: PaymentSettingsRow) => {
    if (!data) return;
    setCcpNumber(data.ccp_number || "");
    setCcpKey(data.ccp_key || "");
    setRipNumber(data.rip_number || "");
    setAccountHolder(data.account_holder || "");
  };

  useEffect(() => {
    if (!isFetching && syncing) {
      setSyncing(false);
    }
  }, [isFetching]);

  useEffect(() => {
    applyPaymentSettings(settings);
  }, [settings]);

  const handleSave = async () => {
    setSaving(true);
    setErrorDetails(null);
    const toastId = toast.loading("جاري حفظ معلومات الدفع...");
    console.group("[PaymentSettings] SAVE flow");
    try {
      // 🔍 Debug: verify session + admin role before write
      const { data: sessionData } = await supabase.auth.getSession();
      const userId = sessionData?.session?.user?.id;
      console.log("step 1 — auth.uid():", userId, "email:", sessionData?.session?.user?.email);

      if (!userId) {
        throw new Error("لا توجد جلسة مصادقة. يرجى تسجيل الدخول.");
      }

      const { data: roleCheck, error: roleErr } = await supabase
        .rpc("has_role", { _user_id: userId, _role: "admin" });
      console.log("step 2 — has_role(admin):", roleCheck, "err:", roleErr);

      if (roleErr) {
        setErrorDetails({
          message: "فشل التحقق من الدور: " + roleErr.message,
          code: (roleErr as any).code,
          details: (roleErr as any).details,
          hint: (roleErr as any).hint,
        });
        throw roleErr;
      }
      if (!roleCheck) {
        const msg = "المستخدم الحالي ليس لديه دور admin — RLS سيرفض العملية.";
        setErrorDetails({
          message: msg,
          hint: `user_id: ${userId}. أضف صفاً في user_roles بدور admin لهذا المستخدم.`,
        });
        throw new Error(msg);
      }

      const payload: any = {
        ccp_number: ccpNumber.trim(),
        ccp_key: ccpKey.trim(),
        rip_number: ripNumber.trim(),
        account_holder: accountHolder.trim(),
        updated_at: new Date().toISOString(),
      };
      if (settings?.id) {
        payload.id = settings.id;
      }
      console.log("step 3 — upsert payload:", payload);
      const writeStart = performance.now();
      const { data, error } = await supabase
        .from("payment_settings")
        .upsert(payload, { onConflict: "id" })
        .select();
      console.log(
        "step 4 — upsert response: duration_ms=",
        (performance.now() - writeStart).toFixed(1),
        "rows=",
        data?.length ?? 0
      );
      if (error) {
        console.error("step 4 — upsert ERROR:", {
          message: error.message,
          code: (error as any).code,
          details: (error as any).details,
          hint: (error as any).hint,
        });
        setErrorDetails({
          message: error.message,
          code: (error as any).code,
          details: (error as any).details,
          hint: (error as any).hint,
        });
        throw error;
      }
      if (!data || data.length === 0) {
        console.warn("step 4 — upsert returned 0 rows (silent RLS reject)");
        const msg = "⚠️ لم يتم حفظ التغييرات في قاعدة البيانات";
        const hint = "السبب المحتمل: صلاحيات RLS تمنع الكتابة. تحقق أن المستخدم لديه دور 'admin' في جدول user_roles.";
        setErrorDetails({ message: msg, code: "RLS_REJECT", details: "UPSERT returned 0 rows", hint });
        toast.error(msg, { id: toastId, description: hint });
        setSaving(false);
        console.groupEnd();
        return; // ⛔ منع تحديث الواجهة
      }

      const savedRow = data[0];
      console.log("step 5 — saved row:", savedRow);

      // ✅ تحديث الواجهة فقط بعد التأكد من وجود بيانات
      queryClient.setQueryData(PAYMENT_SETTINGS_QUERY_KEY, savedRow);
      applyPaymentSettings(savedRow);

      // إعادة التحقق في الخلفية
      setSyncing(true);
      queryClient.invalidateQueries({ queryKey: PAYMENT_SETTINGS_QUERY_KEY });
      toast.success("✅ تم حفظ معلومات الدفع بنجاح", { id: toastId });
    } catch (err: any) {
      console.error("[PaymentSettings] SAVE failed:", err);
      toast.error(err.message || "حدث خطأ أثناء الحفظ", { id: toastId });
    } finally {
      console.groupEnd();
      setSaving(false);
    }
  };

  const inputClass =
    "w-full rounded-xl border border-border/50 bg-secondary/30 px-4 py-3 text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/50 font-mono tracking-wider";

  return (
    <AdminLayout title="إعدادات الدفع" subtitle="إدارة أرقام CCP و BaridiMob المعروضة للمشتركين">
      {isLoading ? (
        <div className="flex justify-center py-20">
          <div className="w-8 h-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
        </div>
      ) : (
        <div className="max-w-2xl space-y-6">
          {/* CCP Section */}
          <div className="gradient-card rounded-2xl border border-border/50 p-6">
            <div className="flex items-center gap-3 mb-5">
              <img src={ccpLogo} alt="CCP" className="h-10 w-auto" />
              <div>
                <h3 className="font-heading font-bold text-foreground">حساب CCP</h3>
                <p className="text-xs text-muted-foreground">بريد الجزائر</p>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1.5">رقم الحساب CCP</label>
                <input
                  type="text"
                  value={ccpNumber}
                  onChange={(e) => setCcpNumber(e.target.value)}
                  placeholder="مثال: 1234567890"
                  className={inputClass}
                  dir="ltr"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1.5">المفتاح (Clé)</label>
                <input
                  type="text"
                  value={ccpKey}
                  onChange={(e) => setCcpKey(e.target.value)}
                  placeholder="مثال: 42"
                  className={inputClass}
                  dir="ltr"
                />
              </div>
            </div>
          </div>

          {/* BaridiMob Section */}
          <div className="gradient-card rounded-2xl border border-border/50 p-6">
            <div className="flex items-center gap-3 mb-5">
              <img src={baridimobLogo} alt="BaridiMob" className="h-10 w-auto" />
              <div>
                <h3 className="font-heading font-bold text-foreground">BaridiMob</h3>
                <p className="text-xs text-muted-foreground">التحويل عبر التطبيق</p>
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1.5">رقم RIP</label>
              <input
                type="text"
                value={ripNumber}
                onChange={(e) => setRipNumber(e.target.value)}
                placeholder="مثال: 00799999000123456789"
                className={inputClass}
                dir="ltr"
              />
            </div>
          </div>

          {/* Account Holder */}
          <div className="gradient-card rounded-2xl border border-border/50 p-6">
            <div className="flex items-center gap-3 mb-5">
              <CreditCard className="w-5 h-5 text-primary" />
              <div>
                <h3 className="font-heading font-bold text-foreground">صاحب الحساب</h3>
                <p className="text-xs text-muted-foreground">الاسم المعروض للمشتركين</p>
              </div>
            </div>
            <input
              type="text"
              value={accountHolder}
              onChange={(e) => setAccountHolder(e.target.value)}
              placeholder="مثال: محمد أحمد"
              className="w-full rounded-xl border border-border/50 bg-secondary/30 px-4 py-3 text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
          </div>

          {/* Error Banner */}
          {errorDetails && (
            <div
              role="alert"
              className="rounded-2xl border border-destructive/40 bg-destructive/10 p-4 flex items-start gap-3"
            >
              <AlertCircle className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0 space-y-1.5">
                <p className="font-bold text-destructive">فشل الحفظ</p>
                <p className="text-sm text-foreground break-words">
                  {errorDetails.message}
                </p>
                {errorDetails.code && (
                  <p className="text-xs text-muted-foreground font-mono">
                    code: {errorDetails.code}
                  </p>
                )}
                {errorDetails.details && (
                  <p className="text-xs text-muted-foreground break-words">
                    {errorDetails.details}
                  </p>
                )}
                {errorDetails.hint && (
                  <p className="text-xs text-muted-foreground break-words">
                    💡 {errorDetails.hint}
                  </p>
                )}
              </div>
              <button
                onClick={() => setErrorDetails(null)}
                className="text-muted-foreground hover:text-foreground transition-colors shrink-0"
                aria-label="إغلاق"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* Syncing Indicator */}
          {syncing && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground animate-pulse">
              <RefreshCw className="w-3 h-3 animate-spin" />
              <span>جاري التحقق من التزامن مع الخادم...</span>
            </div>
          )}

          {/* Save Button */}
          <button
            onClick={handleSave}
            disabled={saving}
            className="w-full py-4 rounded-xl font-bold gradient-primary text-primary-foreground hover:opacity-90 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {saving ? (
              <div className="w-5 h-5 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
            ) : (
              <Save className="w-4 h-4" />
            )}
            {saving ? "جاري الحفظ..." : "حفظ التغييرات"}
          </button>
        </div>
      )}
    </AdminLayout>
  );
}
