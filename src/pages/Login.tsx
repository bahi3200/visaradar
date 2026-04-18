import Layout from "@/components/Layout";
import SEO from "@/components/SEO";
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Radar, Eye, EyeOff, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { translateAuthError } from "@/lib/authErrors";

export default function LoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [shakeBtn, setShakeBtn] = useState(false);

  const clearError = (field: string) => {
    if (fieldErrors[field]) setFieldErrors(prev => { const n = { ...prev }; delete n[field]; return n; });
  };

  function validate(): boolean {
    const errors: Record<string, string> = {};
    if (!email.trim()) errors.email = "البريد الإلكتروني مطلوب";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) errors.email = "صيغة البريد غير صحيحة (مثال: name@mail.com)";
    if (!password) errors.password = "كلمة المرور مطلوبة";
    else if (password.length < 6) errors.password = "كلمة المرور يجب أن تكون 6 أحرف على الأقل";
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) {
      toast.error("يرجى تصحيح الأخطاء المحددة أدناه");
      setShakeBtn(true);
      setTimeout(() => setShakeBtn(false), 500);
      return false;
    }
    return true;
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        const translated = translateAuthError(error);
        if (error.message.includes("Invalid login") || error.message.includes("invalid_credentials")) {
          setFieldErrors({ password: "البريد الإلكتروني أو كلمة المرور غير صحيحة" });
          toast.error(translated || "بيانات الدخول غير صحيحة، تحقق وأعد المحاولة");
        } else {
          toast.error(translated || error.message);
        }
        return;
      }
      toast.success("تم تسجيل الدخول بنجاح");
      navigate("/");
    } catch {
      toast.error("حدث خطأ غير متوقع، أعد المحاولة لاحقاً");
    } finally {
      setLoading(false);
    }
  }

  const inputClass = (field: string) => `w-full bg-muted/50 border ${fieldErrors[field] ? "border-destructive ring-1 ring-destructive/30" : "border-border/50"} rounded-xl px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40`;

  const FieldError = ({ field }: { field: string }) => fieldErrors[field] ? (
    <p className="text-xs text-destructive mt-1 flex items-center gap-1">
      <AlertTriangle className="w-3 h-3 shrink-0" />
      {fieldErrors[field]}
    </p>
  ) : null;

  return (
    <Layout>
      <SEO
        title="تسجيل الدخول — VisaRadar"
        description="ادخل إلى حسابك في VisaRadar للوصول إلى تنبيهات الفيزا وعروض العمل المخصصة."
        path="/auth/login"
        noindex
      />
      <div className="container flex items-center justify-center min-h-[70vh] py-10">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-md"
        >
          <div className="gradient-card rounded-2xl border border-border/50 shadow-card p-8">
            <div className="flex items-center gap-2 mb-6">
              <Radar className="w-7 h-7 text-primary" />
              <span className="font-heading text-xl font-bold text-foreground">
                Visa<span className="text-primary">Radar</span>
              </span>
            </div>
            <h1 className="font-heading text-2xl font-bold text-foreground mb-1">تسجيل الدخول</h1>
            <p className="text-sm text-muted-foreground mb-6">أدخل بياناتك للوصول إلى لوحة التحكم</p>

            <form onSubmit={onSubmit} className="space-y-4">
              <div>
                <label className="text-sm font-medium text-foreground mb-1.5 block">البريد الإلكتروني</label>
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
                <label className="text-sm font-medium text-foreground mb-1.5 block">كلمة المرور</label>
                <div className="relative">
                  <input
                    type={showPass ? "text" : "password"}
                    value={password}
                    onChange={(e) => { setPassword(e.target.value); clearError("password"); }}
                    placeholder="••••••••"
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
              </div>

              <motion.button
                type="submit"
                disabled={loading}
                animate={shakeBtn ? { x: [0, -8, 8, -6, 6, -3, 3, 0] } : {}}
                transition={{ duration: 0.4 }}
                className="w-full gradient-primary text-primary-foreground font-bold py-3 rounded-xl transition-all hover:opacity-90 disabled:opacity-50"
              >
                {loading ? "جارٍ الدخول..." : "دخول"}
              </motion.button>
            </form>

            <div className="flex items-center gap-3 my-5">
              <div className="flex-1 h-px bg-border/50" />
              <span className="text-xs text-muted-foreground">أو</span>
              <div className="flex-1 h-px bg-border/50" />
            </div>

            <button
              onClick={async () => {
                const result = await lovable.auth.signInWithOAuth("google", {
                  redirect_uri: window.location.origin,
                });
                if (result.error) {
                  toast.error("فشل تسجيل الدخول بحساب Google");
                }
              }}
              className="w-full flex items-center justify-center gap-3 border border-border/50 rounded-xl py-3 text-sm font-medium text-foreground hover:bg-muted/50 transition-colors"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>
              الدخول بحساب Google
            </button>

            <div className="flex items-center justify-between text-sm mt-4">
              <Link to="/auth/forgot-password" className="text-muted-foreground hover:text-primary transition-colors">
                نسيت كلمة المرور؟
              </Link>
            </div>

            <p className="text-center text-sm text-muted-foreground mt-6">
              ليس لديك حساب؟{" "}
              <Link to="/auth/register" className="text-primary hover:underline font-medium">
                إنشاء حساب جديد
              </Link>
            </p>
          </div>
        </motion.div>
      </div>
    </Layout>
  );
}
