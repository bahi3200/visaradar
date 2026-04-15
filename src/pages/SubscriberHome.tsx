import Layout from "@/components/Layout";
import SubscriberHero from "@/components/subscriber/SubscriberHero";
import VisaAlertBanner from "@/components/subscriber/VisaAlertBanner";
import QuickStats from "@/components/subscriber/QuickStats";
import CityGallery from "@/components/subscriber/CityGallery";
import QuickLinks from "@/components/subscriber/QuickLinks";
import VisaTips from "@/components/subscriber/VisaTips";
import RecentAlerts from "@/components/subscriber/RecentAlerts";
import AdminStats from "@/components/subscriber/AdminStats";
import { Link } from "react-router-dom";
import { ArrowLeft, Sparkles, Rocket, ArrowUpCircle, RefreshCw, AlertTriangle } from "lucide-react";
import { motion } from "framer-motion";

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
}

export default function SubscriberHome({ subscription, fullName, isAdmin, isLoading, countryExpiries = {} }: Props) {
  const isSubscribed = !!subscription;
  const daysLeft = subscription
    ? Math.max(0, Math.ceil((new Date(subscription.expires_at).getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
    : 0;

  const showSubscribeCTA = !isSubscribed && !isAdmin && !isLoading;

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

      {/* Subscribe CTA */}
      {showSubscribeCTA && (
        <section className="container py-8 -mt-4">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ type: "spring", stiffness: 200, damping: 20 }}
            className="relative rounded-2xl border border-accent/30 p-8 text-center max-w-lg mx-auto overflow-hidden bg-card"
          >
            <div className="absolute inset-0 bg-gradient-to-br from-accent/15 via-transparent to-primary/10" />
            <div className="absolute -top-10 -left-10 w-40 h-40 bg-accent/10 rounded-full blur-3xl" />
            <div className="absolute -bottom-10 -right-10 w-40 h-40 bg-primary/10 rounded-full blur-3xl" />
            <div className="relative">
              <div className="w-14 h-14 rounded-2xl gradient-accent flex items-center justify-center mx-auto mb-4 shadow-xl">
                <Rocket className="w-7 h-7 text-accent-foreground" />
              </div>
              <h2 className="font-heading text-xl font-black text-foreground mb-2">
                فعّل اشتراكك الآن!
              </h2>
              <p className="text-sm text-muted-foreground mb-6 max-w-xs mx-auto leading-relaxed">
                اشترك للحصول على تنبيهات فورية لمواعيد التأشيرات وعقود العمل الحصرية
              </p>
              <Link
                to="/pricing"
                className="inline-flex items-center gap-2 gradient-accent text-accent-foreground font-bold text-sm px-8 py-3.5 rounded-full transition-all shadow-xl hover:shadow-2xl hover:-translate-y-1"
              >
                اشترك الآن
                <ArrowLeft className="w-4 h-4" />
              </Link>
            </div>
          </motion.div>
        </section>
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
    </Layout>
  );
}
