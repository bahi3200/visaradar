import Layout from "@/components/Layout";
import SubscriberHero from "@/components/subscriber/SubscriberHero";
import VisaAlertBanner from "@/components/subscriber/VisaAlertBanner";
import QuickStats from "@/components/subscriber/QuickStats";
import CityGallery from "@/components/subscriber/CityGallery";
import QuickLinks from "@/components/subscriber/QuickLinks";
import VisaTips from "@/components/subscriber/VisaTips";
import RecentAlerts from "@/components/subscriber/RecentAlerts";
import AdminStats from "@/components/subscriber/AdminStats";
import SocialMediaSection from "@/components/home/SocialMediaSection";
import { Link } from "react-router-dom";
import { ArrowLeft, Sparkles, Rocket, ArrowUpCircle, RefreshCw, AlertTriangle, BellOff, Bell, Zap, Send, CheckCircle2 } from "lucide-react";
import { motion } from "framer-motion";
import { useState, useEffect, useLayoutEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

interface SubscriptionData {
  expires_at: string;
  starts_at: string;
  countries: string[];
  service_type: string;
  package_id?: string;
  packages?: { name_ar: string } | null;
}

interface Props {
  subscription: SubscriptionData | null;
  fullName: string | null;
  isAdmin: boolean;
  isLoading?: boolean;
  countryExpiries?: Record<string, string>;
  telegramLinked?: boolean;
}

export default function SubscriberHome({ subscription, fullName, isAdmin, isLoading, countryExpiries = {}, telegramLinked = false }: Props) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [checkingTg, setCheckingTg] = useState(false);
  const [autoPolling, setAutoPolling] = useState(false);
  // Optimistic local override: hide CTA the instant we detect a saved telegram_id
  const [localLinked, setLocalLinked] = useState(false);

  // Track previous user id so we can synchronously reset all session-scoped
  // UI state BEFORE the next render whenever the user signs out or switches
  // accounts. useLayoutEffect prevents the alert from briefly showing the
  // previous account's "hidden / checking" state.
  const prevUserIdRef = useRef<string | null>(user?.id ?? null);
  useLayoutEffect(() => {
    const currentId = user?.id ?? null;
    if (prevUserIdRef.current !== currentId) {
      setLocalLinked(false);
      setCheckingTg(false);
      setAutoPolling(false);
      prevUserIdRef.current = currentId;
    }
  }, [user?.id]);

  // Also clear the optimistic flag once the parent prop confirms the link,
  // so we fall back to the source of truth (my-profile query).
  useEffect(() => {
    if (telegramLinked) setLocalLinked(false);
  }, [telegramLinked]);

  const handleRefreshTelegram = async () => {
    if (!user || checkingTg) return;
    setCheckingTg(true);
    // Safety timeout: never leave the button disabled longer than 10s
    // even if the network request hangs.
    const timeoutId = setTimeout(() => {
      setCheckingTg(false);
      toast.error("انتهت مهلة التحقق. حاول مرة أخرى.");
    }, 10_000);
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("telegram_id")
        .eq("user_id", user.id)
        .maybeSingle();
      if (error) throw error;
      if (data?.telegram_id) {
        // Hide the CTA instantly, regardless of when my-profile refetches
        setLocalLinked(true);
        toast.success("✅ حسابك مرتبط بـ Telegram بنجاح!");
        queryClient.invalidateQueries({ queryKey: ["my-profile", user.id] });
      } else {
        toast.info("لم يتم الربط بعد. تأكد من إكمال خطوات الربط مع البوت.");
        queryClient.invalidateQueries({ queryKey: ["my-profile", user.id] });
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "فشل التحقق من حالة الربط");
    } finally {
      clearTimeout(timeoutId);
      setCheckingTg(false);
    }
  };

  const isSubscribed = !!subscription;
  const daysLeft = subscription
    ? Math.max(0, Math.ceil((new Date(subscription.expires_at).getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
    : 0;

  const showSubscribeCTA = !isSubscribed && !isAdmin && !isLoading;
  // Use OR: hide if either parent prop OR local optimistic state confirms link
  const effectivelyLinked = telegramLinked || localLinked;
  const showTelegramCTA = !effectivelyLinked && !isAdmin && !isLoading;

  // Auto-poll telegram link status every 30s while CTA is visible
  useEffect(() => {
    // Stop polling immediately if user signs out or switches accounts,
    // or if there's no remaining reason to poll.
    if (!user?.id || !showTelegramCTA) {
      setAutoPolling(false);
      return;
    }
    let cancelled = false;
    setAutoPolling(true);
    const interval = setInterval(async () => {
      if (cancelled) return;
      const { data } = await supabase
        .from("profiles")
        .select("telegram_id")
        .eq("user_id", user.id)
        .maybeSingle();
      if (cancelled) return;
      if (data?.telegram_id) {
        // Optimistically hide CTA immediately
        setLocalLinked(true);
        toast.success("✅ تم اكتشاف ربط Telegram بنجاح!");
        queryClient.invalidateQueries({ queryKey: ["my-profile", user.id] });
      }
    }, 30_000);
    return () => {
      cancelled = true;
      clearInterval(interval);
      setAutoPolling(false);
    };
  }, [showTelegramCTA, user?.id, queryClient]);

  return (
    <Layout>
      <SubscriberHero
        fullName={fullName}
        packageName={subscription?.packages?.name_ar || null}
        daysLeft={daysLeft}
        expiresAt={subscription?.expires_at || ""}
        isSubscribed={isSubscribed}
        isAdmin={isAdmin}
      />

      {/* Admin stats - overlapping hero */}
      {isAdmin && <AdminStats />}

      {/* Visa Alert Banner — shows when there are recent open appointments */}
      {(isSubscribed || isAdmin) && (
        <VisaAlertBanner
          subscribedCountries={isAdmin ? ["IT", "FR", "ES", "DE", "GR"] : subscription!.countries}
        />
      )}

      {/* Telegram Link CTA — visible to ALL non-admin users who haven't linked yet */}
      {showTelegramCTA && (
        <section className="container pt-4">
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ type: "spring", stiffness: 220, damping: 22 }}
            role="alert"
            className="relative rounded-2xl border-2 border-sky-500/50 p-4 sm:p-5 overflow-hidden bg-card shadow-[0_8px_30px_-10px_hsl(200_85%_55%/0.4)]"
          >
            <div className="absolute inset-0 bg-gradient-to-l from-sky-500/15 via-sky-500/5 to-transparent" />
            <div className="absolute -top-8 -left-8 w-32 h-32 bg-sky-500/15 rounded-full blur-2xl animate-pulse" />
            <div className="relative flex items-start gap-3 sm:gap-4">
              <div className="relative shrink-0">
                <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-xl bg-gradient-to-br from-sky-500 to-blue-600 flex items-center justify-center shadow-lg">
                  <Send className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
                </div>
                <span className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full bg-red-500 ring-2 ring-card animate-pulse" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <h3 className="font-heading text-sm sm:text-base font-black text-foreground">
                    اربط حساب Telegram لتصلك التنبيهات
                  </h3>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-sky-500/15 text-sky-400 border border-sky-500/30">
                    خطوة مهمّة
                  </span>
                </div>
                <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed mb-3">
                  {isSubscribed
                    ? "اشتراكك نشط، لكن لن تصلك تنبيهات فتح المواعيد عبر Telegram حتى تربط حسابك مع البوت الرسمي."
                    : "حتى لو اشتركت، التنبيهات تُرسل عبر Telegram. اربط حسابك الآن في أقل من دقيقة."}
                </p>
                <div className="flex items-center gap-2 flex-wrap">
                  <Link
                    to="/telegram-link"
                    className="inline-flex items-center gap-1.5 bg-gradient-to-l from-sky-500 to-blue-600 text-white font-bold text-xs px-5 py-2.5 rounded-full transition-all shadow-lg hover:shadow-xl hover:-translate-y-0.5"
                  >
                    <Send className="w-3.5 h-3.5" />
                    اربط Telegram الآن
                    <ArrowLeft className="w-3.5 h-3.5" />
                  </Link>
                  <button
                    type="button"
                    onClick={handleRefreshTelegram}
                    disabled={checkingTg}
                    aria-busy={checkingTg}
                    aria-label="تحقق فوري من حالة الربط"
                    className="inline-flex items-center gap-1.5 bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-400 border border-emerald-500/40 font-bold text-xs px-4 py-2.5 rounded-full transition-all shadow-md hover:shadow-lg hover:-translate-y-0.5 disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:translate-y-0 disabled:hover:shadow-md disabled:bg-emerald-500/15"
                  >
                    {checkingTg ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        جارٍ التحقق...
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        تحقّقت من الربط
                      </>
                    )}
                  </button>
                  <a
                    href="https://t.me/VisaRadar16_bot"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs font-bold text-sky-400 hover:text-sky-300 px-2 py-1 transition-colors"
                  >
                    فتح البوت مباشرة
                  </a>
                </div>
                {autoPolling && (
                  <p className="text-[10px] text-sky-400/80 mt-2 flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-sky-400 animate-pulse" />
                    فحص تلقائي كل 30 ثانية حتى يكتمل الربط
                  </p>
                )}
              </div>
            </div>
          </motion.div>
        </section>
      )}

      {/* Subscribe CTA */}
      {showSubscribeCTA && (
        <>
          {/* High-visibility alert: not subscribed → no visa alerts */}
          <section className="container pt-4 -mt-2">
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ type: "spring", stiffness: 220, damping: 22 }}
              role="alert"
              className="relative rounded-2xl border-2 border-accent/50 p-4 sm:p-5 overflow-hidden bg-card shadow-[0_8px_30px_-10px_hsl(var(--accent)/0.4)]"
            >
              <div className="absolute inset-0 bg-gradient-to-l from-accent/15 via-accent/5 to-transparent" />
              <div className="absolute -top-8 -right-8 w-32 h-32 bg-accent/15 rounded-full blur-2xl animate-pulse" />
              <div className="relative flex items-start gap-3 sm:gap-4">
                <div className="relative shrink-0">
                  <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-xl gradient-accent flex items-center justify-center shadow-lg">
                    <BellOff className="w-5 h-5 sm:w-6 sm:h-6 text-accent-foreground" />
                  </div>
                  <span className="absolute -top-1 -left-1 w-3.5 h-3.5 rounded-full bg-red-500 ring-2 ring-card animate-pulse" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <h3 className="font-heading text-sm sm:text-base font-black text-foreground">
                      أنت لا تتلقّى تنبيهات فتح التأشيرات
                    </h3>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-500/15 text-red-400 border border-red-500/30">
                      غير مشترك
                    </span>
                  </div>
                  <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed mb-3">
                    اشترك في إحدى الباقات لتصلك إشعارات فورية فور فتح مواعيد فيزا الشنغن (إيطاليا، فرنسا، إسبانيا...) عبر تيليجرام والمتصفح.
                  </p>
                  <div className="flex items-center gap-2 flex-wrap">
                    <Link
                      to="/pricing"
                      className="inline-flex items-center gap-1.5 gradient-accent text-accent-foreground font-bold text-xs px-5 py-2.5 rounded-full transition-all shadow-lg hover:shadow-xl hover:-translate-y-0.5"
                    >
                      <Zap className="w-3.5 h-3.5" />
                      اشترك الآن
                      <ArrowLeft className="w-3.5 h-3.5" />
                    </Link>
                    <Link
                      to="/pricing"
                      className="inline-flex items-center gap-1 text-xs font-bold text-accent hover:text-accent/80 px-2 py-1 transition-colors"
                    >
                      عرض الباقات
                    </Link>
                  </div>
                </div>
              </div>
            </motion.div>
          </section>

          {/* Secondary friendly welcome card */}
          <section className="container py-6">
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ type: "spring", stiffness: 200, damping: 20, delay: 0.1 }}
              className="relative rounded-2xl border border-accent/30 p-6 text-center max-w-lg mx-auto overflow-hidden bg-card"
            >
              <div className="absolute inset-0 bg-gradient-to-br from-accent/10 via-transparent to-primary/10" />
              <div className="relative">
                <div className="w-12 h-12 rounded-2xl gradient-accent flex items-center justify-center mx-auto mb-3 shadow-xl">
                  <Rocket className="w-6 h-6 text-accent-foreground" />
                </div>
                <h2 className="font-heading text-lg font-black text-foreground mb-2">
                  مرحباً بك! خطوة واحدة تفصلك عن التنبيهات
                </h2>
                <p className="text-xs text-muted-foreground mb-4 max-w-xs mx-auto leading-relaxed">
                  اختر باقة تناسبك واحصل على تنبيهات فورية لمواعيد التأشيرات وعقود العمل الحصرية
                </p>
                <Link
                  to="/pricing"
                  className="inline-flex items-center gap-2 gradient-accent text-accent-foreground font-bold text-sm px-7 py-3 rounded-full transition-all shadow-xl hover:shadow-2xl hover:-translate-y-1"
                >
                  استعرض الباقات
                  <ArrowLeft className="w-4 h-4" />
                </Link>
              </div>
            </motion.div>
          </section>
        </>
      )}

      {(isSubscribed || isAdmin) && (
        <QuickStats
          countries={isAdmin ? ["IT", "FR", "ES", "DE", "GR"] : subscription!.countries}
          serviceType={isAdmin ? "both" : subscription!.service_type}
          countryExpiries={countryExpiries}
        />
      )}

      {/* Renewal CTA when subscription is about to expire */}
      {isSubscribed && !isAdmin && daysLeft <= 7 && (
        <section className="container pb-4">
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ type: "spring", stiffness: 200, damping: 20 }}
            className={`relative rounded-2xl border p-5 overflow-hidden bg-card flex items-center gap-4 ${
              daysLeft <= 2
                ? "border-red-500/40"
                : daysLeft <= 5
                ? "border-orange-500/30"
                : "border-yellow-500/30"
            }`}
          >
            <div className={`absolute inset-0 ${
              daysLeft <= 2
                ? "bg-gradient-to-l from-red-500/10 via-transparent to-orange-500/5"
                : "bg-gradient-to-l from-yellow-500/10 via-transparent to-accent/5"
            }`} />
            <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 shadow-lg relative ${
              daysLeft <= 2 ? "bg-red-500/15" : "bg-yellow-500/15"
            }`}>
              {daysLeft <= 2 ? (
                <AlertTriangle className="w-6 h-6 text-red-400" />
              ) : (
                <RefreshCw className="w-6 h-6 text-yellow-400" />
              )}
            </div>
            <div className="relative flex-1 min-w-0">
              <h3 className="font-heading text-sm font-bold text-foreground mb-0.5">
                {daysLeft === 0
                  ? "اشتراكك ينتهي اليوم!"
                  : daysLeft <= 2
                  ? `اشتراكك ينتهي خلال ${daysLeft} ${daysLeft === 1 ? "يوم" : "يومين"}`
                  : `اشتراكك ينتهي خلال ${daysLeft} أيام`}
              </h3>
              <p className="text-xs text-muted-foreground leading-relaxed">
                جدّد اشتراكك الآن لتستمر في تلقي التنبيهات بدون انقطاع
              </p>
            </div>
            <Link
              to={`/subscribe?renew=true&package=${subscription!.package_id || ""}`}
              className={`relative inline-flex items-center gap-1.5 font-bold text-xs px-5 py-2.5 rounded-full transition-all shadow-lg hover:shadow-xl hover:-translate-y-0.5 shrink-0 ${
                daysLeft <= 2
                  ? "bg-red-500 hover:bg-red-600 text-white"
                  : "gradient-accent text-accent-foreground"
              }`}
            >
              تجديد
              <ArrowLeft className="w-3.5 h-3.5" />
            </Link>
          </motion.div>
        </section>
      )}

      {/* Upgrade CTA for subscribers */}
      {isSubscribed && !isAdmin && daysLeft > 7 && (
        <section className="container pb-4">
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ type: "spring", stiffness: 200, damping: 20 }}
            className="relative rounded-2xl border border-primary/30 p-5 overflow-hidden bg-card flex items-center gap-4"
          >
            <div className="absolute inset-0 bg-gradient-to-l from-primary/10 via-transparent to-accent/5" />
            <div className="w-12 h-12 rounded-xl gradient-primary flex items-center justify-center shrink-0 shadow-lg relative">
              <ArrowUpCircle className="w-6 h-6 text-primary-foreground" />
            </div>
            <div className="relative flex-1 min-w-0">
              <h3 className="font-heading text-sm font-bold text-foreground mb-0.5">ترقية باقتك</h3>
              <p className="text-xs text-muted-foreground leading-relaxed">أضف دولاً جديدة أو انتقل لباقة أعلى للاستفادة من مزايا أكثر</p>
            </div>
            <Link
              to="/subscribe?upgrade=true"
              className="relative inline-flex items-center gap-1.5 gradient-primary text-primary-foreground font-bold text-xs px-5 py-2.5 rounded-full transition-all shadow-lg hover:shadow-xl hover:-translate-y-0.5 shrink-0"
            >
              ترقية
              <ArrowLeft className="w-3.5 h-3.5" />
            </Link>
          </motion.div>
        </section>
      )}

      <RecentAlerts />
      <QuickLinks isAdmin={isAdmin} />
      <CityGallery />
      <VisaTips />
      <SocialMediaSection />
    </Layout>
  );
}
