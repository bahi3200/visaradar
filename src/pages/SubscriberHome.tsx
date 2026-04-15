import Layout from "@/components/Layout";
import SubscriberHero from "@/components/subscriber/SubscriberHero";
import QuickStats from "@/components/subscriber/QuickStats";
import CityGallery from "@/components/subscriber/CityGallery";
import QuickLinks from "@/components/subscriber/QuickLinks";
import VisaTips from "@/components/subscriber/VisaTips";
import RecentAlerts from "@/components/subscriber/RecentAlerts";

interface Props {
  subscription: {
    expires_at: string;
    starts_at: string;
    countries: string[];
    service_type: string;
    packages?: { name_ar: string } | null;
  };
  fullName: string | null;
}

export default function SubscriberHome({ subscription, fullName }: Props) {
  const daysLeft = Math.max(
    0,
    Math.ceil((new Date(subscription.expires_at).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
  );

  return (
    <Layout>
      <SubscriberHero
        fullName={fullName}
        packageName={subscription.packages?.name_ar || null}
        daysLeft={daysLeft}
        expiresAt={subscription.expires_at}
      />
      <QuickStats
        countries={subscription.countries}
        serviceType={subscription.service_type}
      />
      <QuickLinks />
      <CityGallery />
      <VisaTips />
    </Layout>
  );
}
