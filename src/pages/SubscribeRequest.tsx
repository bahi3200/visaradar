import Layout from "@/components/Layout";
import { motion } from "framer-motion";
import { Send, ArrowRight, Check, Crown, FileImage, AlertTriangle, Bell, Briefcase, Layers, ArrowUpCircle, TrendingUp, Copy, Shield, RefreshCw, FileText, ClipboardCheck, X, MapPin, PlusCircle, MinusCircle, Building2, Loader2, CreditCard } from "lucide-react";
import baridimobLogo from "@/assets/baridimob-logo.png";
import ccpLogo from "@/assets/ccp-logo.png";
import { useState, useRef } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";

const countryOptions = [
  { code: "IT", flag: "🇮🇹", name: "إيطاليا", provider: "VFS Global",            center: "الجزائر العاصمة • وهران" },
  { code: "FR", flag: "🇫🇷", name: "فرنسا",   provider: "Capago (TLScontact)",   center: "الجزائر • وهران • عنابة" },
  { code: "ES", flag: "🇪🇸", name: "إسبانيا", provider: "BLS International",     center: "الجزائر العاصمة • وهران" },
  { code: "DE", flag: "🇩🇪", name: "ألمانيا", provider: "VFS Global",            center: "الجزائر العاصمة" },
  { code: "GR", flag: "🇬🇷", name: "اليونان", provider: "VFS Global",            center: "الجزائر العاصمة" },
];
const VALID_COUNTRY_CODES = countryOptions.map((c) => c.code);

type ServiceType = "visa" | "jobs" | "both";
const MAX_RECEIPT_SIZE_MB = 10;
const isReceiptPdf = (file: File | null) =>
  Boolean(file && (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")));
const isReceiptImage = (file: File | null) =>
  Boolean(file && (file.type.startsWith("image/") || /\.(avif|gif|jpe?g|png|webp)$/i.test(file.name)));

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
  const initialCountries = (searchParams.get("countries") || "").split(",").map((c) => c.trim()).filter(Boolean);
  const [countries, setCountries] = useState<string[]>(initialCountries);
  type MonitoringScope = "centers_only" | "all_sites";
  const [monitoringScopes, setMonitoringScopes] = useState<Record<string, MonitoringScope>>({});
  const setScope = (code: string, scope: MonitoringScope) =>
    setMonitoringScopes((prev) => ({ ...prev, [code.toUpperCase()]: scope }));
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
  const [reviewOpen, setReviewOpen] = useState(false);
  const [isPreparingPayment, setIsPreparingPayment] = useState(false);
  const paymentInfoRef = useRef<HTMLDivElement | null>(null);
  const receiptSectionRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // When a package is selected, show a brief loading state, then reveal
  // payment info and smooth-scroll to it; afterwards nudge the receipt area
  // into view so the user can attach the receipt immediately.
  const handleSelectPackage = (pkgId: string) => {
    setSelectedPackageId(pkgId);
    setCountries([]);
    setIsPreparingPayment(true);
    setTimeout(() => {
      setIsPreparingPayment(false);
      paymentInfoRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      setTimeout(() => {
        receiptSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 2200);
    }, 900);
  };

  // Fetch live provider centers + change history for selected countries
  const { data: providerCenters } = useQuery({
    queryKey: ["provider-centers"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("provider_centers" as any)
        .select("country_code, provider, centers, last_checked_at, updated_at");
      if (error) throw error;
      return (data as any[]) || [];
    },
  });

  const selectedCountryCodes = countries.map((c) => c.toUpperCase());
  const { data: centerChanges } = useQuery({
    queryKey: ["provider-center-changes", selectedCountryCodes.join(",")],
    queryFn: async () => {
      if (selectedCountryCodes.length === 0) return [];
      const sinceIso = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString(); // last 60 days
      const { data, error } = await supabase
        .from("provider_center_changes" as any)
        .select("id, country_code, provider, change_type, center_name, detected_at")
        .in("country_code", selectedCountryCodes)
        .gte("detected_at", sinceIso)
        .order("detected_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data as any[]) || [];
    },
    enabled: selectedCountryCodes.length > 0,
  });

  const { data: packages } = useQuery({
    queryKey: ["packages"],
    queryFn: async () => {
      const { data, error } = await supabase.from("packages").select("*").eq("is_active", true).order("sort_order");
      if (error) throw error;
      return data;
    },
  });

  const { data: paymentSettings } = useQuery({
    queryKey: ["payment-info"],
    queryFn: async () => {
      // Session cache: avoid re-fetching across navigations within the same tab
      try {
        const cached = sessionStorage.getItem("vr_payment_info");
        if (cached) return JSON.parse(cached);
      } catch {}
      const { data, error } = await supabase.rpc("get_payment_info");
      if (error) throw error;
      const info = data?.[0] ?? null;
      try {
        if (info) sessionStorage.setItem("vr_payment_info", JSON.stringify(info));
      } catch {}
      return info;
    },
    enabled: !!selectedPackageId,
    staleTime: Infinity,
    gcTime: Infinity,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
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
      if (prev.includes(code)) {
        setMonitoringScopes((m) => {
          const next = { ...m };
          delete next[code.toUpperCase()];
          return next;
        });
        return prev.filter((c) => c !== code);
      }
      if (prev.length >= maxCountries) {
        toast.error(`الحد الأقصى ${maxCountries} دول لهذه الباقة`);
        return prev;
      }
      setMonitoringScopes((m) => ({ ...m, [code.toUpperCase()]: m[code.toUpperCase()] || "all_sites" }));
      return [...prev, code];
    });
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!isReceiptImage(file) && !isReceiptPdf(file)) {
      toast.error("يرجى رفع صورة أو ملف PDF فقط");
      e.target.value = "";
      return;
    }
    if (file.size > MAX_RECEIPT_SIZE_MB * 1024 * 1024) {
      toast.error(`حجم الملف يجب أن لا يتجاوز ${MAX_RECEIPT_SIZE_MB} ميغابايت`);
      e.target.value = "";
      return;
    }
    if (receiptPreview) URL.revokeObjectURL(receiptPreview);
    setReceiptFile(file);
    setReceiptPreview(URL.createObjectURL(file));
  };

  // Returns a list of validation issues; empty array = valid
  const getValidationIssues = (): string[] => {
    const issues: string[] = [];
    if (!selectedPackageId) issues.push("لم تختر الباقة");
    if (!fullName.trim()) issues.push("الاسم الكامل غير مسجّل في ملفك الشخصي");
    if (!receiptFile) issues.push("لم ترفق وصل الدفع");
    if (needsCountry) {
      const cleaned = Array.from(new Set(countries.map((c) => c.toUpperCase())))
        .filter((c) => VALID_COUNTRY_CODES.includes(c));
      const invalid = countries.filter((c) => !VALID_COUNTRY_CODES.includes(c.toUpperCase()));
      if (cleaned.length === 0) issues.push("يجب اختيار دولة واحدة على الأقل من القائمة المتاحة");
      if (invalid.length > 0) issues.push(`دول غير مدعومة في الاختيار: ${invalid.join(", ")}`);
      if (cleaned.length !== new Set(countries.map((c) => c.toUpperCase())).size) {
        issues.push("توجد دول مكرّرة في الاختيار");
      }
      if (cleaned.length > maxCountries) {
        issues.push(`هذه الباقة تسمح بحد أقصى ${maxCountries} دول — اخترت ${cleaned.length}`);
      }
    }
    if (isAlreadySubscribed) issues.push("أنت مشترك بالفعل في هذه الباقة");
    if (hasPendingRequest) issues.push("لديك طلب قيد المراجعة لنفس الباقة");
    return issues;
  };

  const openReview = () => {
    const issues = getValidationIssues();
    if (issues.length > 0) {
      toast.error(issues[0]);
      return;
    }
    setReviewOpen(true);
  };

  const handleSubmit = async () => {
    const issues = getValidationIssues();
    if (issues.length > 0) {
      toast.error(issues[0]);
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

      const fileExt = isReceiptPdf(receiptFile) ? "pdf" : receiptFile.name.split(".").pop()?.toLowerCase() || "jpg";
      const filePath = `${currentUser.id}/${Date.now()}.${fileExt}`;
      const receiptStoragePath = `receipts/${filePath}`;
      const { error: uploadError } = await supabase.storage.from("receipts").upload(filePath, receiptFile, { contentType: receiptFile.type || (isReceiptPdf(receiptFile) ? "application/pdf" : undefined) });
      if (uploadError) throw uploadError;

      const { data: request, error: insertError } = await supabase
        .from("subscription_requests")
        .insert({
          user_id: currentUser.id,
          package_id: selectedPackageId,
          countries: needsCountry ? countries : [],
          monitoring_scopes: needsCountry
            ? Object.fromEntries(
                countries.map((c) => [c.toUpperCase(), monitoringScopes[c.toUpperCase()] || "all_sites"])
              )
            : {},
          full_name: fullName,
          phone,
          email: email || currentUser.email,
          telegram_chat_id: telegramChatId,
          service_type: serviceType,
          receipt_url: receiptStoragePath,
          admin_notes: isRenewal ? `تجديد اشتراك — الباقة: "${selectedPkg?.name_ar}" — ينتهي الاشتراك الحالي: ${activeSubscription ? new Date(activeSubscription.expires_at).toLocaleDateString("ar") : "—"}` : isUpgrade ? `ترقية من باقة "${activeSubscription?.packages?.name_ar}" — الفارق: ${priceDifference} د.ج` : null,
          // Note: isSelectingDifferentPkg auto-detected upgrade is handled via admin_notes above when isUpgrade is true
        } as any)
        .select()
        .single();

      if (insertError) {
        console.error("Insert error:", insertError);
        throw insertError;
      }

      if (isReceiptImage(receiptFile)) {
        supabase.functions.invoke("verify-receipt", {
          body: { requestId: (request as any).id, receiptUrl: receiptStoragePath },
        }).catch((err) => console.error("AI verification error:", err));
      }

      // Notify admins (Telegram + audit log). Fire-and-forget — never block user.
      supabase.functions
        .invoke("notify-admin-new-payment", {
          body: { requestId: (request as any).id },
        })
        .then(({ data, error }) => {
          if (error) {
            console.error("[notify-admin-new-payment] invoke error:", error);
          } else {
            console.log("[notify-admin-new-payment] result:", data);
          }
        })
        .catch((err) => console.error("[notify-admin-new-payment] fatal:", err));

      toast.success(isRenewal ? "تم إرسال طلب التجديد بنجاح!" : isUpgrade ? "تم إرسال طلب الترقية بنجاح!" : "تم إرسال طلبك بنجاح!");
      queryClient.invalidateQueries({ queryKey: ["my-requests"] });
      setSelectedPackageId("");
      setCountries([]);
      setReceiptFile(null);
      if (receiptPreview) URL.revokeObjectURL(receiptPreview);
      setReceiptPreview("");
      setReviewOpen(false);
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
                      disabled={isCurrentPkg && !isUpgrade && !isRenewal}
                      onClick={() => { if (isCurrentPkg && !isUpgrade && !isRenewal) return; handleSelectPackage(pkg.id); }}
                      className={`flex items-center justify-between p-4 rounded-xl border transition-all text-right ${
                        isCurrentPkg && !isUpgrade && !isRenewal
                          ? "border-muted bg-muted/30 opacity-60 cursor-not-allowed"
                          : isSelectedCurrentPkg
                          ? "border-accent bg-accent/5 ring-1 ring-accent/30"
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
                            {isCurrentPkg && !isUpgrade && !isRenewal && <span className="text-xs bg-accent/20 text-accent px-2 py-0.5 rounded-full font-bold">✓ مشترك</span>}
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
                <div className="flex items-center justify-between mb-3">
                  <label className="block text-sm font-medium text-foreground">
                    اختر الدول *
                  </label>
                  <span className={`text-xs font-bold px-2 py-1 rounded-full ${
                    countries.length === 0
                      ? 'bg-destructive/10 text-destructive'
                      : countries.length >= maxCountries
                        ? 'bg-accent/15 text-accent'
                        : 'bg-primary/10 text-primary'
                  }`}>
                    {countries.length} / {maxCountries}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mb-3">
                  نراقب المراكز التالية لكل دولة. اختر فقط الدول التي تخطّط للتقدم منها.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {countryOptions.map((c) => {
                    const selected = countries.includes(c.code);
                    const atLimit = !selected && countries.length >= maxCountries;
                    return (
                      <button
                        key={c.code}
                        onClick={() => toggleCountry(c.code)}
                        className={`flex items-start gap-3 px-4 py-3 rounded-xl border text-right transition-all ${
                          selected
                            ? "border-primary bg-primary/10"
                            : atLimit
                              ? "border-border/30 bg-muted/20 opacity-60"
                              : "border-border/50 hover:border-primary/40"
                        }`}
                      >
                        <span className="text-2xl shrink-0">{c.flag}</span>
                        <div className="flex-1 min-w-0">
                          <p className={`text-sm font-bold ${selected ? 'text-primary' : 'text-foreground'}`}>
                            {c.name}
                          </p>
                          <p className="text-[11px] text-muted-foreground truncate">{c.provider}</p>
                          <p className="text-[11px] text-muted-foreground/80 truncate">📍 {c.center}</p>
                        </div>
                        {selected && (
                          <Check className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                        )}
                      </button>
                    );
                  })}
                </div>
                {countries.length === 0 && (
                  <p className="text-xs text-destructive/80 mt-3">⚠️ يجب اختيار دولة واحدة على الأقل لتفعيل التنبيهات.</p>
                )}

                {/* Center change notifications for selected countries */}
                {countries.length > 0 && centerChanges && centerChanges.length > 0 && (
                  <div className="mt-4 rounded-xl border border-accent/30 bg-accent/5 p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <Building2 className="w-4 h-4 text-accent" />
                      <p className="text-xs font-bold text-accent">
                        تنبيه: تغييرات حديثة على المراكز ({centerChanges.length})
                      </p>
                    </div>
                    <ul className="space-y-2">
                      {centerChanges.slice(0, 6).map((ch: any) => {
                        const co = countryOptions.find((c) => c.code === ch.country_code);
                        const isAdd = ch.change_type === "added";
                        return (
                          <li key={ch.id} className="flex items-start gap-2 text-xs">
                            {isAdd ? (
                              <PlusCircle className="w-3.5 h-3.5 text-green-400 mt-0.5 shrink-0" />
                            ) : (
                              <MinusCircle className="w-3.5 h-3.5 text-destructive mt-0.5 shrink-0" />
                            )}
                            <div className="flex-1 min-w-0">
                              <p className="text-foreground">
                                <span className="font-bold">{co?.flag} {co?.name || ch.country_code}</span>
                                {" • "}
                                <span className={isAdd ? "text-green-400 font-bold" : "text-destructive font-bold"}>
                                  {isAdd ? "تمت إضافة" : "تم حذف"} مركز "{ch.center_name}"
                                </span>
                              </p>
                              <p className="text-[11px] text-muted-foreground">
                                {ch.provider} • {new Date(ch.detected_at).toLocaleDateString("ar")}
                              </p>
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                    {centerChanges.length > 6 && (
                      <p className="text-[11px] text-muted-foreground mt-2">+ {centerChanges.length - 6} تنبيه آخر</p>
                    )}
                  </div>
                )}

                {/* Live centers per selected country (overrides hardcoded if available) */}
                {countries.length > 0 && providerCenters && providerCenters.length > 0 && (
                  <div className="mt-3 space-y-2">
                    {countries.map((code) => {
                      const live = providerCenters.find((p: any) => p.country_code === code.toUpperCase());
                      const co = countryOptions.find((c) => c.code === code.toUpperCase());
                      if (!live || !co) return null;
                      return (
                        <div key={code} className="flex items-start gap-2 text-[11px] text-muted-foreground rounded-lg bg-muted/20 px-3 py-2">
                          <MapPin className="w-3 h-3 mt-0.5 shrink-0 text-primary" />
                          <span>
                            <span className="font-bold text-foreground">{co.flag} {co.name}</span> — المراكز الحالية: {(live.centers || []).join(" • ") || "—"}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Custom monitoring scope per country */}
                {countries.length > 0 && (
                  <div className="mt-4 rounded-xl border border-primary/20 bg-primary/5 p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <Shield className="w-4 h-4 text-primary" />
                      <p className="text-xs font-bold text-primary">نطاق المراقبة لكل دولة</p>
                    </div>
                    <p className="text-[11px] text-muted-foreground mb-3">
                      اختر ما إذا كنت تريد مراقبة المراكز الرسمية فقط أو جميع المواقع المرتبطة بكل دولة.
                    </p>
                    <div className="space-y-2">
                      {countries.map((code) => {
                        const co = countryOptions.find((c) => c.code === code.toUpperCase());
                        const current = monitoringScopes[code.toUpperCase()] || "all_sites";
                        return (
                          <div key={code} className="rounded-lg bg-background/40 border border-border/40 p-2.5">
                            <div className="flex items-center justify-between gap-2 mb-2">
                              <span className="text-xs font-bold text-foreground">
                                {co?.flag} {co?.name || code}
                              </span>
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                              <button
                                type="button"
                                onClick={() => setScope(code, "centers_only")}
                                className={`text-[11px] px-2 py-2 rounded-md border transition-all ${
                                  current === "centers_only"
                                    ? "border-primary bg-primary/15 text-primary font-bold"
                                    : "border-border/40 text-muted-foreground hover:border-primary/40"
                                }`}
                              >
                                🏢 المراكز فقط
                              </button>
                              <button
                                type="button"
                                onClick={() => setScope(code, "all_sites")}
                                className={`text-[11px] px-2 py-2 rounded-md border transition-all ${
                                  current === "all_sites"
                                    ? "border-primary bg-primary/15 text-primary font-bold"
                                    : "border-border/40 text-muted-foreground hover:border-primary/40"
                                }`}
                              >
                                🌐 كل المواقع
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
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

            {/* Preparing payment info loader */}
            {selectedPackageId && isPreparingPayment && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="gradient-card rounded-2xl border border-accent/30 p-6 text-center"
              >
                <div className="flex flex-col items-center gap-3">
                  <div className="relative">
                    <div className="w-14 h-14 rounded-2xl bg-accent/10 flex items-center justify-center">
                      <CreditCard className="w-7 h-7 text-accent" />
                    </div>
                    <Loader2 className="w-5 h-5 text-accent animate-spin absolute -bottom-1 -left-1" />
                  </div>
                  <p className="text-sm font-bold text-foreground">جاري تحضير معلومات الدفع…</p>
                  <p className="text-xs text-muted-foreground">سيتم عرض رقم CCP/BaridiMob ثم نفتح لك خانة رفع الوصل تلقائياً</p>
                </div>
              </motion.div>
            )}

            {/* Payment Info - shown after preparing */}
            {!isAlreadySubscribed && !isPreparingPayment && paymentSettings && (paymentSettings.ccp_number || paymentSettings.rip_number) && (
              <motion.div
                ref={paymentInfoRef}
                initial={selectedPackageId ? { opacity: 0, y: 10 } : false}
                animate={{ opacity: 1, y: 0 }}
                className="gradient-card rounded-2xl border border-accent/20 p-6"
              >
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
                  <div className="rounded-lg bg-accent/10 border border-accent/20 p-4 text-center space-y-2">
                    <p className="text-xs text-accent font-bold">
                      المبلغ المطلوب: {isUpgrade ? priceDifference : (selectedPkg?.price || 0)} د.ج
                    </p>
                    <p className="text-[10px] text-muted-foreground">قم بتحويل المبلغ ثم أنقر للذهاب إلى الخطوة التالية</p>
                    <button
                      type="button"
                      onClick={() => receiptSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "center" })}
                      className="inline-flex items-center gap-2 text-xs font-bold text-accent-foreground bg-accent/90 hover:bg-accent rounded-lg px-4 py-2 transition-all"
                    >
                      <FileImage className="w-3.5 h-3.5" />
                      ارفع وصل الدفع الآن
                    </button>
                  </div>
                ) : (
                  <div className="rounded-lg bg-muted/30 border border-border/50 p-3 text-center">
                    <p className="text-xs text-muted-foreground">اختر الباقة أعلاه لمعرفة المبلغ المطلوب</p>
                  </div>
                )}
              </motion.div>
            )}

            {!isAlreadySubscribed && !isPreparingPayment && <div
              ref={receiptSectionRef}
              className={`gradient-card rounded-2xl border p-6 transition-all ${selectedPackageId && !receiptFile ? "border-accent/40 ring-2 ring-accent/20 animate-pulse-once" : "border-border/50"}`}
            >
              <label className="block text-sm font-medium text-foreground mb-3">
                وصل الدفع CCP * {isUpgrade && <span className="text-xs text-muted-foreground">(بمبلغ الفارق: {priceDifference} د.ج)</span>}
              </label>
              <div className="border-2 border-dashed border-border/50 rounded-xl p-6 text-center hover:border-primary/40 transition-colors">
                {receiptPreview ? (
                  <div className="space-y-3">
                    {isReceiptPdf(receiptFile) ? (
                      <div className="mx-auto flex max-w-xs items-center justify-center gap-3 rounded-lg border border-border/50 bg-muted/30 px-4 py-5 text-right">
                        <FileText className="h-8 w-8 shrink-0 text-primary" />
                        <div className="min-w-0">
                          <p className="text-sm font-bold text-foreground">تم اختيار ملف PDF</p>
                          <p className="truncate text-xs text-muted-foreground">{receiptFile?.name}</p>
                        </div>
                      </div>
                    ) : (
                      <img src={receiptPreview} alt="Receipt" className="max-h-48 mx-auto rounded-lg" />
                    )}
                    <button onClick={() => { setReceiptFile(null); if (receiptPreview) URL.revokeObjectURL(receiptPreview); setReceiptPreview(""); }} className="text-xs text-destructive hover:underline">إزالة</button>
                  </div>
                ) : (
                  <label className="cursor-pointer space-y-2 block">
                    <FileImage className="w-10 h-10 text-muted-foreground mx-auto" />
                    <p className="text-sm text-muted-foreground">اضغط لتحميل صورة أو PDF للوصل</p>
                    <p className="text-xs text-muted-foreground/60">JPG, PNG, WEBP, PDF - حد أقصى {MAX_RECEIPT_SIZE_MB}MB</p>
                    <input ref={fileInputRef} type="file" accept="image/*,application/pdf,.pdf" onChange={handleFileChange} className="hidden" />
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
              onClick={openReview}
              disabled={submitting}
              className="w-full py-4 rounded-xl font-bold gradient-primary text-primary-foreground hover:opacity-90 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {submitting ? (
                <div className="w-5 h-5 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
              ) : (
                <ClipboardCheck className="w-4 h-4" />
              )}
              {submitting ? "جاري الإرسال..." : "مراجعة وتأكيد الطلب"}
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

      {/* Final review dialog */}
      <ReviewDialog
        open={reviewOpen}
        onOpenChange={setReviewOpen}
        issues={getValidationIssues()}
        submitting={submitting}
        onConfirm={handleSubmit}
        selectedPkg={selectedPkg}
        serviceType={serviceType}
        needsCountry={needsCountry}
        countries={countries}
        countryOptions={countryOptions}
        maxCountries={maxCountries}
        monitoringScopes={monitoringScopes}
        amount={isUpgrade ? priceDifference : (selectedPkg?.price || 0)}
        isUpgrade={isUpgrade}
        isRenewal={isRenewal}
        receiptFile={receiptFile}
      />
    </Layout>
  );
}

function ReviewDialog({
  open,
  onOpenChange,
  issues,
  submitting,
  onConfirm,
  selectedPkg,
  serviceType,
  needsCountry,
  countries,
  countryOptions,
  maxCountries,
  monitoringScopes,
  amount,
  isUpgrade,
  isRenewal,
  receiptFile,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  issues: string[];
  submitting: boolean;
  onConfirm: () => void;
  selectedPkg: any;
  serviceType: ServiceType;
  needsCountry: boolean;
  countries: string[];
  countryOptions: Array<{ code: string; flag: string; name: string; provider: string; center: string }>;
  maxCountries: number;
  monitoringScopes: Record<string, "centers_only" | "all_sites">;
  amount: number;
  isUpgrade: boolean;
  isRenewal: boolean;
  receiptFile: File | null;
}) {
  const hasIssues = issues.length > 0;
  const serviceLabel = serviceType === "visa" ? "تنبيهات الفيزا" : serviceType === "jobs" ? "عقود العمل" : "الباقة الشاملة (فيزا + عمل)";
  const title = isRenewal ? "تأكيد طلب التجديد" : isUpgrade ? "تأكيد طلب الترقية" : "تأكيد طلب الاشتراك";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto" dir="rtl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-right">
            <ClipboardCheck className="w-5 h-5 text-primary" />
            {title}
          </DialogTitle>
          <DialogDescription className="text-right">
            راجع التفاصيل بعناية قبل التأكيد. لا يمكن تعديل الطلب بعد الإرسال.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 text-sm">
          {/* Package */}
          <div className="rounded-xl border border-border/50 p-4 bg-muted/20">
            <p className="text-xs text-muted-foreground mb-1">الباقة</p>
            <p className="font-bold text-foreground">{selectedPkg?.name_ar || "—"}</p>
            <p className="text-xs text-muted-foreground mt-1">
              {selectedPkg?.duration_months} أشهر • حد أقصى {maxCountries} {maxCountries === 1 ? "دولة" : "دول"}
            </p>
          </div>

          {/* Service type */}
          <div className="rounded-xl border border-border/50 p-4 bg-muted/20">
            <p className="text-xs text-muted-foreground mb-1">نوع الخدمة</p>
            <p className="font-bold text-foreground">{serviceLabel}</p>
          </div>

          {/* Countries + centers */}
          {needsCountry && (
            <div className="rounded-xl border border-border/50 p-4 bg-muted/20">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs text-muted-foreground">الدول والمراكز المراقَبة</p>
                <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${
                  countries.length === 0
                    ? "bg-destructive/10 text-destructive"
                    : countries.length > maxCountries
                      ? "bg-destructive/10 text-destructive"
                      : "bg-primary/10 text-primary"
                }`}>
                  {countries.length} / {maxCountries}
                </span>
              </div>
              {countries.length === 0 ? (
                <p className="text-xs text-destructive">لم تختر أي دولة.</p>
              ) : (
                <ul className="space-y-2">
                  {countries.map((code) => {
                    const c = countryOptions.find((x: any) => x.code === code.toUpperCase());
                    if (!c) {
                      return (
                        <li key={code} className="flex items-center gap-2 text-destructive text-xs">
                          <X className="w-3.5 h-3.5" />
                          رمز غير صالح: {code}
                        </li>
                      );
                    }
                    return (
                      <li key={code} className="flex items-start gap-2">
                        <span className="text-lg leading-none">{c.flag}</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-bold text-foreground">{c.name}</p>
                          <p className="text-[11px] text-muted-foreground">{c.provider} • 📍 {c.center}</p>
                          <p className="text-[11px] text-primary mt-0.5">
                            نطاق المراقبة: {(monitoringScopes[code.toUpperCase()] || "all_sites") === "centers_only" ? "🏢 المراكز فقط" : "🌐 كل المواقع"}
                          </p>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          )}

          {/* Receipt */}
          <div className="rounded-xl border border-border/50 p-4 bg-muted/20">
            <p className="text-xs text-muted-foreground mb-1">وصل الدفع</p>
            {receiptFile ? (
              <p className="text-xs font-bold text-foreground truncate">📎 {receiptFile.name}</p>
            ) : (
              <p className="text-xs text-destructive">لم يُرفق أي ملف</p>
            )}
          </div>

          {/* Amount */}
          <div className="rounded-xl border border-accent/30 bg-accent/5 p-4 flex items-center justify-between">
            <span className="text-sm font-bold text-foreground">
              {isUpgrade ? "مبلغ الترقية (الفارق)" : "المبلغ المطلوب"}
            </span>
            <span className="text-base font-bold text-accent">{amount} د.ج</span>
          </div>

          {/* Issues */}
          {hasIssues && (
            <div className="rounded-xl border border-destructive/40 bg-destructive/5 p-4">
              <div className="flex items-center gap-2 mb-2">
                <AlertTriangle className="w-4 h-4 text-destructive" />
                <p className="text-xs font-bold text-destructive">يوجد {issues.length} مشكلة تمنع الإرسال</p>
              </div>
              <ul className="space-y-1 text-xs text-destructive/90 list-disc pr-5">
                {issues.map((iss, i) => <li key={i}>{iss}</li>)}
              </ul>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <button
            onClick={() => onOpenChange(false)}
            disabled={submitting}
            className="px-4 py-2 rounded-xl border border-border/50 bg-secondary/40 text-foreground text-sm font-bold hover:bg-secondary/60 transition-colors disabled:opacity-50"
          >
            رجوع للتعديل
          </button>
          <button
            onClick={onConfirm}
            disabled={submitting || hasIssues}
            className="px-4 py-2 rounded-xl gradient-primary text-primary-foreground text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting ? (
              <div className="w-4 h-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
            ) : (
              <Send className="w-4 h-4" />
            )}
            {submitting ? "جاري الإرسال..." : "تأكيد وإرسال"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
