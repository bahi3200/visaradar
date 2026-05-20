import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router-dom";
import {
  CreditCard,
  XCircle,
  Calendar,
  Crown,
  ArrowLeft,
  Info,
  CheckCircle2,
  AlertTriangle,
  Clock,
  History,
  Receipt,
  RefreshCw,
  CalendarClock,
  Globe2,
  Sparkles,
  FileText,
  Download,
  ExternalLink,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import Layout from "@/components/Layout";
import SEO from "@/components/SEO";
import BackButton from "@/components/BackButton";
import { toast } from "@/components/ui/use-toast";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import type { SubscriptionWithPackage } from "@/types/supabase-extended";

type DerivedStatus = "active" | "expiring" | "expired" | "none";

type PaymentEvent = {
  id: string;
  event_type: string;
  status: string;
  provider: string | null;
  amount: number | null;
  currency: string | null;
  reference: string | null;
  message: string | null;
  created_at: string;
};

type InvoiceRow = {
  id: string;
  status: string;
  created_at: string;
  reviewed_at: string | null;
  receipt_url: string | null;
  admin_notes: string | null;
  package_id: string;
  packages: {
    name_ar: string | null;
    price: number | null;
    promo_price: number | null;
    duration_months: number | null;
  } | null;
};

function deriveStatus(sub: SubscriptionWithPackage | null): {
  status: DerivedStatus;
  daysLeft: number | null;
} {
  if (!sub) return { status: "none", daysLeft: null };
  const now = Date.now();
  const end = new Date(sub.expires_at).getTime();
  const daysLeft = Math.ceil((end - now) / (1000 * 60 * 60 * 24));
  if (daysLeft <= 0 || sub.status !== "active") return { status: "expired", daysLeft };
  if (daysLeft <= 7) return { status: "expiring", daysLeft };
  return { status: "active", daysLeft };
}

export default function Billing() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();

  const { data: subscription, isLoading, isFetching, refetch } = useQuery<
    SubscriptionWithPackage | null
  >({
    queryKey: ["my-subscription", user?.id],
    queryFn: async () => {
      if (!user) return null;
      const { data } = await supabase
        .from("subscriptions")
        .select("*, packages(*)")
        .eq("user_id", user.id)
        .order("expires_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      return (data as SubscriptionWithPackage | null) ?? null;
    },
    enabled: !!user,
    refetchOnWindowFocus: true,
  });

  // Handle ?payment=success — refresh and notify, then clean URL
  useEffect(() => {
    const paymentStatus = searchParams.get("payment");
    if (!paymentStatus || !user) return;

    if (paymentStatus === "success") {
      toast({
        title: "تم الدفع بنجاح ✓",
        description: "جاري تحديث حالة اشتراكك...",
      });
      queryClient.invalidateQueries({ queryKey: ["my-subscription", user.id] });
      refetch();
    } else if (paymentStatus === "cancelled") {
      toast({
        title: "تم إلغاء العملية",
        description: "لم يتم خصم أي مبلغ.",
        variant: "destructive",
      });
    }
    // strip query param
    searchParams.delete("payment");
    setSearchParams(searchParams, { replace: true });
  }, [searchParams, user, queryClient, refetch, setSearchParams]);

  // Realtime: auto-refresh when subscription row changes (e.g. webhook updates it)
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel(`billing-sub-${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "subscriptions",
          filter: `user_id=eq.${user.id}`,
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ["my-subscription", user.id] });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, queryClient]);

  // Payment events list (latest 20 for current user)
  const { data: events = [], isLoading: eventsLoading } = useQuery<PaymentEvent[]>({
    queryKey: ["my-payment-events", user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data } = await (supabase as any)
        .from("payment_events")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(20);
      return (data as PaymentEvent[]) ?? [];
    },
    enabled: !!user,
    refetchOnWindowFocus: true,
  });

  // Realtime: refresh events on insert
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel(`billing-events-${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "payment_events",
          filter: `user_id=eq.${user.id}`,
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ["my-payment-events", user.id] });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, queryClient]);

  const [pendingAction, setPendingAction] = useState<null | "update" | "cancel">(null);
  const [cancelConfirmOpen, setCancelConfirmOpen] = useState(false);
  const [updateConfirmOpen, setUpdateConfirmOpen] = useState(false);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  // Invoices / billing transactions (latest 10 subscription requests for this user)
  const { data: invoices = [], isLoading: invoicesLoading } = useQuery<InvoiceRow[]>({
    queryKey: ["my-invoices", user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data } = await supabase
        .from("subscription_requests")
        .select(
          "id, status, created_at, reviewed_at, receipt_url, admin_notes, package_id, packages(name_ar, price, promo_price, duration_months)",
        )
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(10);
      return (data as unknown as InvoiceRow[]) ?? [];
    },
    enabled: !!user,
    refetchOnWindowFocus: true,
  });

  const extractReceiptPath = (url: string): string | null => {
    if (!url) return null;
    // Already a storage path
    if (!url.startsWith("http")) return url;
    const marker = "/receipts/";
    const idx = url.indexOf(marker);
    if (idx === -1) return null;
    return decodeURIComponent(url.substring(idx + marker.length).split("?")[0]);
  };

  const downloadReceipt = async (invoice: InvoiceRow) => {
    if (!invoice.receipt_url) return;
    setDownloadingId(invoice.id);
    try {
      const path = extractReceiptPath(invoice.receipt_url);
      let url = invoice.receipt_url;
      if (path) {
        const { data, error } = await supabase.storage
          .from("receipts")
          .createSignedUrl(path, 3600);
        if (error || !data?.signedUrl) throw new Error(error?.message ?? "تعذر إنشاء رابط الوصل");
        url = data.signedUrl;
      }
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (err) {
      const message = err instanceof Error ? err.message : "تعذر تحميل الوصل";
      toast({ title: "فشل التحميل", description: message, variant: "destructive" });
    } finally {
      setDownloadingId(null);
    }
  };

  const logEvent = async (payload: {
    event_type: string;
    status: "info" | "warning" | "failed";
    message: string;
    metadata?: Record<string, unknown>;
  }) => {
    if (!user) return;
    const { error } = await (supabase as any).from("payment_events").insert({
      user_id: user.id,
      subscription_id: subscription?.id ?? null,
      event_type: payload.event_type,
      status: payload.status,
      provider: "simulation",
      message: payload.message,
      metadata: payload.metadata ?? {},
    });
    if (error) {
      // eslint-disable-next-line no-console
      console.error("Failed to log payment event:", error);
    }
  };

  const notReady = async (action: "update" | "cancel") => {
    setPendingAction(action);
    const eventType = action === "update" ? "payment_method.update_attempted" : "subscription.cancel_attempted";
    const friendlyAction = action === "update" ? "تحديث طريقة الدفع" : "إلغاء الاشتراك";
    try {
      // Brief loading state to mimic provider round-trip
      await new Promise((r) => setTimeout(r, 700));

      // Guard: must have an active subscription
      if (!subscription) {
        throw new Error("لا يوجد اشتراك نشط مرتبط بحسابك حاليًا.");
      }

      // Simulation: provider is not connected — treat as a controlled "provider unavailable" failure
      const errMsg =
        action === "update"
          ? "تعذّر فتح بوابة تحديث طريقة الدفع: مزوّد الدفع (Paddle/Stripe) غير مفعّل بعد."
          : "تعذّر إلغاء الاشتراك تلقائيًا: مزوّد الدفع (Paddle/Stripe) غير مفعّل بعد.";

      await logEvent({
        event_type: eventType,
        status: "failed",
        message: errMsg,
        metadata: { reason: "provider_not_configured", action },
      });

      toast({
        title: `فشل ${friendlyAction}`,
        description: `${errMsg} تواصل مع الدعم لإجراء العملية يدويًا.`,
        variant: "destructive",
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "حدث خطأ غير متوقع.";
      await logEvent({
        event_type: eventType,
        status: "failed",
        message,
        metadata: { reason: "client_error", action },
      });
      toast({
        title: `فشل ${friendlyAction}`,
        description: message,
        variant: "destructive",
      });
    } finally {
      setPendingAction(null);
    }
  };

  const formatDate = (d: string) =>
    new Date(d).toLocaleDateString("ar-DZ", { year: "numeric", month: "long", day: "numeric" });

  const { status, daysLeft } = deriveStatus(subscription ?? null);

  const statusBadge = () => {
    if (status === "active")
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1 rounded-full bg-primary/15 text-primary">
          <CheckCircle2 className="w-3.5 h-3.5" />
          نشط
        </span>
      );
    if (status === "expiring")
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1 rounded-full bg-accent/15 text-accent">
          <AlertTriangle className="w-3.5 h-3.5" />
          ينتهي قريبًا ({daysLeft} أيام)
        </span>
      );
    if (status === "expired")
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1 rounded-full bg-destructive/15 text-destructive">
          <XCircle className="w-3.5 h-3.5" />
          منتهي
        </span>
      );
    return null;
  };

  return (
    <Layout>
      <SEO title="إدارة الفوترة | VisaRadar" description="إدارة اشتراكك وطريقة الدفع" />
      <div className="container mx-auto px-4 py-8 max-w-3xl">
        <BackButton />

        <div className="mb-6">
          <h1 className="text-2xl md:text-3xl font-bold text-foreground mb-2">إدارة الفوترة</h1>
          <p className="text-sm text-muted-foreground">عرض اشتراكك الحالي وإدارة طريقة الدفع</p>
        </div>

        {/* Stripe failure + Paddle suggestion banner */}
        <div className="gradient-card rounded-xl border border-destructive/30 p-4 mb-4 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
          <div className="text-xs text-muted-foreground leading-relaxed space-y-1">
            <p className="text-sm font-bold text-foreground">تعذّر تفعيل Stripe</p>
            <p>
              السبب: الدولة المختارة (الجزائر) غير مدعومة من Stripe لإنشاء حساب بائع
              <span className="font-mono text-[11px] mx-1">
                (the selected country is not supported by Stripe)
              </span>
              .
            </p>
          </div>
        </div>

        <div className="gradient-card rounded-xl border border-accent/30 p-4 mb-6">
          <div className="flex items-start gap-3 mb-3">
            <Info className="w-5 h-5 text-accent shrink-0 mt-0.5" />
            <div className="text-xs text-muted-foreground leading-relaxed">
              <p className="text-sm font-bold text-foreground mb-1">الحل المقترح: تفعيل Paddle</p>
              <p>
                Paddle يدعم البائعين من الجزائر ومناسب لاشتراكاتك الرقمية. يتولّى الضرائب
                والامتثال وإدارة الفوترة نيابةً عنك.
              </p>
            </div>
          </div>
          <ol className="text-xs text-muted-foreground space-y-1.5 list-decimal pr-5 mb-3">
            <li>اطلب من المساعد: «فعّل Paddle».</li>
            <li>املأ نموذج التفعيل (الاسم، البريد، اسم النشاط).</li>
            <li>سيتم إنشاء بيئة اختبار (sandbox) فورًا لتجربة الدفع بدون أموال حقيقية.</li>
            <li>لاحقًا: قدّم مستندات التحقق لتفعيل الدفع الحقيقي (قد يستغرق مراجعة إضافية).</li>
            <li>بعدها سيتم ربط هذه الصفحة بـ Paddle Customer Portal تلقائيًا.</li>
          </ol>
          <Link
            to="/contact"
            className="inline-flex items-center gap-2 text-xs font-bold text-accent hover:underline"
          >
            تحتاج مساعدة؟ تواصل مع الدعم
            <ArrowLeft className="w-3.5 h-3.5" />
          </Link>
        </div>

        {/* Current subscription */}
        <div className="gradient-card rounded-xl border border-border/30 p-5 mb-6">
          <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
            <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
              <Crown className="w-5 h-5 text-accent" />
              اشتراكك الحالي
              {isFetching && !isLoading && (
                <Clock className="w-3.5 h-3.5 text-muted-foreground animate-spin" />
              )}
            </h2>
            {statusBadge()}
          </div>

          {isLoading ? (
            <p className="text-sm text-muted-foreground">جاري التحميل...</p>
          ) : !subscription || status === "expired" ? (
            <div className="text-center py-6">
              <p className="text-sm text-muted-foreground mb-4">
                {status === "expired"
                  ? "انتهى اشتراكك. جدّد للوصول الكامل."
                  : "لا يوجد اشتراك نشط حاليًا"}
              </p>
              <Link
                to="/pricing"
                className="inline-flex items-center gap-2 bg-accent hover:bg-accent/90 text-accent-foreground text-sm font-bold px-5 py-2.5 rounded-full transition-all"
              >
                {status === "expired" ? "جدّد الآن" : "اشترك الآن"}
                <ArrowLeft className="w-4 h-4" />
              </Link>
            </div>
          ) : (() => {
            const pkg = subscription.packages;
            const totalDays = Math.max(
              1,
              Math.ceil(
                (new Date(subscription.expires_at).getTime() -
                  new Date(subscription.starts_at).getTime()) /
                  (1000 * 60 * 60 * 24),
              ),
            );
            const used = Math.max(0, totalDays - (daysLeft ?? 0));
            const progress = Math.min(100, Math.max(0, (used / totalDays) * 100));
            const price = pkg?.promo_price ?? pkg?.price ?? null;
            // Auto-renewal is currently unavailable: provider not yet activated
            const autoRenew = false;
            return (
              <div className="space-y-4">
                {/* Plan hero */}
                <div className="flex items-start justify-between gap-3 pb-4 border-b border-border/20">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <h3 className="text-xl font-bold text-foreground">
                        {pkg?.name_ar ?? "—"}
                      </h3>
                      {pkg?.is_golden && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-accent/15 text-accent">
                          <Sparkles className="w-3 h-3" />
                          GOLD
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {pkg?.duration_months
                        ? `لمدة ${pkg.duration_months} ${pkg.duration_months === 1 ? "شهر" : "أشهر"}`
                        : "—"}
                      {subscription.service_type && ` · ${subscription.service_type}`}
                    </p>
                  </div>
                  {price != null && (
                    <div className="text-left shrink-0">
                      <div className="text-lg font-bold text-foreground leading-none">
                        {price.toLocaleString("ar-DZ")}
                      </div>
                      <div className="text-[10px] text-muted-foreground mt-1">دج</div>
                    </div>
                  )}
                </div>

                {/* Renewal date — highlighted */}
                <div
                  className={`rounded-lg p-4 border ${
                    status === "expiring"
                      ? "bg-accent/10 border-accent/30"
                      : "bg-primary/5 border-primary/20"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-2">
                      <CalendarClock
                        className={`w-5 h-5 ${
                          status === "expiring" ? "text-accent" : "text-primary"
                        }`}
                      />
                      <div>
                        <p className="text-[11px] text-muted-foreground leading-tight">
                          تاريخ التجديد القادم
                        </p>
                        <p className="text-sm font-bold text-foreground mt-0.5">
                          {formatDate(subscription.expires_at)}
                        </p>
                      </div>
                    </div>
                    <span
                      className={`text-xs font-bold px-3 py-1.5 rounded-full ${
                        status === "expiring"
                          ? "bg-accent/20 text-accent"
                          : "bg-primary/15 text-primary"
                      }`}
                    >
                      متبقي {daysLeft} يوم
                    </span>
                  </div>

                  {/* Progress bar */}
                  <div className="mt-3">
                    <div
                      className="w-full h-1.5 rounded-full bg-muted overflow-hidden"
                      role="progressbar"
                      aria-valuenow={Math.round(progress)}
                      aria-valuemin={0}
                      aria-valuemax={100}
                    >
                      <div
                        className={`h-full transition-all ${
                          status === "expiring" ? "bg-accent" : "bg-primary"
                        }`}
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                    <div className="flex justify-between text-[10px] text-muted-foreground mt-1.5">
                      <span>{formatDate(subscription.starts_at)}</span>
                      <span>
                        {used} / {totalDays} يوم
                      </span>
                    </div>
                  </div>
                </div>

                {/* Auto-renewal status */}
                <div
                  className={`flex items-start gap-3 rounded-lg p-3 border ${
                    autoRenew
                      ? "bg-primary/5 border-primary/20"
                      : "bg-muted/40 border-border/30"
                  }`}
                >
                  <RefreshCw
                    className={`w-4 h-4 mt-0.5 shrink-0 ${
                      autoRenew ? "text-primary" : "text-muted-foreground"
                    }`}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <p className="text-sm font-bold text-foreground">
                        التجديد التلقائي
                      </p>
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                          autoRenew
                            ? "bg-primary/15 text-primary"
                            : "bg-muted text-muted-foreground"
                        }`}
                      >
                        {autoRenew ? "مُفعّل" : "غير مُفعّل"}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground leading-relaxed mt-1">
                      {autoRenew
                        ? "سيتم تجديد اشتراكك تلقائيًا في تاريخ التجديد القادم."
                        : "التجديد يدوي حاليًا — مزوّد الدفع غير مفعّل بعد. سنذكّرك قبل انتهاء الاشتراك لتجديده يدويًا."}
                    </p>
                  </div>
                </div>

                {/* Extra details */}
                <div className="grid grid-cols-2 gap-2 pt-1">
                  <div className="flex items-center gap-2 p-2.5 rounded-lg bg-background/40 border border-border/20">
                    <Calendar className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                    <div className="min-w-0">
                      <p className="text-[10px] text-muted-foreground leading-none">
                        بدأ في
                      </p>
                      <p className="text-xs font-medium text-foreground mt-1 truncate">
                        {formatDate(subscription.starts_at)}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 p-2.5 rounded-lg bg-background/40 border border-border/20">
                    <Globe2 className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                    <div className="min-w-0">
                      <p className="text-[10px] text-muted-foreground leading-none">
                        الدول
                      </p>
                      <p className="text-xs font-medium text-foreground mt-1 truncate">
                        {subscription.countries?.length
                          ? `${subscription.countries.length} / ${pkg?.max_countries ?? "—"}`
                          : `0 / ${pkg?.max_countries ?? "—"}`}
                      </p>
                    </div>
                  </div>
                </div>

                {status === "expiring" && (
                  <Link
                    to="/pricing"
                    className="inline-flex items-center justify-center gap-2 w-full bg-accent hover:bg-accent/90 text-accent-foreground text-sm font-bold px-5 py-2.5 rounded-full transition-all"
                  >
                    جدّد الآن
                    <ArrowLeft className="w-4 h-4" />
                  </Link>
                )}
              </div>
            );
          })()}
        </div>

        {/* Actions */}
        {subscription && status !== "expired" && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <button
              onClick={() => setUpdateConfirmOpen(true)}
              disabled={pendingAction !== null}
              className="gradient-card rounded-xl border border-border/30 p-4 text-right hover:border-primary/40 transition-all group disabled:opacity-60 disabled:cursor-not-allowed"
            >
              <div className="flex items-center gap-3 mb-2">
                <div className="w-10 h-10 rounded-lg bg-primary/15 flex items-center justify-center">
                  {pendingAction === "update" ? (
                    <Clock className="w-5 h-5 text-primary animate-spin" />
                  ) : (
                    <CreditCard className="w-5 h-5 text-primary" />
                  )}
                </div>
                <h3 className="text-sm font-bold text-foreground">
                  {pendingAction === "update" ? "جاري الفتح..." : "تحديث طريقة الدفع"}
                </h3>
              </div>
              <p className="text-xs text-muted-foreground">تغيير البطاقة أو وسيلة الدفع</p>
            </button>

            <button
              onClick={() => setCancelConfirmOpen(true)}
              disabled={pendingAction !== null}
              className="gradient-card rounded-xl border border-border/30 p-4 text-right hover:border-destructive/40 transition-all group disabled:opacity-60 disabled:cursor-not-allowed"
            >
              <div className="flex items-center gap-3 mb-2">
                <div className="w-10 h-10 rounded-lg bg-destructive/15 flex items-center justify-center">
                  {pendingAction === "cancel" ? (
                    <Clock className="w-5 h-5 text-destructive animate-spin" />
                  ) : (
                    <XCircle className="w-5 h-5 text-destructive" />
                  )}
                </div>
                <h3 className="text-sm font-bold text-foreground">
                  {pendingAction === "cancel" ? "جاري المعالجة..." : "إلغاء الاشتراك"}
                </h3>
              </div>
              <p className="text-xs text-muted-foreground">إيقاف التجديد التلقائي للاشتراك</p>
            </button>
          </div>
        )}

        <div className="mt-6 text-center">
          <Link to="/contact" className="text-xs text-primary hover:underline">
            تحتاج مساعدة؟ تواصل مع الدعم
          </Link>
        </div>

        {/* Invoices / Transactions */}
        <div className="gradient-card rounded-xl border border-border/30 p-5 mt-8">
          <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
            <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
              <FileText className="w-5 h-5 text-primary" />
              الفواتير والمعاملات
            </h2>
            <Link
              to="/my-requests"
              className="text-xs text-primary hover:underline inline-flex items-center gap-1"
            >
              عرض الكل
              <ArrowLeft className="w-3 h-3" />
            </Link>
          </div>

          {invoicesLoading ? (
            <p className="text-sm text-muted-foreground">جاري التحميل...</p>
          ) : invoices.length === 0 ? (
            <div className="text-center py-6">
              <FileText className="w-10 h-10 text-muted-foreground/40 mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">لا توجد فواتير بعد.</p>
            </div>
          ) : (
            <ul className="space-y-2">
              {invoices.map((inv) => {
                const statusMap: Record<string, { label: string; tone: string }> = {
                  approved: { label: "مدفوعة", tone: "bg-primary/15 text-primary" },
                  pending: { label: "قيد المراجعة", tone: "bg-accent/15 text-accent" },
                  rejected: { label: "مرفوضة", tone: "bg-destructive/15 text-destructive" },
                  cancelled: { label: "ملغاة", tone: "bg-muted text-muted-foreground" },
                };
                const st = statusMap[inv.status] ?? {
                  label: inv.status,
                  tone: "bg-muted text-muted-foreground",
                };
                const amount = inv.packages?.promo_price ?? inv.packages?.price ?? null;
                const isDownloading = downloadingId === inv.id;
                const ref = `INV-${inv.id.slice(0, 8).toUpperCase()}`;
                return (
                  <li
                    key={inv.id}
                    className="flex items-start gap-3 p-3 rounded-lg border border-border/20 bg-background/40"
                  >
                    <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                      <Receipt className="w-4.5 h-4.5 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2 flex-wrap mb-1">
                        <div className="min-w-0">
                          <p className="text-sm font-bold text-foreground truncate">
                            {inv.packages?.name_ar ?? "اشتراك"}
                            {inv.packages?.duration_months
                              ? ` · ${inv.packages.duration_months} ${
                                  inv.packages.duration_months === 1 ? "شهر" : "أشهر"
                                }`
                              : ""}
                          </p>
                          <p className="text-[11px] text-muted-foreground font-mono mt-0.5">
                            {ref}
                          </p>
                        </div>
                        <div className="text-left shrink-0">
                          {amount != null && (
                            <p className="text-sm font-bold text-foreground leading-none">
                              {amount.toLocaleString("ar-DZ")}{" "}
                              <span className="text-[10px] text-muted-foreground">دج</span>
                            </p>
                          )}
                          <span
                            className={`inline-block mt-1 text-[10px] font-bold px-2 py-0.5 rounded-full ${st.tone}`}
                          >
                            {st.label}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center justify-between gap-2 flex-wrap mt-2">
                        <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                          <Calendar className="w-3 h-3" />
                          <span>{formatDate(inv.created_at)}</span>
                          {inv.reviewed_at && (
                            <>
                              <span>·</span>
                              <span>روجعت: {formatDate(inv.reviewed_at)}</span>
                            </>
                          )}
                        </div>
                        {inv.receipt_url ? (
                          <button
                            type="button"
                            onClick={() => downloadReceipt(inv)}
                            disabled={isDownloading}
                            className="inline-flex items-center gap-1.5 text-[11px] font-bold text-primary hover:underline disabled:opacity-60 disabled:cursor-not-allowed"
                          >
                            {isDownloading ? (
                              <Clock className="w-3 h-3 animate-spin" />
                            ) : (
                              <Download className="w-3 h-3" />
                            )}
                            {isDownloading ? "جاري الفتح..." : "تحميل الإيصال"}
                            {!isDownloading && <ExternalLink className="w-3 h-3" />}
                          </button>
                        ) : (
                          <span className="text-[11px] text-muted-foreground">
                            لا يوجد إيصال مرفق
                          </span>
                        )}
                      </div>
                      {inv.status === "rejected" && inv.admin_notes && (
                        <p className="mt-2 text-[11px] text-destructive bg-destructive/10 rounded px-2 py-1 leading-relaxed">
                          {inv.admin_notes}
                        </p>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Payment events log */}
        <div className="gradient-card rounded-xl border border-border/30 p-5 mt-8">
          <h2 className="text-lg font-bold text-foreground flex items-center gap-2 mb-4">
            <History className="w-5 h-5 text-primary" />
            سجل أحداث الفوترة
          </h2>
          {eventsLoading ? (
            <p className="text-sm text-muted-foreground">جاري التحميل...</p>
          ) : events.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">
              لا توجد أحداث مسجّلة بعد.
            </p>
          ) : (
            <ul className="space-y-2">
              {events.map((ev) => {
                const tone =
                  ev.status === "success"
                    ? "bg-primary/15 text-primary"
                    : ev.status === "failed"
                    ? "bg-destructive/15 text-destructive"
                    : ev.status === "warning"
                    ? "bg-accent/15 text-accent"
                    : "bg-muted text-muted-foreground";
                return (
                  <li
                    key={ev.id}
                    className="flex items-start gap-3 p-3 rounded-lg border border-border/20 bg-background/40"
                  >
                    <div className="w-9 h-9 rounded-lg bg-muted/50 flex items-center justify-center shrink-0">
                      <Receipt className="w-4 h-4 text-muted-foreground" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2 flex-wrap mb-0.5">
                        <span className="text-sm font-bold text-foreground">{ev.event_type}</span>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${tone}`}>
                          {ev.status}
                        </span>
                      </div>
                      {ev.message && (
                        <p className="text-xs text-muted-foreground leading-relaxed mb-1">
                          {ev.message}
                        </p>
                      )}
                      <div className="flex items-center gap-3 text-[11px] text-muted-foreground flex-wrap">
                        <span>{new Date(ev.created_at).toLocaleString("ar-DZ")}</span>
                        {ev.amount != null && (
                          <span>
                            {ev.amount} {ev.currency ?? ""}
                          </span>
                        )}
                        {ev.provider && <span>· {ev.provider}</span>}
                        {ev.reference && <span className="font-mono">#{ev.reference}</span>}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>

      {(() => {
        const lastPaid = invoices.find((i) => i.status === "approved") ?? invoices[0] ?? null;
        const methodLabel = lastPaid?.receipt_url ? "CCP / BaridiMob (تحويل بنكي)" : "غير محدّدة";
        const methodRef = lastPaid ? `INV-${lastPaid.id.slice(0, 8).toUpperCase()}` : null;
        const methodDate = lastPaid ? formatDate(lastPaid.created_at) : null;
        return (
          <AlertDialog open={updateConfirmOpen} onOpenChange={setUpdateConfirmOpen}>
            <AlertDialogContent dir="rtl" className="text-right">
              <AlertDialogHeader>
                <AlertDialogTitle className="flex items-center gap-2 justify-start">
                  <CreditCard className="w-5 h-5 text-primary" />
                  تأكيد تحديث طريقة الدفع
                </AlertDialogTitle>
                <AlertDialogDescription className="text-right leading-relaxed">
                  سيتم فتح بوابة آمنة لتحديث طريقة الدفع الخاصة بك. لن يتم خصم أي مبلغ
                  الآن.
                </AlertDialogDescription>
              </AlertDialogHeader>

              <div className="rounded-lg border border-border/30 bg-background/40 p-3 my-2">
                <p className="text-[11px] text-muted-foreground mb-2">آخر طريقة دفع مستخدمة</p>
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-lg bg-primary/15 flex items-center justify-center shrink-0">
                    <CreditCard className="w-5 h-5 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-foreground">{methodLabel}</p>
                    <div className="flex items-center gap-2 text-[11px] text-muted-foreground mt-1 flex-wrap">
                      {methodDate && (
                        <span className="inline-flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          {methodDate}
                        </span>
                      )}
                      {methodRef && <span className="font-mono">· {methodRef}</span>}
                    </div>
                  </div>
                </div>
              </div>

              <AlertDialogFooter className="flex-row-reverse gap-2">
                <AlertDialogAction
                  onClick={() => {
                    setUpdateConfirmOpen(false);
                    notReady("update");
                  }}
                  className="bg-primary text-primary-foreground hover:bg-primary/90"
                >
                  نعم، تحديث الآن
                </AlertDialogAction>
                <AlertDialogCancel>تراجع</AlertDialogCancel>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        );
      })()}

      <AlertDialog open={cancelConfirmOpen} onOpenChange={setCancelConfirmOpen}>
        <AlertDialogContent dir="rtl" className="text-right">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 justify-start">
              <AlertTriangle className="w-5 h-5 text-destructive" />
              تأكيد إلغاء الاشتراك
            </AlertDialogTitle>
            <AlertDialogDescription className="text-right leading-relaxed">
              سيتم إيقاف التجديد التلقائي لاشتراكك. ستبقى ميزات اشتراكك متاحة حتى تاريخ
              الانتهاء الحالي
              {subscription?.expires_at && (
                <span className="font-bold text-foreground mx-1">
                  ({new Date(subscription.expires_at).toLocaleDateString("ar-DZ")})
                </span>
              )}
              ، وبعدها سيتم إيقاف التنبيهات.
            </AlertDialogDescription>
          </AlertDialogHeader>

          {/* Payments & refund summary */}
          <div className="space-y-2 my-2">
            <div className="rounded-lg border border-border/30 bg-background/40 p-3">
              <div className="flex items-start gap-2">
                <CreditCard className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="text-xs font-bold text-foreground mb-1">المدفوعات المتبقية</p>
                  <p className="text-[11px] text-muted-foreground leading-relaxed">
                    لا توجد دفعات مجدولة مستقبلية. التجديد التلقائي غير مفعّل حاليًا
                    (الدفع يدوي عبر CCP/BaridiMob)، لذلك لن يتم خصم أي مبلغ بعد الإلغاء.
                  </p>
                </div>
              </div>
            </div>

            <div
              className={`rounded-lg border p-3 ${
                status === "expiring"
                  ? "border-accent/30 bg-accent/5"
                  : "border-destructive/30 bg-destructive/5"
              }`}
            >
              <div className="flex items-start gap-2">
                <Info
                  className={`w-4 h-4 shrink-0 mt-0.5 ${
                    status === "expiring" ? "text-accent" : "text-destructive"
                  }`}
                />
                <div className="flex-1">
                  <p className="text-xs font-bold text-foreground mb-1">
                    {status === "expiring"
                      ? `لا يوجد استرجاع — ${daysLeft} يوم متبقّي فقط`
                      : `لا يوجد استرجاع للأيام المتبقية (${daysLeft ?? 0} يوم)`}
                  </p>
                  <p className="text-[11px] text-muted-foreground leading-relaxed">
                    وفقًا لسياسة الاسترجاع، المبالغ المدفوعة عن الفترة الحالية غير قابلة
                    للاسترداد بعد بدء الخدمة. يمكنك الاستفادة الكاملة من اشتراكك حتى
                    تاريخ الانتهاء.
                    {status !== "expiring" && (
                      <>
                        {" "}
                        لحالات استثنائية، تواصل مع الدعم خلال 7 أيام من تاريخ الدفع.
                      </>
                    )}
                  </p>
                </div>
              </div>
            </div>
          </div>

          <AlertDialogFooter className="flex-row-reverse gap-2">
            <AlertDialogAction
              onClick={() => {
                setCancelConfirmOpen(false);
                notReady("cancel");
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              نعم، إلغاء الاشتراك
            </AlertDialogAction>
            <AlertDialogCancel>تراجع</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Layout>
  );
}
