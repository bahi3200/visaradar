import Layout from "@/components/Layout";
import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Radar, Eye, EyeOff, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { translateAuthError } from "@/lib/authErrors";

export default function ResetPasswordPage() {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [hasSession, setHasSession] = useState(false);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    // Check if user arrived via recovery link
    const hash = window.location.hash;
    if (hash && hash.includes("type=recovery")) {
      setHasSession(true);
    }

    supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") {
        setHasSession(true);
      }
    });

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) setHasSession(true);
      setChecking(false);
    });
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!password || !confirmPassword) {
      toast.error("يرجى تعبئة جميع الحقول");
      return;
    }
    if (password.length < 6) {
      toast.error("كلمة المرور يجب أن تكون 6 أحرف على الأقل");
      return;
    }
    if (password !== confirmPassword) {
      toast.error("كلمتا المرور غير متطابقتين");
      return;
    }
    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      setSuccess(true);
      toast.success("تم تغيير كلمة المرور بنجاح!");
    } catch (err: any) {
      toast.error(translateAuthError(err) || err.message || "حدث خطأ أثناء تغيير كلمة المرور");
    } finally {
      setLoading(false);
    }
  }

  if (checking) return null;

  return (
    <Layout>
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

            {success ? (
              <div className="text-center space-y-4">
                <div className="w-16 h-16 rounded-full bg-green-500/10 flex items-center justify-center mx-auto">
                  <CheckCircle2 className="w-8 h-8 text-green-400" />
                </div>
                <h1 className="font-heading text-2xl font-bold text-foreground">تم التغيير!</h1>
                <p className="text-sm text-muted-foreground">تم تغيير كلمة المرور بنجاح. يمكنك الآن تسجيل الدخول.</p>
                <Link
                  to="/auth/login"
                  className="inline-block gradient-primary text-primary-foreground font-bold px-6 py-3 rounded-xl hover:opacity-90 transition-all"
                >
                  تسجيل الدخول
                </Link>
              </div>
            ) : !hasSession ? (
              <div className="text-center space-y-4">
                <h1 className="font-heading text-2xl font-bold text-foreground">رابط غير صالح</h1>
                <p className="text-sm text-muted-foreground">
                  هذا الرابط غير صالح أو منتهي الصلاحية. يرجى طلب رابط جديد.
                </p>
                <Link
                  to="/auth/forgot-password"
                  className="inline-block gradient-primary text-primary-foreground font-bold px-6 py-3 rounded-xl hover:opacity-90 transition-all"
                >
                  طلب رابط جديد
                </Link>
              </div>
            ) : (
              <>
                <h1 className="font-heading text-2xl font-bold text-foreground mb-1">تعيين كلمة مرور جديدة</h1>
                <p className="text-sm text-muted-foreground mb-6">أدخل كلمة المرور الجديدة</p>

                <form onSubmit={onSubmit} className="space-y-4">
                  <div>
                    <label className="text-sm font-medium text-foreground mb-1.5 block">كلمة المرور الجديدة</label>
                    <div className="relative">
                      <input
                        type={showPass ? "text" : "password"}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="6 أحرف على الأقل"
                        className="w-full bg-muted/50 border border-border/50 rounded-xl px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPass(!showPass)}
                        className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      >
                        {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-foreground mb-1.5 block">تأكيد كلمة المرور</label>
                    <input
                      type="password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="أعد إدخال كلمة المرور"
                      className="w-full bg-muted/50 border border-border/50 rounded-xl px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full gradient-primary text-primary-foreground font-bold py-3 rounded-xl transition-all hover:opacity-90 disabled:opacity-50"
                  >
                    {loading ? "جارٍ التغيير..." : "تغيير كلمة المرور"}
                  </button>
                </form>
              </>
            )}
          </div>
        </motion.div>
      </div>
    </Layout>
  );
}
