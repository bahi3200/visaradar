import Layout from "@/components/Layout";
import { motion } from "framer-motion";
import { Send, ArrowRight, Check, Crown, FileImage, AlertTriangle, Bell, Briefcase, Layers, ArrowUpCircle, TrendingUp, Copy, Shield, RefreshCw } from "lucide-react";
import baridimobLogo from "@/assets/baridimob-logo.png";
import ccpLogo from "@/assets/ccp-logo.png";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useIsAdmin } from "@/hooks/useIsAdmin";

const countryOptions = [
  { code: "IT", flag: "🇮🇹", name: "إيطاليا", provider: "VFS Global" },
  { code: "FR", flag: "🇫🇷", name: "فرنسا", provider: "Capago (TLScontact)" },
  { code: "ES", flag: "🇪🇸", name: "إسبانيا", provider: "BLS International Algeria" },
  { code: "DE", flag: "🇩🇪", name: "ألمانيا", provider: "VFS Global" },
  { code: "GR", flag: "🇬🇷", name: "اليونان", provider: "VFS Global" },
];

type ServiceType = "visa" | "jobs" | "both";

export default function SubscribeRequestPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { isPrivileged } = useIsAdmin();
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const isUpgrade = searchParams.get("upgrade") === "true";
  const isRenewal = searchParams.get("renew") === "true";
  const renewPackageId = searchParams.get("package") || "";

  const [serviceType, setServiceType] = useState<ServiceType>(
    (searchParams.get("service") as ServiceType) || "both"
  );
  const [selectedPackageId, setSelectedPackageId] = useState<string>(renewPackageId);
  const [countries, setCountries] = useState<string[]>([]);
  // Use stored user data directly - no need to ask again
  const fullName = user?.user_metadata?.full_name || "";
  const phone = user?.user_metadata?.phone || "";
  const email = user?.email || "";

  // Fetch telegram_id from profiles table
  const { data: profile } = useQuery({
    queryKey: ["my-profile-telegram", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("telegram_id")
        .eq("user_id", user!.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });
  const telegramChatId = profile?.telegram_id || "";
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [receiptPreview, setReceiptPreview] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);

  const { data: packages } = useQuery({
    queryKey: ["packages"],
    queryFn: async () => {
      const { data, error } = await supabase.from("packages").select("*").eq("is_active", true).order("sort_order");
      if (error) throw error;
      return data;
    },
  });

  const { data: paymentSettings } = useQuery({
    queryKey: ["payment-settings"],
    queryFn: async () => {
      const { data, error } = await supabase.from("payment_settings").select("*").limit(1).maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const { data: activeSubscription } = useQuery({
    queryKey: ["my-active-sub", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("subscriptions")
        .select("*, packages(name_ar, price, duration_months)")
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

  const { data: myRequests } = useQuery({
    queryKey: ["my-requests"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("subscription_requests")
        .select("*, packages(name_ar)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const selectedPkg = packages?.find((p) => p.id === selectedPackageId);
  const maxCountries = selectedPkg?.max_countries || 1;
  const needsCountry = serviceType === "visa" || serviceType === "both";

  // Check if user already has this exact package active (allow if renewal mode)
  const daysLeft = activeSubscription ? Math.max(0, Math.ceil((new Date(activeSubscription.expires_at).getTime() - Date.now()) / (1000 * 60 * 60 * 24))) : 999;
  const isAlreadySubscribed = !isUpgrade && !isRenewal && activeSubscription && activeSubscription.package_id === selectedPackageId && new Date(activeSubscription.expires_at) > new Date();
  const hasActiveSubscription = !isUpgrade && !isRenewal && !!activeSubscription && new Date(activeSubscription.expires_at) > new Date();
  const isSelectingDifferentPkg = hasActiveSubscription && selectedPackageId && activeSubscription?.package_id !== selectedPackageId;

  // Check if user has a pending request for the same package
  const hasPendingRequest = myRequests?.some(
    (r) => r.package_id === selectedPackageId && r.status === "pending"
  );

  // Calculate upgrade price difference
  const currentPrice = activeSubscription?.packages?.price || 0;
  const newPrice = selectedPkg?.price || 0;
  const priceDifference = isUpgrade && activeSubscription ? Math.max(0, newPrice - currentPrice) : newPrice;

  const toggleCountry = (code: string) => {
    setCountries((prev) => {
      if (prev.includes(code)) return prev.filter((c) => c !== code);
      if (prev.length >= maxCountries) {
        toast.error(`الحد الأقصى ${maxCountries} دول لهذه الباقة`);
        return prev;
      }
      return [...prev, code];
    });
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      toast.error("حجم الملف يجب أن لا يتجاوز 5 ميغابايت");
      return;
    }
    setReceiptFile(file);
    setReceiptPreview(URL.createObjectURL(file));
  };

  const handleSubmit = async () => {
    if (!selectedPackageId || !fullName.trim() || !receiptFile) {
      toast.error("يرجى ملء جميع الحقول المطلوبة ورفع وصل الدفع");
      return;
    }
    if (needsCountry && countries.length === 0) {
      toast.error("يرجى اختيار دولة واحدة على الأقل");
      return;
    }
    if (isAlreadySubscribed) {
      toast.error("أنت مشترك بالفعل في هذه الباقة. يمكنك الترقية لباقة أعلى.");
      return;
    }
    if (hasPendingRequest) {
      toast.error("لديك طلب قيد المراجعة لنفس الباقة. انتظر حتى يتم معالجته.");
      return;
    }

    setSubmitting(true);
    try {
      const { data: { user: currentUser } } = await supabase.auth.getUser();
      if (!currentUser) {
        toast.error("يجب تسجيل الدخول أولاً");
        navigate("/auth/login");
        return;
      }

      const fileExt = receiptFile.name.split(".").pop();
      const filePath = `${currentUser.id}/${Date.now()}.${fileExt}`;
      const { error: uploadError } = await supabase.storage.from("receipts").upload(filePath, receiptFile);
      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage.from("receipts").getPublicUrl(filePath);

      const { data: request, error: insertError } = await supabase
        .from("subscription_requests")
        .insert({
          user_id: currentUser.id,
          package_id: selectedPackageId,
          countries: needsCountry ? countries : [],
          full_name: fullName,
          phone,
          email: email || currentUser.email,
          telegram_chat_id: telegramChatId,
          service_type: serviceType,
          receipt_url: publicUrl,
          admin_notes: isRenewal ? `تجديد اشتراك — الباقة: "${selectedPkg?.name_ar}" — ينتهي الاشتراك الحالي: ${activeSubscription ? new Date(activeSubscription.expires_at).toLocaleDateString("ar") : "—"}` : isUpgrade ? `ترقية من باقة "${activeSubscription?.packages?.name_ar}" — الفارق: ${priceDifference} د.ج` : null,
          // Note: isSelectingDifferentPkg auto-detected upgrade is handled via admin_notes above when isUpgrade is true
        } as any)
        .select()
        .single();

      if (insertError) {
        console.error("Insert error:", insertError);
        throw insertError;
      }

      supabase.functions.invoke("verify-receipt", {
        body: { requestId: (request as any).id, receiptUrl: publicUrl },
      }).catch((err) => console.error("AI verification error:", err));

      toast.success(isRenewal ? "تم إرسال طلب التجديد بنجاح!" : isUpgrade ? "تم إرسال طلب الترقية بنجاح!" : "تم إرسال طلبك بنجاح!");
      queryClient.invalidateQueries({ queryKey: ["my-requests"] });
      setSelectedPackageId("");
      setCountries([]);
      setReceiptFile(null);
      setReceiptPreview("");
    } catch (err: any) {
      toast.error(err.message || "حدث خطأ أثناء الإرسال");
    } finally {
      setSubmitting(false);
    }
  };

  const statusLabels: Record<string, { text: string; cls: string }> = {
    pending: { text: "قيد المراجعة", cls: "bg-yellow-500/10 text-yellow-400 border-yellow-500/30" },
    approved: { text: "مقبول ✓", cls: "bg-green-500/10 text-green-400 border-green-500/30" },
    rejected: { text: "مرفوض ✗", cls: "bg-red-500/10 text-red-400 border-red-500/30" },
    frozen: { text: "مجمّد ❄", cls: "bg-blue-500/10 text-blue-400 border-blue-500/30" },
  };

  const inputClass = "w-full rounded-xl border border-border/50 bg-secondary/30 px-4 py-3 text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/50";

  if (isPrivileged) {
    return (
      <Layout>
        <div className="container py-20 max-w-md text-center">
          <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
            <Shield className="w-8 h-8 text-primary" />
          </div>
          <h1 className="font-heading text-xl font-bold text-foreground mb-2">لا تحتاج اشتراك</h1>
          <p className="text-sm text-muted-foreground mb-6">
            بصفتك مسؤولاً، لديك وصول كامل لجميع الخدمات بدون الحاجة لاشتراك أو ترقية.
          </p>
          <Link to="/dashboard" className="gradient-primary text-primary-foreground font-bold px-6 py-2.5 rounded-xl text-sm">
            العودة للوحة التحكم
          </Link>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="container py-10 max-w-2xl">
        <Link to="/my-requests" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-6">
          <ArrowRight className="w-4 h-4" />
          طلباتي
        </Link>

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
          <h1 className="font-heading text-2xl font-bold text-foreground mb-2 flex items-center gap-2">
            {isRenewal ? <><RefreshCw className="w-6 h-6 text-accent" /> تجديد الاشتراك</> : isUpgrade ? <><ArrowUpCircle className="w-6 h-6 text-accent" /> ترقية الاشتراك</> : "طلب اشتراك"}
          </h1>
          <p className="text-sm text-muted-foreground mb-8">
            {isRenewal
              ? "جدّد اشتراكك في نفس الباقة وأرفق وصل الدفع"
              : isUpgrade
              ? "اختر الباقة الجديدة وأرفق وصل دفع الفارق"
              : "اختر نوع الخدمة والباقة وأرفق وصل الدفع CCP للمراجعة"}
          </p>

          {/* Active subscription info - shown when user already has a subscription in normal mode */}
          {!isUpgrade && !isRenewal && activeSubscription && new Date(activeSubscription.expires_at) > new Date() && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="rounded-2xl border border-accent/30 bg-accent/5 p-5 mb-6"
            >
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-accent/10 flex items-center justify-center shrink-0">
                  <Check className="w-5 h-5 text-accent" />
                </div>
                <div className="flex-1">
                  <p className="font-bold text-foreground text-sm mb-1">لديك اشتراك نشط ✓</p>
                  <p className="text-xs text-muted-foreground mb-3">
                    أنت مشترك حالياً في باقة "{activeSubscription.packages?.name_ar}" — ينتهي في{" "}
                    {new Date(activeSubscription.expires_at).toLocaleDateString("ar", { day: "numeric", month: "long", year: "numeric" })}
                  </p>
                  <div className="flex gap-2 flex-wrap">
                    <Link
                      to="/subscribe?upgrade=true"
                      className="inline-flex items-center gap-1.5 text-xs font-bold gradient-primary text-primary-foreground px-4 py-2 rounded-xl"
                    >
                      <ArrowUpCircle className="w-3.5 h-3.5" />
                      ترقية لباقة أعلى
                    </Link>
                    {daysLeft <= 15 && (
                      <Link
                        to={`/subscribe?renew=true&package=${activeSubscription.package_id}`}
                        className="inline-flex items-center gap-1.5 text-xs font-bold bg-secondary/50 text-foreground px-4 py-2 rounded-xl border border-border/50 hover:bg-secondary/70 transition-colors"
                      >
                        <RefreshCw className="w-3.5 h-3.5" />
                        تجديد الاشتراك
                      </Link>
                    )}
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {/* Current subscription info for renewals */}
          {isRenewal && activeSubscription && (
            <div className="gradient-card rounded-2xl border border-yellow-500/20 p-5 mb-6">
              <div className="flex items-center gap-2 mb-2">
                <RefreshCw className="w-4 h-4 text-yellow-400" />
                <p className="text-xs font-bold text-yellow-400">تجديد الاشتراك</p>
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-bold text-foreground">{activeSubscription.packages?.name_ar}</p>
                  <p className="text-xs text-muted-foreground">
                    {daysLeft === 0 ? "ينتهي اليوم" : daysLeft <= 0 ? "منتهي" : `متبقي ${daysLeft} ${daysLeft === 1 ? "يوم" : daysLeft === 2 ? "يومان" : daysLeft <= 10 ? "أيام" : "يوم"}`}
                    {" • "}ينتهي {new Date(activeSubscription.expires_at).toLocaleDateString("ar")}
                  </p>
                </div>
                <span className="font-bold text-foreground">{currentPrice} د.ج</span>
              </div>
            </div>
          )}

          {/* Current subscription info for upgrades */}
          {isUpgrade && activeSubscription && (
            <div className="gradient-card rounded-2xl border border-accent/20 p-5 mb-6">
              <p className="text-xs text-muted-foreground mb-1">اشتراكك الحالي</p>
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-bold text-foreground">{activeSubscription.packages?.name_ar}</p>
                  <p className="text-xs text-muted-foreground">
                    {activeSubscription.service_type === "visa" ? "تنبيهات الفيزا" : activeSubscription.service_type === "jobs" ? "عقود العمل" : "الباقة الشاملة"}
                    {" • "}ينتهي {new Date(activeSubscription.expires_at).toLocaleDateString("ar")}
                  </p>
                </div>
                <span className="font-bold text-foreground">{currentPrice} د.ج</span>
              </div>
            </div>
          )}

          <div className="space-y-6">
            {/* Service Type */}
            <div className="gradient-card rounded-2xl border border-border/50 p-6">
              <label className="block text-sm font-medium text-foreground mb-3">نوع الخدمة *</label>
              <div className="grid grid-cols-3 gap-3">
                {(["visa", "jobs", "both"] as ServiceType[]).map((key) => {
                  const labels: Record<ServiceType, { label: string; icon: React.ReactNode }> = {
                    visa: { label: "فيزا", icon: <Bell className="w-4 h-4" /> },
                    jobs: { label: "عقود عمل", icon: <Briefcase className="w-4 h-4" /> },
                    both: { label: "الاثنان", icon: <Layers className="w-4 h-4" /> },
                  };
                  const { label, icon } = labels[key];
                  return (
                    <button
                      key={key}
                      onClick={() => { setServiceType(key); setCountries([]); }}
                      className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border transition-all text-center ${
                        serviceType === key
                          ? "border-primary bg-primary/10 text-primary ring-1 ring-primary/30"
                          : "border-border/50 text-muted-foreground hover:border-primary/30"
                      }`}
                    >
                      {icon}
                      <span className="text-xs font-bold">{label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Package Selection */}
            <div className="gradient-card rounded-2xl border border-border/50 p-6">
              <label className="block text-sm font-medium text-foreground mb-3">
                {isUpgrade ? "الباقة الجديدة *" : "اختر الباقة *"}
              </label>
              <div className="grid gap-3">
                {packages?.filter((pkg) => {
                  // In upgrade mode, only show packages with higher price
                  if (isUpgrade && activeSubscription?.packages?.price) {
                    return (pkg.price || 0) > (activeSubscription.packages.price || 0);
                  }
                  return true;
                }).map((pkg) => {
                  const upgradeDiff = isUpgrade && activeSubscription ? Math.max(0, (pkg.price || 0) - currentPrice) : null;
                  const isCurrentPkg = activeSubscription?.package_id === pkg.id;
                  const isSelectedCurrentPkg = isCurrentPkg && selectedPackageId === pkg.id && !isUpgrade && !isRenewal;
                  return (
                    <button
                      key={pkg.id}
                      onClick={() => { setSelectedPackageId(pkg.id); setCountries([]); }}
                      className={`flex items-center justify-between p-4 rounded-xl border transition-all text-right ${
                        isSelectedCurrentPkg
                          ? "border-accent bg-accent/5 ring-1 ring-accent/30"
                          : isCurrentPkg && !isUpgrade && !isRenewal
                          ? "border-accent/30 bg-accent/5 hover:border-accent/50"
                          : selectedPackageId === pkg.id
                          ? "border-primary bg-primary/5 ring-1 ring-primary/30"
                          : "border-border/50 hover:border-primary/30"
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        {pkg.is_golden && <Crown className="w-5 h-5 text-accent" />}
                        <div>
                          <p className="font-bold text-foreground flex items-center gap-2">
                            {pkg.name_ar}
                            {isCurrentPkg && <span className="text-xs bg-muted px-2 py-0.5 rounded-full text-muted-foreground">الحالية</span>}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {pkg.duration_months} أشهر • {pkg.max_countries > 1 ? `حتى ${pkg.max_countries} دول` : "دولة واحدة"}
                          </p>
                        </div>
                      </div>
                      <div className="text-left">
                        {pkg.price ? (
                          <>
                            <span className="font-bold text-foreground block">{pkg.price} د.ج</span>
                            {upgradeDiff !== null && !isCurrentPkg && upgradeDiff > 0 && (
                              <span className="text-xs text-accent flex items-center gap-1">
                                <TrendingUp className="w-3 h-3" />
                                فارق: {upgradeDiff} د.ج
                              </span>
                            )}
                          </>
                        ) : (
                          <span className="text-accent font-bold">قريباً</span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Active subscription or pending request warning */}
            {selectedPackageId && (isAlreadySubscribed || hasPendingRequest) && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className={`rounded-2xl border p-5 ${
                  isAlreadySubscribed
                    ? "bg-accent/5 border-accent/30"
                    : "bg-yellow-500/5 border-yellow-500/30"
                }`}
              >
                <div className="flex items-start gap-3">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                    isAlreadySubscribed ? "bg-accent/10" : "bg-yellow-500/10"
                  }`}>
                    {isAlreadySubscribed ? (
                      <Check className="w-5 h-5 text-accent" />
                    ) : (
                      <AlertTriangle className="w-5 h-5 text-yellow-400" />
                    )}
                  </div>
                  <div className="flex-1">
                    {isAlreadySubscribed ? (
                      <>
                        <p className="font-bold text-foreground text-sm mb-1">أنت مشترك بالفعل في هذه الباقة ✓</p>
                        <p className="text-xs text-muted-foreground mb-3">
                          اشتراكك في "{selectedPkg?.name_ar}" ساري حتى{" "}
                          {new Date(activeSubscription!.expires_at).toLocaleDateString("ar", { day: "numeric", month: "long", year: "numeric" })}
                        </p>
                        <Link
                          to="/subscribe?upgrade=true"
                          className="inline-flex items-center gap-1.5 text-xs font-bold gradient-primary text-primary-foreground px-4 py-2 rounded-xl"
                        >
                          <ArrowUpCircle className="w-3.5 h-3.5" />
                          ترقية لباقة أعلى
                        </Link>
                        {daysLeft <= 15 && (
                          <Link
                            to={`/subscribe?renew=true&package=${activeSubscription!.package_id}`}
                            className="inline-flex items-center gap-1.5 text-xs font-bold bg-secondary/50 text-foreground px-4 py-2 rounded-xl border border-border/50 hover:bg-secondary/70 transition-colors mr-2"
                          >
                            <RefreshCw className="w-3.5 h-3.5" />
                            تجديد الاشتراك
                          </Link>
                        )}
                      </>
                    ) : (
                      <>
                        <p className="font-bold text-foreground text-sm mb-1">لديك طلب قيد المراجعة لهذه الباقة</p>
                        <p className="text-xs text-muted-foreground mb-3">
                          طلبك السابق لباقة "{selectedPkg?.name_ar}" لا يزال قيد المراجعة. سيتم إشعارك عند معالجته.
                        </p>
                        <Link
                          to="/my-requests"
                          className="inline-flex items-center gap-1.5 text-xs font-bold bg-secondary/50 text-foreground px-4 py-2 rounded-xl border border-border/50 hover:bg-secondary/70 transition-colors"
                        >
                          <ArrowRight className="w-3.5 h-3.5" />
                          عرض طلباتي
                        </Link>
                      </>
                    )}
                  </div>
                </div>
              </motion.div>
            )}

            {selectedPackageId && needsCountry && (
            !isAlreadySubscribed &&
              <div className="gradient-card rounded-2xl border border-border/50 p-6">
                <label className="block text-sm font-medium text-foreground mb-3">
                  اختر الدول ({countries.length}/{maxCountries}) *
                </label>
                <div className="flex gap-3 flex-wrap">
                  {countryOptions.map((c) => (
                    <button
                      key={c.code}
                      onClick={() => toggleCountry(c.code)}
                      className={`flex flex-col items-center gap-1 px-5 py-3 rounded-xl border transition-all ${
                        countries.includes(c.code) ? "border-primary bg-primary/10 text-primary" : "border-border/50 text-muted-foreground hover:border-primary/30"
                      }`}
                    >
                      <span className="text-xl">{c.flag}</span>
                      <span className="text-sm font-medium">{c.name}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* User Info Summary (read-only) */}
            {!isAlreadySubscribed && <div className="gradient-card rounded-2xl border border-border/50 p-5">
              <label className="block text-sm font-medium text-foreground mb-3">معلوماتك المسجّلة</label>
              <div className="space-y-2 text-sm">
                <div className="flex items-center gap-2 text-muted-foreground p-2.5 rounded-lg bg-muted/30">
                  <span className="font-medium text-foreground min-w-[80px]">الاسم:</span> {fullName || "—"}
                </div>
                <div className="flex items-center gap-2 text-muted-foreground p-2.5 rounded-lg bg-muted/30">
                  <span className="font-medium text-foreground min-w-[80px]">الهاتف:</span> {phone || "—"}
                </div>
                <div className="flex items-center gap-2 text-muted-foreground p-2.5 rounded-lg bg-muted/30">
                  <span className="font-medium text-foreground min-w-[80px]">البريد:</span> {email || "—"}
                </div>
                {telegramChatId && (
                  <div className="flex items-center gap-2 text-muted-foreground p-2.5 rounded-lg bg-muted/30">
                    <span className="font-medium text-foreground min-w-[80px]">تليغرام:</span> {telegramChatId}
                  </div>
                )}
              </div>
            </div>}

            {/* Price summary for upgrade */}
            {isUpgrade && selectedPkg && activeSubscription && (
              <div className="gradient-card rounded-2xl border border-accent/20 p-5">
                <p className="text-sm font-bold text-foreground mb-3">ملخص الترقية</p>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between text-muted-foreground">
                    <span>الباقة الحالية</span>
                    <span>{activeSubscription.packages?.name_ar} — {currentPrice} د.ج</span>
                  </div>
                  <div className="flex justify-between text-muted-foreground">
                    <span>الباقة الجديدة</span>
                    <span>{selectedPkg.name_ar} — {newPrice} د.ج</span>
                  </div>
                  <div className="border-t border-border/50 pt-2 flex justify-between font-bold text-foreground">
                    <span>المبلغ المطلوب (الفارق)</span>
                    <span className="text-accent">{priceDifference} د.ج</span>
                  </div>
                </div>
              </div>
            )}

            {/* Payment Info - always visible */}
            {!isAlreadySubscribed && paymentSettings && (paymentSettings.ccp_number || paymentSettings.rip_number) && (
              <div className="gradient-card rounded-2xl border border-accent/20 p-6">
                <label className="block text-sm font-bold text-foreground mb-4">معلومات الدفع</label>
                {paymentSettings.account_holder && (
                  <p className="text-xs text-muted-foreground mb-3 text-center">صاحب الحساب: <span className="font-bold text-foreground">{paymentSettings.account_holder}</span></p>
                )}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                  {/* CCP */}
                  {paymentSettings.ccp_number && (
                    <div className="rounded-xl border border-border/50 bg-muted/20 p-4 flex flex-col items-center gap-3">
                      <img src={ccpLogo} alt="CCP" className="h-12 w-auto object-contain" loading="lazy" />
                      <div className="text-center w-full space-y-2">
                        <div>
                          <p className="text-[10px] text-muted-foreground mb-0.5">رقم الحساب CCP</p>
                          <div className="flex items-center justify-center gap-2">
                            <span className="font-mono font-bold text-foreground tracking-wider text-sm">{paymentSettings.ccp_number}</span>
                            <button
                              onClick={() => { navigator.clipboard.writeText(paymentSettings.ccp_number); toast.success("تم نسخ رقم CCP"); }}
                              className="text-muted-foreground hover:text-primary transition-colors"
                              title="نسخ"
                            >
                              <Copy className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                        {paymentSettings.ccp_key && (
                          <div>
                            <p className="text-[10px] text-muted-foreground mb-0.5">المفتاح Clé</p>
                            <span className="font-mono font-bold text-foreground text-sm">{paymentSettings.ccp_key}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                  {/* BaridiMob */}
                  {paymentSettings.rip_number && (
                    <div className="rounded-xl border border-border/50 bg-muted/20 p-4 flex flex-col items-center gap-3">
                      <img src={baridimobLogo} alt="BaridiMob" className="h-12 w-auto object-contain" loading="lazy" />
                      <div className="text-center w-full space-y-2">
                        <div>
                          <p className="text-[10px] text-muted-foreground mb-0.5">رقم RIP</p>
                          <div className="flex items-center justify-center gap-2">
                            <span className="font-mono font-bold text-foreground tracking-wider text-[11px] break-all">{paymentSettings.rip_number}</span>
                            <button
                              onClick={() => { navigator.clipboard.writeText(paymentSettings.rip_number); toast.success("تم نسخ رقم RIP"); }}
                              className="text-muted-foreground hover:text-primary transition-colors shrink-0"
                              title="نسخ"
                            >
                              <Copy className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
                {selectedPkg ? (
                  <div className="rounded-lg bg-accent/10 border border-accent/20 p-3 text-center">
                    <p className="text-xs text-accent font-bold">
                      المبلغ المطلوب: {isUpgrade ? priceDifference : (selectedPkg?.price || 0)} د.ج
                    </p>
                    <p className="text-[10px] text-muted-foreground mt-1">قم بتحويل المبلغ ثم أرفق صورة الوصل أدناه</p>
                  </div>
                ) : (
                  <div className="rounded-lg bg-muted/30 border border-border/50 p-3 text-center">
                    <p className="text-xs text-muted-foreground">اختر الباقة أعلاه لمعرفة المبلغ المطلوب</p>
                  </div>
                )}
              </div>
            )}

            {!isAlreadySubscribed && <div className="gradient-card rounded-2xl border border-border/50 p-6">
              <label className="block text-sm font-medium text-foreground mb-3">
                وصل الدفع CCP * {isUpgrade && <span className="text-xs text-muted-foreground">(بمبلغ الفارق: {priceDifference} د.ج)</span>}
              </label>
              <div className="border-2 border-dashed border-border/50 rounded-xl p-6 text-center hover:border-primary/40 transition-colors">
                {receiptPreview ? (
                  <div className="space-y-3">
                    <img src={receiptPreview} alt="Receipt" className="max-h-48 mx-auto rounded-lg" />
                    <button onClick={() => { setReceiptFile(null); setReceiptPreview(""); }} className="text-xs text-destructive hover:underline">إزالة</button>
                  </div>
                ) : (
                  <label className="cursor-pointer space-y-2 block">
                    <FileImage className="w-10 h-10 text-muted-foreground mx-auto" />
                    <p className="text-sm text-muted-foreground">اضغط لتحميل صورة الوصل</p>
                    <p className="text-xs text-muted-foreground/60">JPG, PNG - حد أقصى 5MB</p>
                    <input type="file" accept="image/*" onChange={handleFileChange} className="hidden" />
                  </label>
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-2 flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" />
                سيتم فحص الوصل تلقائياً بالذكاء الاصطناعي
              </p>
            </div>}

            {/* Submit */}
            {!isAlreadySubscribed && <button
              onClick={handleSubmit}
              disabled={submitting}
              className="w-full py-4 rounded-xl font-bold gradient-primary text-primary-foreground hover:opacity-90 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {submitting ? (
                <div className="w-5 h-5 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
              ) : (
                isRenewal || isAlreadySubscribed ? <RefreshCw className="w-4 h-4" /> :
                isUpgrade || isSelectingDifferentPkg ? <ArrowUpCircle className="w-4 h-4" /> :
                <Send className="w-4 h-4" />
              )}
              {submitting ? "جاري الإرسال..." : isRenewal ? "إرسال طلب التجديد" : isUpgrade ? "إرسال طلب الترقية" : isAlreadySubscribed ? "إرسال طلب التجديد" : isSelectingDifferentPkg ? "إرسال طلب الترقية" : "إرسال طلب الاشتراك"}
            </button>}
          </div>

          {/* My Requests */}
          {myRequests && myRequests.length > 0 && (
            <div className="mt-10">
              <h2 className="font-heading text-xl font-bold text-foreground mb-4">طلباتي</h2>
              <div className="space-y-3">
                {myRequests.map((req: any) => {
                  const st = statusLabels[req.status] || statusLabels.pending;
                  return (
                    <div key={req.id} className="gradient-card rounded-xl border border-border/50 p-4 flex items-center justify-between">
                      <div>
                        <p className="font-medium text-foreground">{req.packages?.name_ar}</p>
                        <p className="text-xs text-muted-foreground">
                          {req.countries?.map((c: string) => countryOptions.find((co) => co.code === c)?.flag).join(" ")} •{" "}
                          {new Date(req.created_at).toLocaleDateString("ar")}
                        </p>
                        {req.ai_fraud_detected && (
                          <p className="text-xs text-destructive flex items-center gap-1 mt-1">
                            <AlertTriangle className="w-3 h-3" />
                            تم اكتشاف مشكلة في الوصل
                          </p>
                        )}
                      </div>
                      <span className={`text-xs font-bold px-3 py-1 rounded-full border ${st.cls}`}>{st.text}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </motion.div>
      </div>
    </Layout>
  );
}
