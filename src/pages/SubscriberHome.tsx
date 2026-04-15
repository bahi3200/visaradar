import Layout from "@/components/Layout";
import SubscriberHero from "@/components/subscriber/SubscriberHero";
import QuickStats from "@/components/subscriber/QuickStats";
import CityGallery from "@/components/subscriber/CityGallery";
import QuickLinks from "@/components/subscriber/QuickLinks";
import VisaTips from "@/components/subscriber/VisaTips";
import RecentAlerts from "@/components/subscriber/RecentAlerts";
import { Link } from "react-router-dom";
import { ArrowLeft, Sparkles } from "lucide-react";
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
}

export default function SubscriberHome({ subscription, fullName }: Props) {
  const isSubscribed = !!subscription;
  const daysLeft = subscription
    ? Math.max(0, Math.ceil((new Date(subscription.expires_at).getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
    : 0;

  return (
    <Layout>
      <SubscriberHero
        fullName={fullName}
        packageName={subscription?.packages?.name_ar || null}
        daysLeft={daysLeft}
        expiresAt={subscription?.expires_at || ""}
        isSubscribed={isSubscribed}
      />

      {/* Subscribe CTA for non-subscribers */}
      {!isSubscribed && (
        <section className="container py-6">
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="gradient-card rounded-2xl border border-accent/30 p-6 text-center max-w-lg mx-auto"
          >
            <Sparkles className="w-8 h-8 text-accent mx-auto mb-3" />
            <h2 className="font-heading text-lg font-bold text-foreground mb-2">
              فعّل اشتراكك الآن!
            </h2>
            <p className="text-xs text-muted-foreground mb-4">
              اشترك للحصول على تنبيهات فورية لمواعيد التأشيرات وعقود العمل الحصرية
            </p>
            <Link
              to="/pricing"
              className="inline-flex items-center gap-2 bg-accent hover:bg-accent/90 text-accent-foreground font-bold text-sm px-6 py-3 rounded-full transition-all shadow-lg hover:-translate-y-0.5"
            >
              اشترك الآن
              <ArrowLeft className="w-4 h-4" />
            </Link>
          </motion.div>
        </section>
      )}

      {isSubscribed && (
        <QuickStats
          countries={subscription!.countries}
          serviceType={subscription!.service_type}
        />
      )}

      <RecentAlerts />
      <QuickLinks />
      <CityGallery />
      <VisaTips />
    </Layout>
  );
}
