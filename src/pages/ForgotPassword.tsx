import Layout from "@/components/Layout";
import SEO from "@/components/SEO";
import { useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Radar, Mail, ArrowRight } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { translateAuthError } from "@/lib/authErrors";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email) {
      toast.error("يرجى إدخال البريد الإلكتروني");
      return;
    }
    setLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (error) throw error;
      setSent(true);
      toast.success("تم إرسال رابط إعادة التعيين إلى بريدك الإلكتروني");
    } catch (err: any) {
      toast.error(translateAuthError(err) || err.message || "حدث خطأ أثناء الإرسال");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Layout>
      <SEO
        title="نسيت كلمة المرور — VisaRadar"
        description="استرجع كلمة مرور حسابك عبر إرسال رابط التعيين إلى بريدك الإلكتروني."
        path="/auth/forgot-password"
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

            {sent ? (
              <div className="text-center space-y-4">
                <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
                  <Mail className="w-8 h-8 text-primary" />
                </div>
                <h1 className="font-heading text-2xl font-bold text-foreground">تم الإرسال!</h1>
                <p className="text-sm text-muted-foreground">
                  تم إرسال رابط إعادة تعيين كلمة المرور إلى <strong className="text-foreground">{email}</strong>. تحقق من بريدك الإلكتروني واتبع التعليمات.
                </p>
                <p className="text-xs text-muted-foreground">لم تستلم الرسالة؟ تحقق من مجلد الرسائل غير المرغوب فيها.</p>
                <Link
                  to="/auth/login"
                  className="inline-flex items-center gap-2 text-primary hover:underline font-medium text-sm"
                >
                  <ArrowRight className="w-4 h-4" />
                  العودة لتسجيل الدخول
                </Link>
              </div>
            ) : (
              <>
                <h1 className="font-heading text-2xl font-bold text-foreground mb-1">نسيت كلمة المرور؟</h1>
                <p className="text-sm text-muted-foreground mb-6">أدخل بريدك الإلكتروني وسنرسل لك رابط إعادة التعيين</p>

                <form onSubmit={onSubmit} className="space-y-4">
                  <div>
                    <label className="text-sm font-medium text-foreground mb-1.5 block">البريد الإلكتروني</label>
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="example@mail.com"
                      className="w-full bg-muted/50 border border-border/50 rounded-xl px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full gradient-primary text-primary-foreground font-bold py-3 rounded-xl transition-all hover:opacity-90 disabled:opacity-50"
                  >
                    {loading ? "جارٍ الإرسال..." : "إرسال رابط إعادة التعيين"}
                  </button>
                </form>

                <p className="text-center text-sm text-muted-foreground mt-6">
                  تذكرت كلمة المرور؟{" "}
                  <Link to="/auth/login" className="text-primary hover:underline font-medium">
                    تسجيل الدخول
                  </Link>
                </p>
              </>
            )}
          </div>
        </motion.div>
      </div>
    </Layout>
  );
}
