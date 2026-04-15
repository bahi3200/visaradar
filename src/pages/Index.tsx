import Layout from "@/components/Layout";
import { motion } from "framer-motion";
import { Bell, Briefcase, ArrowLeft, Shield, Zap, Globe, Eye, Crown, Lock, Calendar } from "lucide-react";
import { Link } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import heroBg from "@/assets/hero-bg.jpg";
import HeroSection from "@/components/home/HeroSection";
import StatsSection from "@/components/home/StatsSection";
import HowItWorksSection from "@/components/home/HowItWorksSection";
import TestimonialsSection from "@/components/home/TestimonialsSection";
import FAQSection from "@/components/home/FAQSection";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import SubscriberHome from "@/pages/SubscriberHome";

const visaCountries = [
  { flag: "🇮🇹", name: "إيطاليا", provider: "VFS Global" },
  { flag: "🇫🇷", name: "فرنسا", provider: "TLScontact" },
  { flag: "🇪🇸", name: "إسبانيا", provider: "BLS International" },
];

export default function HomePage() {
  const { user } = useAuth();
  const reduced = useReducedMotion();

  const { data: subscription } = useQuery({
    queryKey: ["my-subscription", user?.id],
    queryFn: async () => {
      if (!user) return null;
      const { data } = await supabase
        .from("subscriptions")
        .select("*, packages(*)")
        .eq("user_id", user.id)
        .eq("status", "active")
        .maybeSingle();
      return data;
    },
    enabled: !!user,
  });

  const formatDate = (d: string) => new Date(d).toLocaleDateString("ar-DZ", { year: "numeric", month: "long", day: "numeric" });
  const noMotion = { opacity: 1, y: 0, x: 0, scale: 1 };

  return (
    <Layout>
      {/* Hero */}
      <HeroSection user={user} />

      {/* Stats */}
      <StatsSection />

      {/* Active Subscription Info */}
      {subscription && (
        <section className="container pb-8">
          <motion.div
            initial={reduced ? noMotion : { opacity: 0, y: 10 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="gradient-card rounded-2xl border border-accent/30 p-6 shadow-card max-w-2xl mx-auto"
          >
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl gradient-accent flex items-center justify-center">
                <Crown className="w-5 h-5 text-accent-foreground" />
              </div>
              <div>
                <h3 className="font-heading text-base font-bold text-foreground">اشتراكك الحالي</h3>
                <span className="text-xs text-accent font-bold">{(subscription as any).packages?.name_ar}</span>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-muted/50 rounded-xl p-3 text-center">
                <Calendar className="w-4 h-4 text-primary mx-auto mb-1" />
                <p className="text-[10px] text-muted-foreground mb-0.5">بداية الاشتراك</p>
                <p className="text-sm font-bold text-foreground">{formatDate(subscription.starts_at)}</p>
              </div>
              <div className="bg-muted/50 rounded-xl p-3 text-center">
                <Calendar className="w-4 h-4 text-destructive mx-auto mb-1" />
                <p className="text-[10px] text-muted-foreground mb-0.5">نهاية الاشتراك</p>
                <p className="text-sm font-bold text-foreground">{formatDate(subscription.expires_at)}</p>
              </div>
            </div>
          </motion.div>
        </section>
      )}

      {/* Monitored Countries */}
      <section className="container py-14">
        <motion.h2 initial={reduced ? noMotion : { opacity: 0, y: 15 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "-50px" }} className="font-heading text-2xl md:text-3xl font-bold text-foreground text-center mb-3">الدول المراقبة</motion.h2>
        <motion.p initial={reduced ? noMotion : { opacity: 0, y: 10 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "-50px" }} transition={reduced ? { duration: 0 } : { delay: 0.1 }} className="text-sm text-muted-foreground text-center mb-8">نراقب مواعيد التأشيرات على مدار الساعة من المصادر الرسمية</motion.p>
        <div className="grid grid-cols-3 gap-4 max-w-3xl mx-auto">
          {visaCountries.map((c, i) => (
            <motion.div
              key={c.name}
              initial={reduced ? noMotion : { opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              {...(!reduced && {
                whileHover: { y: -8, scale: 1.04, transition: { type: "spring", stiffness: 300, damping: 20 } },
              })}
              viewport={{ once: true }}
              transition={reduced ? { duration: 0.15 } : { delay: 0.1 * i }}
              className="gradient-card rounded-2xl border border-border/50 p-5 shadow-card text-center hover:border-accent/30 hover:shadow-[0_12px_35px_-10px_hsl(var(--accent)/0.25)] transition-colors cursor-default group"
            >
              <span className="text-4xl block mb-2 group-hover:scale-110 transition-transform duration-300">{c.flag}</span>
              <h3 className="font-heading text-sm font-bold text-foreground mb-0.5 group-hover:text-accent transition-colors">{c.name}</h3>
              <p className="text-[10px] text-muted-foreground">{c.provider}</p>
              <div className="mt-2 inline-flex items-center gap-1 text-[10px] text-primary bg-primary/10 px-2 py-0.5 rounded-full group-hover:bg-accent/15 group-hover:text-accent transition-colors">
                <Bell className="w-2.5 h-2.5" />
                مراقبة نشطة
              </div>
            </motion.div>
          ))}
        </div>
      </section>

      {/* How It Works */}
      <HowItWorksSection />

      {/* Two Services */}
      <section className="container pb-14">
        <motion.h2 initial={reduced ? noMotion : { opacity: 0, y: 15 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "-50px" }} className="font-heading text-2xl md:text-3xl font-bold text-foreground text-center mb-3">ماذا تحصل مع الاشتراك؟</motion.h2>
        <motion.p initial={reduced ? noMotion : { opacity: 0, y: 10 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "-50px" }} transition={reduced ? { duration: 0 } : { delay: 0.1 }} className="text-sm text-muted-foreground text-center mb-8">خدمتان في اشتراك واحد</motion.p>
        <div className="grid md:grid-cols-2 gap-6 max-w-4xl mx-auto">
          {/* Visa */}
          <motion.div initial={reduced ? noMotion : { opacity: 0, x: -20 }} whileInView={{ opacity: 1, x: 0 }} {...(!reduced && { whileHover: { y: -6, transition: { type: "spring", stiffness: 300, damping: 20 } } })} viewport={{ once: true }} className="gradient-card rounded-2xl border border-accent/30 p-6 shadow-card relative overflow-hidden hover:shadow-[0_12px_40px_-10px_hsl(var(--accent)/0.3)] transition-shadow cursor-default group">
            <div className="absolute top-0 left-0 right-0 h-1 gradient-accent group-hover:h-1.5 transition-all" />
            <div className="flex items-center gap-3 mb-4">
              <div className="w-11 h-11 rounded-xl gradient-accent flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
                <Bell className="w-5 h-5 text-accent-foreground" />
              </div>
              <div>
                <h3 className="font-heading text-base font-bold text-foreground">تنبيهات التأشيرات</h3>
                <span className="gradient-accent text-accent-foreground text-[10px] font-bold px-2 py-0.5 rounded-full">الميزة الرئيسية</span>
              </div>
            </div>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li className="flex items-center gap-2"><Zap className="w-3.5 h-3.5 text-accent shrink-0" />تنبيه فوري عبر تليغرام</li>
              <li className="flex items-center gap-2"><Eye className="w-3.5 h-3.5 text-accent shrink-0" />مراقبة 24/7 كل 5 دقائق</li>
              <li className="flex items-center gap-2"><Globe className="w-3.5 h-3.5 text-accent shrink-0" />إيطاليا، فرنسا، إسبانيا</li>
              <li className="flex items-center gap-2"><Crown className="w-3.5 h-3.5 text-accent shrink-0" />باقات 3، 6، و 12 شهر</li>
              <li className="flex items-center gap-2"><Shield className="w-3.5 h-3.5 text-accent shrink-0" />حماية من مشاركة الحساب</li>
            </ul>
          </motion.div>

          {/* Jobs */}
          <motion.div initial={reduced ? noMotion : { opacity: 0, x: 20 }} whileInView={{ opacity: 1, x: 0 }} {...(!reduced && { whileHover: { y: -6, transition: { type: "spring", stiffness: 300, damping: 20 } } })} viewport={{ once: true }} className="gradient-card rounded-2xl border border-primary/30 p-6 shadow-card relative overflow-hidden hover:shadow-[0_12px_40px_-10px_hsl(var(--primary)/0.3)] transition-shadow cursor-default group">
            <div className="absolute top-0 left-0 right-0 h-1 gradient-primary group-hover:h-1.5 transition-all" />
            <div className="flex items-center gap-3 mb-4">
              <div className="w-11 h-11 rounded-xl gradient-primary flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
                <Briefcase className="w-5 h-5 text-primary-foreground" />
              </div>
              <div>
                <h3 className="font-heading text-base font-bold text-foreground">عقود العمل</h3>
                <span className="gradient-primary text-primary-foreground text-[10px] font-bold px-2 py-0.5 rounded-full">أوروبا وكندا</span>
              </div>
            </div>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li className="flex items-center gap-2"><Briefcase className="w-3.5 h-3.5 text-primary shrink-0" />وظائف محدّثة من مصادر رسمية</li>
              <li className="flex items-center gap-2"><Globe className="w-3.5 h-3.5 text-primary shrink-0" />فرص في كندا، فرنسا، ألمانيا وأكثر</li>
              <li className="flex items-center gap-2"><Shield className="w-3.5 h-3.5 text-primary shrink-0" />تفاصيل كاملة ومتطلبات التقديم</li>
              <li className="flex items-center gap-2"><Lock className="w-3.5 h-3.5 text-primary shrink-0" />حصرياً للمشتركين</li>
              <li className="flex items-center gap-2"><Eye className="w-3.5 h-3.5 text-primary shrink-0" />تصفية حسب الدولة والعقد والراتب</li>
            </ul>
          </motion.div>
        </div>

        {/* Subscribe CTA */}
        <motion.div initial={reduced ? noMotion : { opacity: 0, y: 15 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={reduced ? { duration: 0 } : { delay: 0.2 }} className="text-center mt-8">
          <Link
            to={user ? "/pricing" : "/auth/register"}
            className="inline-flex items-center gap-3 bg-accent hover:bg-accent/90 text-accent-foreground font-bold text-base px-8 py-3.5 rounded-full transition-all shadow-lg hover:-translate-y-0.5"
          >
            اشترك الآن — باقات 3، 6، و 12 شهر
            <ArrowLeft className="w-5 h-5" />
          </Link>
        </motion.div>
      </section>

      {/* Testimonials */}
      <TestimonialsSection />

      {/* FAQ */}
      <FAQSection />

      {/* Final CTA */}
      <section className="container pb-20">
        <motion.div
          initial={reduced ? noMotion : { opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="gradient-card rounded-2xl border border-accent/30 p-10 text-center shadow-card relative overflow-hidden"
          style={{ backgroundImage: `url(${heroBg})`, backgroundSize: "cover", backgroundPosition: "center" }}
        >
          <div className="absolute inset-0 bg-[hsl(222,47%,6%)]/80 rounded-2xl" />
          <div className="relative">
            <motion.h2 initial={reduced ? noMotion : { opacity: 0, y: 15 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} className="font-heading text-2xl md:text-3xl font-black text-foreground mb-3">
              جاهز لمتابعة موعد تأشيرتك؟
            </motion.h2>
            <motion.p initial={reduced ? noMotion : { opacity: 0, y: 10 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={reduced ? { duration: 0 } : { delay: 0.15 }} className="text-muted-foreground max-w-md mx-auto mb-6">
              سجّل الآن واختر باقتك المناسبة — تنبيهات فيزا + عقود عمل في اشتراك واحد
            </motion.p>
            <motion.div initial={reduced ? noMotion : { opacity: 0, scale: 0.9 }} whileInView={{ opacity: 1, scale: 1 }} viewport={{ once: true }} transition={reduced ? { duration: 0 } : { delay: 0.3 }}>
              <Link
                to={user ? "/pricing" : "/auth/register"}
                className="inline-flex items-center gap-2 bg-accent hover:bg-accent/90 text-accent-foreground font-bold px-8 py-3.5 rounded-full transition-all shadow-lg"
              >
                {user ? "عرض الباقات" : "إنشاء حساب مجاني"}
                <ArrowLeft className="w-4 h-4" />
              </Link>
            </motion.div>
          </div>
        </motion.div>
      </section>
    </Layout>
  );
}
