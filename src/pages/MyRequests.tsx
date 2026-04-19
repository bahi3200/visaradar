import Layout from "@/components/Layout";
import { motion } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import { Link } from "react-router-dom";
import { Clock, CheckCircle2, XCircle, Snowflake, ArrowRight, Package, MapPin, Calendar, AlertTriangle, RefreshCw, ArrowUpCircle, FileImage } from "lucide-react";
import { ReceiptImage } from "@/components/admin/ReceiptImage";

const statusConfig: Record<string, { text: string; icon: typeof Clock; cls: string; bgCls: string }> = {
  pending: { text: "قيد المراجعة", icon: Clock, cls: "text-yellow-400", bgCls: "bg-yellow-500/10 border-yellow-500/30" },
  approved: { text: "مقبول ✓", icon: CheckCircle2, cls: "text-green-400", bgCls: "bg-green-500/10 border-green-500/30" },
  rejected: { text: "مرفوض", icon: XCircle, cls: "text-red-400", bgCls: "bg-red-500/10 border-red-500/30" },
  frozen: { text: "مجمّد", icon: Snowflake, cls: "text-blue-400", bgCls: "bg-blue-500/10 border-blue-500/30" },
};

const countryFlags: Record<string, string> = { IT: "🇮🇹", FR: "🇫🇷", ES: "🇪🇸" };
const countryNames: Record<string, string> = { IT: "إيطاليا", FR: "فرنسا", ES: "إسبانيا" };

export default function MyRequestsPage() {
  const { user } = useAuth();
  const { isPrivileged } = useIsAdmin();

  const { data: requests, isLoading, refetch } = useQuery({
    queryKey: ["my-subscription-requests", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("subscription_requests")
        .select("*, packages(name_ar, duration_months, price)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  const { data: subscriptions } = useQuery({
    queryKey: ["my-subscriptions", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("subscriptions")
        .select("*, packages(name_ar, duration_months)")
        .eq("status", "active")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  return (
    <Layout>
      <div className="container py-10 max-w-2xl">
        <Link to="/dashboard" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-6">
          <ArrowRight className="w-4 h-4" />
          لوحة التحكم
        </Link>

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="font-heading text-2xl font-bold text-foreground">طلباتي واشتراكاتي</h1>
              <p className="text-sm text-muted-foreground">تتبع حالة طلبات الاشتراك والاشتراكات النشطة</p>
            </div>
            <button onClick={() => refetch()} className="p-2 rounded-lg bg-muted/50 hover:bg-muted transition-colors">
              <RefreshCw className="w-4 h-4 text-muted-foreground" />
            </button>
          </div>

          {/* Active Subscriptions */}
          {subscriptions && subscriptions.length > 0 && (
            <div className="mb-8">
              <h2 className="text-lg font-bold text-foreground mb-3 flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-green-400" />
                اشتراكات نشطة
              </h2>
              <div className="space-y-3">
                {subscriptions.map((sub: any) => (
                  <div key={sub.id} className="gradient-card rounded-xl border border-green-500/20 p-5">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <Package className="w-4 h-4 text-primary" />
                        <span className="font-bold text-foreground">{sub.packages?.name_ar}</span>
                      </div>
                      <span className="text-xs font-bold px-3 py-1 rounded-full bg-green-500/10 text-green-400 border border-green-500/30">
                        نشط
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <Calendar className="w-3.5 h-3.5" />
                        <span>من: {new Date(sub.starts_at).toLocaleDateString("ar")}</span>
                      </div>
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <Calendar className="w-3.5 h-3.5" />
                        <span>إلى: {new Date(sub.expires_at).toLocaleDateString("ar")}</span>
                      </div>
                    </div>
                    {sub.countries?.length > 0 && (
                      <div className="flex items-center gap-2 mt-2 text-sm text-muted-foreground">
                        <MapPin className="w-3.5 h-3.5" />
                        <span>{sub.countries.map((c: string) => `${countryFlags[c] || ""} ${countryNames[c] || c}`).join("، ")}</span>
                      </div>
                    )}
                    <div className="mt-3 flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">
                        نوع الخدمة: {sub.service_type === "visa" ? "تنبيهات الفيزا" : sub.service_type === "jobs" ? "عقود العمل" : "الباقة الشاملة"}
                      </span>
                      {!isPrivileged && (
                        <Link
                          to={`/subscribe?upgrade=true&service=${sub.service_type}`}
                          className="inline-flex items-center gap-1 text-xs font-bold text-accent hover:underline"
                        >
                          <ArrowUpCircle className="w-3.5 h-3.5" />
                          ترقية الباقة
                        </Link>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Requests */}
          <div>
            <h2 className="text-lg font-bold text-foreground mb-3 flex items-center gap-2">
              <Clock className="w-5 h-5 text-muted-foreground" />
              طلبات الاشتراك
            </h2>

            {isLoading ? (
              <div className="text-center py-10">
                <div className="w-8 h-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin mx-auto" />
              </div>
            ) : !requests || requests.length === 0 ? (
              <div className="gradient-card rounded-xl border border-border/50 p-8 text-center">
                <Package className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
                <p className="text-muted-foreground mb-4">لا توجد طلبات بعد</p>
                <Link to="/auth/register" className="gradient-primary text-primary-foreground font-bold px-6 py-2.5 rounded-xl text-sm">
                  اشترك الآن
                </Link>
              </div>
            ) : (
              <div className="space-y-3">
                {requests.map((req: any) => {
                  const st = statusConfig[req.status] || statusConfig.pending;
                  const StIcon = st.icon;
                  return (
                    <div key={req.id} className="gradient-card rounded-xl border border-border/50 p-5">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <Package className="w-4 h-4 text-primary" />
                          <span className="font-bold text-foreground">{req.packages?.name_ar || "باقة"}</span>
                        </div>
                        <span className={`text-xs font-bold px-3 py-1 rounded-full border flex items-center gap-1 ${st.bgCls}`}>
                          <StIcon className={`w-3 h-3 ${st.cls}`} />
                          <span className={st.cls}>{st.text}</span>
                        </span>
                      </div>

                      <div className="space-y-2 text-sm">
                        <div className="flex items-center justify-between text-muted-foreground">
                          <span>نوع الخدمة</span>
                          <span className="text-foreground">
                            {req.service_type === "visa" ? "تنبيهات الفيزا" : req.service_type === "jobs" ? "عقود العمل" : "الباقة الشاملة"}
                          </span>
                        </div>
                        {req.packages?.price && (
                          <div className="flex items-center justify-between text-muted-foreground">
                            <span>المبلغ</span>
                            <span className="text-foreground font-medium">{req.packages.price} د.ج</span>
                          </div>
                        )}
                        <div className="flex items-center justify-between text-muted-foreground">
                          <span>تاريخ الطلب</span>
                          <span className="text-foreground">{new Date(req.created_at).toLocaleDateString("ar")}</span>
                        </div>
                        {req.countries?.length > 0 && (
                          <div className="flex items-center justify-between text-muted-foreground">
                            <span>الدول</span>
                            <span>{req.countries.map((c: string) => `${countryFlags[c] || ""} ${countryNames[c] || c}`).join("، ")}</span>
                          </div>
                        )}
                      </div>

                      {req.receipt_url && (
                        <div className="mt-3">
                          <p className="text-sm font-medium text-foreground mb-2 flex items-center gap-1">
                            <FileImage className="w-4 h-4 text-primary" />
                            وصل الدفع CCP
                          </p>
                          <ReceiptImage receiptUrl={req.receipt_url} />
                        </div>
                      )}

                      {req.ai_fraud_detected && (
                        <p className="text-xs text-destructive flex items-center gap-1 mt-3 bg-destructive/10 rounded-lg px-3 py-2">
                          <AlertTriangle className="w-3.5 h-3.5" />
                          تم اكتشاف مشكلة في الوصل — قيد المراجعة اليدوية
                        </p>
                      )}

                      {req.admin_notes && (
                        <p className="text-xs text-muted-foreground mt-3 bg-muted/30 rounded-lg px-3 py-2">
                          ملاحظة الإدارة: {req.admin_notes}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </motion.div>
      </div>
    </Layout>
  );
}
