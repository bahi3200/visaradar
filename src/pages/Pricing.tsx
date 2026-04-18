import Layout from "@/components/Layout";
import { motion } from "framer-motion";
import { Check, Crown, Zap, Shield, ArrowLeft, Star, Send, Bell, Briefcase, Layers, Table2, ShieldCheck } from "lucide-react";
import PackageComparisonTable from "@/components/pricing/PackageComparisonTable";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Link, useNavigate } from "react-router-dom";
import { useState } from "react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";

const countryOptions = [
  { code: "IT", flag: "🇮🇹", name: "إيطاليا", provider: "VFS Global", url: "https://visa.vfsglobal.com/dza/ar/ita/" },
  { code: "FR", flag: "🇫🇷", name: "فرنسا", provider: "TLScontact", url: "https://visas-fr.tlscontact.com/" },
  { code: "ES", flag: "🇪🇸", name: "إسبانيا", provider: "BLS International", url: "https://www.blsspainvisa.com/" },
  { code: "DE", flag: "🇩🇪", name: "ألمانيا", provider: "VFS Global", url: "https://visa.vfsglobal.com/dza/ar/deu/" },
  { code: "GR", flag: "🇬🇷", name: "اليونان", provider: "VFS Global", url: "https://visa.vfsglobal.com/dza/ar/grc/" },
];

type ServiceType = "visa" | "jobs" | "both";

const serviceTypes: { value: ServiceType; label: string; icon: React.ReactNode; desc: string }[] = [
  { value: "visa", label: "تنبيهات الفيزا", icon: <Bell className="w-5 h-5" />, desc: "إشعارات فورية عند فتح مواعيد التأشيرات" },
  { value: "jobs", label: "عقود العمل", icon: <Briefcase className="w-5 h-5" />, desc: "وصول كامل لعروض العمل في أوروبا وكندا" },
  { value: "both", label: "الباقة الشاملة", icon: <Layers className="w-5 h-5" />, desc: "تنبيهات الفيزا + عقود العمل معاً" },
];

export default function PricingPage() {
  const { user } = useAuth();
  const [serviceType, setServiceType] = useState<ServiceType>("both");
  const [selectedCountry, setSelectedCountry] = useState<string>("IT");
  const [selectedGoldenCountries, setSelectedGoldenCountries] = useState<string[]>(["IT"]);

  const { data: packages, isLoading } = useQuery({
    queryKey: ["packages"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("packages")
        .select("*")
        .eq("is_active", true)
        .order("sort_order");
      if (error) throw error;
      return data;
    },
  });

  const { data: activeSubscription } = useQuery({
    queryKey: ["pricing-active-sub", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("subscriptions")
        .select("package_id, expires_at, packages(price, name_ar)")
        .eq("user_id", user!.id)
        .eq("status", "active")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  const toggleGoldenCountry = (code: string) => {
    setSelectedGoldenCountries((prev) => {
      if (prev.includes(code)) return prev.filter((c) => c !== code);
      if (prev.length >= 3) {
        toast.error("الحد الأقصى 3 دول في الباقة الذهبية");
        return prev;
      }
      return [...prev, code];
    });
  };

  const navigate = useNavigate();
  const hasActiveSubscription = !!activeSubscription && new Date(activeSubscription.expires_at) > new Date();
  const daysLeft = hasActiveSubscription
    ? Math.max(0, Math.ceil((new Date(activeSubscription.expires_at).getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
    : 999;
  const currentPackagePrice = activeSubscription?.packages?.price || 0;

  const getPackageAction = (pkg: any) => {
    const isCurrentPackage = hasActiveSubscription && activeSubscription?.package_id === pkg.id;
    const isUpgradeAvailable = hasActiveSubscription && !isCurrentPackage && (pkg.price || 0) > currentPackagePrice;
    const canRenew = isCurrentPackage && daysLeft <= 15;

    if (!hasActiveSubscription) {
      return { label: "اشترك الآن", disabled: false, mode: "subscribe" as const };
    }

    if (canRenew) {
      return { label: "جدد الاشتراك", disabled: false, mode: "renew" as const };
    }

    if (isCurrentPackage) {
      return { label: "مشترك حالياً", disabled: true, mode: "current" as const };
    }

    if (isUpgradeAvailable) {
      return { label: "ترقية الآن", disabled: false, mode: "upgrade" as const };
    }

    return { label: "غير متاح حالياً", disabled: true, mode: "blocked" as const };
  };

  const handleSubscribe = (pkgId: string, serviceT?: ServiceType) => {
    const selectedService = serviceT || serviceType;
    const pkg = packages?.find((item) => item.id === pkgId);
    if (!pkg) return;

    const action = getPackageAction(pkg);

    if (action.disabled) {
      if (action.mode === "current") {
        toast.error("أنت مشترك بالفعل في هذه الباقة");
      }
      return;
    }

    if (action.mode === "renew") {
      navigate(`/subscribe?renew=true&package=${pkgId}&service=${selectedService}`);
      return;
    }

    if (action.mode === "upgrade") {
      navigate(`/subscribe?upgrade=true&package=${pkgId}&service=${selectedService}`);
      return;
    }

    navigate(`/subscribe?package=${pkgId}&service=${selectedService}`);
  };

  if (isLoading) {
    return (
      <Layout>
        <div className="container py-20 text-center">
          <div className="animate-pulse text-muted-foreground">جاري التحميل...</div>
        </div>
      </Layout>
    );
  }

  const regularPackages = packages?.filter((p) => !p.is_golden) || [];
  const goldenPackage = packages?.find((p) => p.is_golden);
  const hasNoPackages = !packages || packages.length === 0;

  const getFeatures = (pkg: any, svc: ServiceType) => {
    const base = pkg.features_ar || [];
    const visaFeatures = ["تنبيه فوري عبر تليغرام", "مراقبة مواعيد التأشيرات 24/7"];
    const jobsFeatures = ["وصول كامل لعروض العمل", "فلتر وبحث متقدم", "تفاصيل الوظائف الكاملة"];
    const bothFeatures = [...visaFeatures, ...jobsFeatures, "حماية الحساب (جهازين كحد أقصى)"];

    if (svc === "visa") return [...visaFeatures, ...base.filter((f: string) => !jobsFeatures.includes(f) && !visaFeatures.includes(f))];
    if (svc === "jobs") return [...jobsFeatures, ...base.filter((f: string) => !visaFeatures.includes(f) && !jobsFeatures.includes(f))];
    return bothFeatures;
  };

  return (
    <Layout>
      {/* Hero */}
      <section className="gradient-hero relative overflow-hidden">
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-20 right-20 w-72 h-72 bg-primary rounded-full blur-[120px]" />
          <div className="absolute bottom-10 left-10 w-60 h-60 bg-accent rounded-full blur-[100px]" />
        </div>
        <div className="container relative py-16 md:py-20 text-center">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
            <div className="inline-flex items-center gap-2 gradient-accent text-accent-foreground text-xs font-bold px-4 py-1.5 rounded-full mb-6">
              <Zap className="w-3.5 h-3.5" />
              باقات مرنة تناسب احتياجاتك
            </div>
            <h1 className="font-heading text-3xl md:text-5xl font-black mb-4">
              اختر <span className="text-primary">باقتك</span> المناسبة
            </h1>
            <p className="text-muted-foreground max-w-lg mx-auto leading-relaxed">
              تنبيهات فيزا فورية، عقود عمل حصرية، أو الاثنين معاً — اشترك الآن
            </p>
          </motion.div>
        </div>
      </section>

      {/* Service Type Selector */}
      <section className="container py-10">
        <h2 className="font-heading text-xl font-bold text-foreground mb-6 text-center">اختر نوع الخدمة</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 max-w-3xl mx-auto">
          {serviceTypes.map((svc) => (
            <button
              key={svc.value}
              onClick={() => setServiceType(svc.value)}
              className={`flex flex-col items-center gap-2 p-5 rounded-2xl border transition-all text-center ${
                serviceType === svc.value
                  ? "border-primary bg-primary/10 text-primary shadow-glow ring-1 ring-primary/30"
                  : "border-border/50 text-muted-foreground hover:border-primary/40 hover:text-foreground"
              }`}
            >
              <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${
                serviceType === svc.value ? "gradient-primary text-primary-foreground" : "bg-muted/50"
              }`}>
                {svc.icon}
              </div>
              <span className="font-bold text-sm">{svc.label}</span>
              <span className="text-xs opacity-70 leading-relaxed">{svc.desc}</span>
            </button>
          ))}
        </div>
      </section>

      {/* Country Selection - only for visa or both */}
      {(serviceType === "visa" || serviceType === "both") && (
        <section className="container pb-8">
          <h2 className="font-heading text-lg font-bold text-foreground mb-4 text-center">اختر الدولة للتنبيهات</h2>
          <div className="flex justify-center gap-3 flex-wrap">
            {countryOptions.map((c) => (
              <button
                key={c.code}
                onClick={() => setSelectedCountry(c.code)}
                className={`flex flex-col items-center gap-1 px-6 py-4 rounded-xl border font-medium transition-all ${
                  selectedCountry === c.code
                    ? "border-primary bg-primary/10 text-primary shadow-glow"
                    : "border-border/50 text-muted-foreground hover:border-primary/40 hover:text-foreground"
                }`}
              >
                <span className="text-2xl">{c.flag}</span>
                <span className="font-bold">{c.name}</span>
                <span className="text-xs opacity-70">{c.provider}</span>
              </button>
            ))}
          </div>
        </section>
      )}

      {/* Regular Packages */}
      <section className="container pb-10">
        <div className="grid md:grid-cols-3 gap-6 max-w-4xl mx-auto">
          {regularPackages.map((pkg, i) => {
            const features = getFeatures(pkg, serviceType);
            const action = getPackageAction(pkg);
            return (
              <motion.div
                key={pkg.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 * i }}
                className={`gradient-card rounded-2xl border p-6 flex flex-col relative ${
                  i === 1
                    ? "border-primary/60 shadow-glow scale-[1.02]"
                    : "border-border/50 shadow-card"
                }`}
              >
                {i === 1 && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 gradient-primary text-primary-foreground text-xs font-bold px-4 py-1 rounded-full flex items-center gap-1">
                    <Star className="w-3 h-3" />
                    الأكثر طلباً
                  </div>
                )}
                {action.mode === "current" && activeSubscription && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-accent text-accent-foreground text-xs font-bold px-4 py-1 rounded-full flex items-center gap-1 z-10">
                    <ShieldCheck className="w-3 h-3" />
                    باقتك الحالية
                  </div>
                )}
                <h3 className="font-heading text-lg font-bold text-foreground mb-1">{pkg.name_ar}</h3>
                <p className="text-sm text-muted-foreground mb-1">{pkg.duration_months} أشهر</p>
                <div className="inline-flex items-center gap-1.5 mb-4">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                    serviceType === "visa" ? "bg-primary/10 text-primary" :
                    serviceType === "jobs" ? "bg-accent/10 text-accent" :
                    "bg-gradient-to-r from-primary/10 to-accent/10 text-foreground"
                  }`}>
                    {serviceTypes.find(s => s.value === serviceType)?.label}
                  </span>
                </div>
                
                {action.mode === "current" && activeSubscription && (
                  <div className="rounded-lg bg-accent/10 border border-accent/30 px-3 py-2 mb-4 text-center">
                    <p className="text-xs text-accent font-bold">
                      ✓ مشترك — ينتهي {new Date(activeSubscription.expires_at).toLocaleDateString("ar", { day: "numeric", month: "long", year: "numeric" })}
                    </p>
                  </div>
                )}

                <div className="mb-6">
                  {pkg.price ? (
                    <div className="flex items-baseline gap-1">
                      <span className="font-heading text-3xl font-black text-foreground">{pkg.price}</span>
                      <span className="text-sm text-muted-foreground">د.ج</span>
                    </div>
                  ) : (
                    <span className="font-heading text-2xl font-bold text-accent">قريباً</span>
                  )}
                </div>

                <ul className="space-y-3 mb-6 flex-1">
                  {features.map((f, fi) => (
                    <li key={fi} className="flex items-start gap-2 text-sm">
                      <Check className="w-4 h-4 text-primary mt-0.5 shrink-0" />
                      <span className="text-muted-foreground">{f}</span>
                    </li>
                  ))}
                </ul>

                <button
                  type="button"
                  disabled={action.disabled}
                  onClick={() => handleSubscribe(pkg.id)}
                  className={`w-full py-3 rounded-xl font-bold transition-all flex items-center justify-center gap-2 ${
                    action.disabled
                      ? "border border-border/50 bg-muted/30 text-muted-foreground cursor-not-allowed opacity-70"
                      : i === 1
                      ? "gradient-primary text-primary-foreground hover:opacity-90"
                      : "border border-border/60 text-foreground hover:bg-secondary"
                  }`}
                >
                  <Send className="w-4 h-4" />
                  {action.label}
                </button>
              </motion.div>
            );
          })}
        </div>
      </section>

      {/* Comparison Table */}
      {packages && packages.length > 0 && (
        <section className="container pb-12">
          <h2 className="font-heading text-xl font-bold text-foreground mb-6 text-center flex items-center justify-center gap-2">
            <Table2 className="w-5 h-5 text-primary" />
            مقارنة بين الباقات
          </h2>
          <div className="max-w-4xl mx-auto gradient-card rounded-2xl border border-border/50 p-4 md:p-6 shadow-card">
            <PackageComparisonTable packages={packages} />
          </div>
        </section>
      )}

      {/* Golden Package */}
      {goldenPackage && (
        <section className="container pb-16">
          {(() => {
            const action = getPackageAction(goldenPackage);
            return (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="max-w-2xl mx-auto gradient-card rounded-2xl border border-accent/40 p-8 shadow-card relative overflow-hidden"
          >
            <div className="absolute top-0 left-0 right-0 h-1 gradient-accent" />
            <div className="flex items-center gap-3 mb-2">
              <div className="w-12 h-12 rounded-xl gradient-accent flex items-center justify-center">
                <Crown className="w-6 h-6 text-accent-foreground" />
              </div>
              <div>
                <h3 className="font-heading text-xl font-bold text-foreground">{goldenPackage.name_ar}</h3>
                <p className="text-sm text-muted-foreground">12 شهر • حتى 3 دول</p>
              </div>
            </div>

            <div className="inline-flex items-center gap-1.5 mb-4 mt-2">
              <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-accent/10 text-accent">
                تنبيهات الفيزا + عقود العمل — شامل
              </span>
            </div>

            <div className="mb-6">
              {goldenPackage.price ? (
                <div className="flex items-baseline gap-1">
                  <span className="font-heading text-4xl font-black text-foreground">{goldenPackage.price}</span>
                  <span className="text-sm text-muted-foreground">د.ج</span>
                </div>
              ) : (
                <span className="font-heading text-2xl font-bold text-accent">قريباً</span>
              )}
            </div>

            {/* Country selection for golden */}
            <div className="mb-6">
              <p className="text-sm font-medium text-foreground mb-3">اختر الدول للتنبيهات (حتى 3):</p>
              <div className="flex gap-3 flex-wrap">
                {countryOptions.map((c) => (
                  <button
                    key={c.code}
                    onClick={() => toggleGoldenCountry(c.code)}
                    className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border text-sm font-medium transition-all ${
                      selectedGoldenCountries.includes(c.code)
                        ? "border-accent bg-accent/10 text-accent"
                        : "border-border/50 text-muted-foreground hover:border-accent/40"
                    }`}
                  >
                    <span>{c.flag}</span>
                    <span>{c.name}</span>
                    {selectedGoldenCountries.includes(c.code) && <Check className="w-3.5 h-3.5" />}
                  </button>
                ))}
              </div>
            </div>

            <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">
              {getFeatures(goldenPackage, "both").map((f, fi) => (
                <li key={fi} className="flex items-start gap-2 text-sm">
                  <Check className="w-4 h-4 text-accent mt-0.5 shrink-0" />
                  <span className="text-muted-foreground">{f}</span>
                </li>
              ))}
            </ul>

            <button
              type="button"
              disabled={action.disabled}
              onClick={() => handleSubscribe(goldenPackage.id, "both")}
              className={`w-full py-3.5 rounded-xl font-bold transition-all flex items-center justify-center gap-2 ${
                action.disabled
                  ? "border border-border/50 bg-muted/30 text-muted-foreground cursor-not-allowed opacity-70"
                  : "gradient-accent text-accent-foreground hover:opacity-90"
              }`}
            >
              <Crown className="w-4 h-4" />
              {action.label}
            </button>
            {action.mode === "current" && activeSubscription && (
              <div className="rounded-lg bg-accent/10 border border-accent/30 px-3 py-2 mt-4 text-center">
                <p className="text-xs text-accent font-bold">
                  ✓ مشترك حالياً — ينتهي {new Date(activeSubscription.expires_at).toLocaleDateString("ar", { day: "numeric", month: "long", year: "numeric" })}
                </p>
              </div>
            )}
          </motion.div>
            );
          })()}

          {/* Upgrade path */}
          <div className="max-w-2xl mx-auto mt-8">
            <div className="gradient-card rounded-xl border border-border/50 p-6">
              <h3 className="font-heading text-lg font-bold text-foreground mb-4 flex items-center gap-2">
                <Shield className="w-5 h-5 text-primary" />
                الترقية بين الباقات
              </h3>
              <div className="space-y-3">
                <div className="flex items-center gap-3 text-sm text-muted-foreground">
                  <ArrowLeft className="w-4 h-4 text-primary rotate-180" />
                  <span>من دولة واحدة → دولتين: ادفع الفرق فقط</span>
                </div>
                <div className="flex items-center gap-3 text-sm text-muted-foreground">
                  <ArrowLeft className="w-4 h-4 text-primary rotate-180" />
                  <span>من أي باقة → الباقة الذهبية: خصم على المبلغ المدفوع</span>
                </div>
                <div className="flex items-center gap-3 text-sm text-muted-foreground">
                  <ArrowLeft className="w-4 h-4 text-primary rotate-180" />
                  <span>تواصل معنا عبر تليغرام للترقية</span>
                </div>
              </div>
            </div>
          </div>
        </section>
      )}
    </Layout>
  );
}