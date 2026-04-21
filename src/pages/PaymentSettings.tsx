import AdminLayout from "@/components/AdminLayout";
import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Save, CreditCard, AlertCircle, X, RefreshCw } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import baridimobLogo from "@/assets/baridimob-logo.png";
import ccpLogo from "@/assets/ccp-logo.png";

const PAYMENT_SETTINGS_QUERY_KEY = ["payment-settings"] as const;

// 🧾 رسائل خطأ موحّدة لكلا سيناريوهَي فشل الحفظ:
// (1) upsert يرجع مصفوفة فارغة (RLS_REJECT)
// (2) upsert يرجع صفاً لكن savedRow لا يمر التطبيع (EMPTY_SAVED_ROW)
// التوحيد يضمن تجربة مستخدم متسقة ونفس صياغة الرسالة في كل مكان.
const SAVE_FAILURE_COPY = {
  message: "⚠️ لم يتم حفظ التغييرات في قاعدة البيانات",
  hint:
    "السبب المحتمل: صلاحيات RLS تمنع الكتابة أو الصف المُرجَع غير صالح. " +
    "تحقق أن المستخدم لديه دور 'admin' في جدول user_roles، ثم أعد المحاولة.",
} as const;

// نوع موحد لصف payment_settings — يطابق ما يعيده .maybeSingle()
// نعرّف الشكل الصلب أولاً (غير-nullable) لاستخدامه في data[0] بأمان
type PaymentSettingsRowFilled = {
  id: string;
  ccp_number: string;
  ccp_key: string;
  rip_number: string;
  account_holder: string;
  referrer_bonus_days?: number;
  referred_bonus_days?: number;
  updated_at?: string;
};

// نوع رد useQuery (يسمح بـ null عند عدم وجود صف)
type PaymentSettingsRow = PaymentSettingsRowFilled | null;

/**
 * 🧰 Helper موحّد: يحوّل أي رد من Supabase
 * (مصفوفة من upsert.select، أو كائن مفرد من maybeSingle، أو null/undefined)
 * إلى نفس شكل PaymentSettingsRow قبل كتابته في الـ cache.
 * يضمن عدم تباين بين useQuery و setQueryData.
 */
const normalizePaymentSettingsRow = (raw: unknown): PaymentSettingsRow => {
  if (raw === null || raw === undefined) return null;

  // إذا كانت مصفوفة (مثل رد upsert.select) — نأخذ أول عنصر
  const candidate = Array.isArray(raw) ? raw[0] : raw;

  if (!candidate || typeof candidate !== "object") return null;

  const c = candidate as Record<string, unknown>;
  const str = (v: unknown): string =>
    v === null || v === undefined ? "" : String(v);

  // التأكد من وجود id كحد أدنى لاعتبار الصف صالحاً
  if (!c.id) return null;

  return {
    id: String(c.id),
    ccp_number: str(c.ccp_number),
    ccp_key: str(c.ccp_key),
    rip_number: str(c.rip_number),
    account_holder: str(c.account_holder),
    referrer_bonus_days:
      typeof c.referrer_bonus_days === "number" ? c.referrer_bonus_days : undefined,
    referred_bonus_days:
      typeof c.referred_bonus_days === "number" ? c.referred_bonus_days : undefined,
    updated_at: typeof c.updated_at === "string" ? c.updated_at : undefined,
  };
};

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
      // 🧰 تطبيع موحّد عبر helper مشترك مع upsert
      return normalizePaymentSettingsRow(data);
    },
  });

  // دالة موحدة (محفوظة بـ useCallback) لتحديث الحقول من بيانات payment_settings
  // setters من React مستقرة بطبيعتها، لذا التبعيات [] تكفي ولن يُعاد إنشاء الدالة
  const applyPaymentSettings = useCallback((data: PaymentSettingsRow) => {
    // 🛡️ Guard 1: تجاهل null/undefined كاملاً
    if (!data) {
      console.warn("[applyPaymentSettings] تم تجاهل التحديث: data فارغ", data);
      return;
    }

    // 🛡️ Guard 2: تأكد أن data كائن (وليس string/number/array)
    if (typeof data !== "object" || Array.isArray(data)) {
      console.warn("[applyPaymentSettings] تم تجاهل التحديث: data ليس كائناً صالحاً", data);
      return;
    }

    // 🛡️ Guard 3: helper آمن — يحوّل null/undefined/non-string إلى ""
    const safe = (v: unknown): string => {
      if (v === null || v === undefined) return "";
      if (typeof v === "string") return v;
      // أرقام أو أنواع أخرى يتم تحويلها لنص لتجنب undefined في input value
      return String(v);
    };

    setCcpNumber(safe(data.ccp_number));
    setCcpKey(safe(data.ccp_key));
    setRipNumber(safe(data.rip_number));
    setAccountHolder(safe(data.account_holder));
  }, []);

  // إخفاء إشعار التزامن عند انتهاء التحقق في الخلفية
  useEffect(() => {
    if (!isFetching && syncing) {
      setSyncing(false);
    }
  }, [isFetching, syncing]);

  // تطبيق بيانات الجلب على الحقول — applyPaymentSettings مستقرة فلا حلقات تكرار
  useEffect(() => {
    applyPaymentSettings(settings);
  }, [settings, applyPaymentSettings]);

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
      // 🎯 نوع صريح لرد upsert: مصفوفة من PaymentSettingsRowFilled أو null
      // هذا يضمن أن TypeScript يعرف أن data[0] (إن وُجد) هو PaymentSettingsRowFilled وليس any
      const { data, error } = (await supabase
        .from("payment_settings")
        .upsert(payload, { onConflict: "id" })
        .select()) as {
        data: PaymentSettingsRowFilled[] | null;
        error: typeof Error.prototype | null | any;
      };
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
        setErrorDetails({
          message: SAVE_FAILURE_COPY.message,
          code: "RLS_REJECT",
          details: "UPSERT returned 0 rows",
          hint: SAVE_FAILURE_COPY.hint,
        });
        toast.error(SAVE_FAILURE_COPY.message, {
          id: toastId,
          description: SAVE_FAILURE_COPY.hint,
        });
        setSaving(false);
        console.groupEnd();
        return; // ⛔ منع تحديث الواجهة
      }

      // 🧰 تطبيع الرد عبر نفس helper المستخدم في useQuery
      // النوع الصريح PaymentSettingsRow يضمن توافق 100% مع cache useQuery
      // 🌀 إظهار spinner قصير أثناء التحقق من شكل savedRow قبل الكتابة في cache
      setSyncing(true);
      const savedRow: PaymentSettingsRow = normalizePaymentSettingsRow(data);
      console.log("step 5 — saved row (normalized):", savedRow);

      // 🛡️ حارس ثانٍ: تأكد أن savedRow كائن صالح قبل لمس الـ cache أو الواجهة
      if (!savedRow) {
        console.warn("step 5 — savedRow is null/undefined despite non-empty data array");
        setErrorDetails({
          message: SAVE_FAILURE_COPY.message,
          code: "EMPTY_SAVED_ROW",
          details: "data[0] resolved to null",
          hint: SAVE_FAILURE_COPY.hint,
        });
        // 🛑 إيقاف spinner فوراً قبل عرض toast الخطأ حتى لا يبقى ظاهراً
        setSyncing(false);
        toast.error(SAVE_FAILURE_COPY.message, {
          id: toastId,
          description: SAVE_FAILURE_COPY.hint,
        });
        setSaving(false);
        console.groupEnd();
        return;
      }

      // ✅ نفس الشكل تماماً (كائن واحد، ليس مصفوفة) لتجنب أي تباين
      queryClient.setQueryData<PaymentSettingsRow>(PAYMENT_SETTINGS_QUERY_KEY, savedRow);
      applyPaymentSettings(savedRow);

      // إعادة التحقق في الخلفية (syncing مُفعَّل مسبقاً)
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

          {/* Syncing Indicator — يظهر بعد الحفظ ويختفي عند انتهاء التحقق في الخلفية */}
          {syncing && (
            <div
              role="status"
              aria-live="polite"
              className="flex items-center gap-2 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 text-xs animate-in fade-in slide-in-from-bottom-1 duration-300"
            >
              <RefreshCw className="w-3.5 h-3.5 text-primary animate-spin shrink-0" />
              <span className="font-medium text-primary">جاري التحقق...</span>
              <span className="text-muted-foreground">
                نتأكد من تزامن البيانات مع الخادم — سيختفي تلقائياً عند الاكتمال
              </span>
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
