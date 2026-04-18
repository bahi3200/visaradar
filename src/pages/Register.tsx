import Layout from "@/components/Layout";
import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { motion } from "framer-motion";
import { Radar, Eye, EyeOff, AlertTriangle, Gift } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { Button } from "@/components/ui/button";
import { translateAuthError } from "@/lib/authErrors";
import PasswordStrength from "@/components/auth/PasswordStrength";

export default function RegisterPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const referralCode = searchParams.get("ref");

  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [telegramId, setTelegramId] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const inputClass = (field?: string) =>
    `w-full rounded-xl border ${field && fieldErrors[field] ? "border-destructive ring-1 ring-destructive/30" : "border-border/50"} bg-muted/50 px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40`;

  const FieldError = ({ field }: { field: string }) =>
    fieldErrors[field] ? (
      <p className="text-xs text-destructive mt-1 flex items-center gap-1">
        <AlertTriangle className="w-3 h-3 shrink-0" />
        {fieldErrors[field]}
      </p>
    ) : null;

  const clearError = (field: string) => {
    if (fieldErrors[field])
      setFieldErrors((prev) => {
        const n = { ...prev };
        delete n[field];
        return n;
      });
  };

  function validate(): boolean {
    const errors: Record<string, string> = {};
    if (!fullName.trim()) errors.fullName = "الاسم الكامل مطلوب";
    else if (fullName.trim().length < 3) errors.fullName = "الاسم يجب أن يكون 3 أحرف على الأقل";

    if (!email.trim()) errors.email = "البريد الإلكتروني مطلوب";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()))
      errors.email = "صيغة البريد الإلكتروني غير صحيحة (مثال: name@mail.com)";

    if (!password) errors.password = "كلمة المرور مطلوبة";
    else if (password.length < 6) errors.password = "كلمة المرور يجب أن تكون 6 أحرف على الأقل";
    else if (!/[A-Za-z]/.test(password) || !/[0-9]/.test(password))
      errors.password = "يجب أن تحتوي على أحرف وأرقام معاً";

    if (phone && !/^(\+?\d{9,15})$/.test(phone.replace(/\s/g, "")))
      errors.phone = "رقم الهاتف غير صحيح (مثال: +213555123456)";

    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) {
      toast.error("يرجى تصحيح الأخطاء المحددة أدناه");
      return false;
    }
    return true;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;

    setLoading(true);
    try {
      const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { full_name: fullName, phone, telegram_id: telegramId },
        },
      });

      if (signUpError) {
        toast.error(translateAuthError(signUpError) || signUpError.message);
        return;
      }

      const user = signUpData.user;
      if (!user) {
        toast.error("حدث خطأ في إنشاء الحساب");
        return;
      }

      // Record referral if applicable
      if (referralCode) {
        const { data: referrerProfile } = await supabase
          .from("profiles")
          .select("user_id")
          .eq("referral_code", referralCode)
          .single();
        if (referrerProfile) {
          await supabase.from("referrals").insert({
            referrer_id: referrerProfile.user_id,
            referred_id: user.id,
          });
        }
      }

      toast.success("تم إنشاء حسابك بنجاح! يمكنك الآن الاشتراك من صفحة الباقات.");
      navigate("/pricing");
    } catch (err: any) {
      toast.error(err.message || "حدث خطأ غير متوقع");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Layout>
      <div className="container flex items-center justify-center min-h-[70vh] py-10">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-md"
        >
          <form onSubmit={handleSubmit} className="gradient-card rounded-2xl border border-border/50 shadow-card p-6 sm:p-8">
            {/* Header */}
            <div className="flex flex-col items-center gap-2 mb-6">
              <Radar className="w-8 h-8 text-primary" />
              <span className="font-heading text-xl font-bold text-foreground">
                Visa<span className="text-primary">Radar</span>
              </span>
              <h1 className="text-lg font-bold text-foreground mt-1">إنشاء حساب جديد</h1>
              <p className="text-xs text-muted-foreground">أنشئ حسابك مجاناً ثم اشترك في الباقة المناسبة لك</p>
            </div>

            {/* Referral banner */}
            {referralCode && (
              <div className="mb-4 rounded-lg bg-accent/10 border border-accent/30 px-4 py-2.5 text-sm text-foreground flex items-center gap-2">
                <Gift className="w-4 h-4 text-accent shrink-0" />
                <span>تم تطبيق رمز إحالة! ستحصل على خصم خاص عند الاشتراك</span>
              </div>
            )}

            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium text-foreground mb-1.5 block">الاسم الكامل *</label>
                <input
                  type="text"
                  value={fullName}
                  onChange={(e) => { setFullName(e.target.value); clearError("fullName"); }}
                  placeholder="محمد أحمد"
                  className={inputClass("fullName")}
                />
                <FieldError field="fullName" />
              </div>

              <div>
                <label className="text-sm font-medium text-foreground mb-1.5 block">البريد الإلكتروني *</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => { setEmail(e.target.value); clearError("email"); }}
                  placeholder="example@mail.com"
                  className={inputClass("email")}
                />
                <FieldError field="email" />
              </div>

              <div>
                <label className="text-sm font-medium text-foreground mb-1.5 block">كلمة المرور *</label>
                <div className="relative">
                  <input
                    type={showPass ? "text" : "password"}
                    value={password}
                    onChange={(e) => { setPassword(e.target.value); clearError("password"); }}
                    placeholder="أحرف وأرقام، 6 خانات على الأقل"
                    className={inputClass("password")}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPass(!showPass)}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                <FieldError field="password" />
                <PasswordStrength password={password} />
              </div>

              <div>
                <label className="text-sm font-medium text-foreground mb-1.5 block">رقم الهاتف</label>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => { setPhone(e.target.value); clearError("phone"); }}
                  placeholder="+213555123456"
                  className={inputClass("phone")}
                />
                <FieldError field="phone" />
              </div>

              <div>
                <label className="text-sm font-medium text-foreground mb-1.5 block">معرّف تليغرام</label>
                <input
                  type="text"
                  value={telegramId}
                  onChange={(e) => setTelegramId(e.target.value)}
                  placeholder="@username أو Chat ID"
                  className={inputClass()}
                />
              </div>
            </div>

            <Button
              type="submit"
              disabled={loading}
              className="w-full mt-6 h-12 text-base font-bold rounded-xl"
            >
              {loading ? "جاري إنشاء الحساب..." : "إنشاء حساب"}
            </Button>

            {/* Google login */}
            <Button
              type="button"
              variant="outline"
              className="w-full mt-3 h-11 rounded-xl gap-2"
              onClick={async () => {
                const result = await lovable.auth.signInWithOAuth("google", {
                  redirect_uri: window.location.origin,
                });
                if (result.error) {
                  toast.error("فشل التسجيل بحساب Google");
                }
              }}
            >
              <img src="https://www.google.com/favicon.ico" alt="Google" className="w-4 h-4" />
              التسجيل بحساب Google
            </Button>

            <p className="text-center text-xs text-muted-foreground mt-4">
              لديك حساب بالفعل؟{" "}
              <Link to="/auth/login" className="text-primary hover:underline font-medium">
                تسجيل الدخول
              </Link>
            </p>
          </form>
        </motion.div>
      </div>
    </Layout>
  );
}
