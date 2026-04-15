import Layout from "@/components/Layout";
import SubscriberHero from "@/components/subscriber/SubscriberHero";
import QuickStats from "@/components/subscriber/QuickStats";
import CityGallery from "@/components/subscriber/CityGallery";
import QuickLinks from "@/components/subscriber/QuickLinks";
import VisaTips from "@/components/subscriber/VisaTips";
import RecentAlerts from "@/components/subscriber/RecentAlerts";
import AdminStats from "@/components/subscriber/AdminStats";
import { Link } from "react-router-dom";
import { ArrowLeft, Sparkles, Rocket } from "lucide-react";
import { motion } from "framer-motion";

interface SubscriptionData {
  expires_at: string;
  starts_at: string;
  countries: string[];
  service_type: string;
  packages?: { name_ar: string } | null;
}

interface Props {
  subscription: SubscriptionData | null;
  fullName: string | null;
  isAdmin: boolean;
  isLoading?: boolean;
}

export default function SubscriberHome({ subscription, fullName, isAdmin, isLoading }: Props) {
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
        />
      )}

      <RecentAlerts />
      <QuickLinks isAdmin={isAdmin} />
      <CityGallery />
      <VisaTips />
    </Layout>
  );
}
