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

  const notReady = (action: "update" | "cancel") => {
    setPendingAction(action);
    // Simulate a brief loading state, then show the "coming soon" toast
    window.setTimeout(() => {
      setPendingAction(null);
      toast({
        title: "قريبًا",
        description:
          action === "update"
            ? "تحديث طريقة الدفع الآلي قيد الإعداد. تواصل مع الدعم لتعديل وسيلة الدفع حاليًا."
            : "إلغاء الاشتراك الذاتي قيد الإعداد. تواصل مع الدعم لإلغاء اشتراكك حاليًا.",
      });
    }, 700);
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
          ) : (
            <div className="space-y-3">
              <div className="flex justify-between items-center pb-3 border-b border-border/20">
                <span className="text-sm text-muted-foreground">الباقة</span>
                <span className="text-sm font-bold text-foreground">
                  {subscription.packages?.name_ar ?? "—"}
                </span>
              </div>
              <div className="flex justify-between items-center pb-3 border-b border-border/20">
                <span className="text-sm text-muted-foreground flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 text-primary" />
                  تاريخ البدء
                </span>
                <span className="text-sm font-medium text-foreground">
                  {formatDate(subscription.starts_at)}
                </span>
              </div>
              <div className="flex justify-between items-center pb-3 border-b border-border/20">
                <span className="text-sm text-muted-foreground flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 text-destructive" />
                  ينتهي في
                </span>
                <span className="text-sm font-medium text-foreground">
                  {formatDate(subscription.expires_at)}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">الأيام المتبقية</span>
                <span
                  className={`text-sm font-bold ${
                    status === "expiring" ? "text-accent" : "text-foreground"
                  }`}
                >
                  {daysLeft} يوم
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Actions */}
        {subscription && status !== "expired" && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <button
              onClick={() => notReady("update")}
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
              ، وبعدها سيتم إيقاف التنبيهات. هل أنت متأكد؟
            </AlertDialogDescription>
          </AlertDialogHeader>
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
