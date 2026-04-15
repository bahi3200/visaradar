import AdminLayout from "@/components/AdminLayout";
import { motion, AnimatePresence } from "framer-motion";
import {
  Check, X, Snowflake, RotateCcw, Eye, AlertTriangle, Shield, ArrowRight, Search,
  ChevronDown, FileImage, Brain, Monitor, Trash2
} from "lucide-react";
import { useState } from "react";
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
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";

const statusFilters = [
  { value: "all", label: "الكل" },
  { value: "pending", label: "قيد المراجعة" },
  { value: "approved", label: "مقبول" },
  { value: "rejected", label: "مرفوض" },
  { value: "frozen", label: "مجمّد" },
];

const statusConfig: Record<string, { text: string; cls: string; icon: any }> = {
  pending: { text: "قيد المراجعة", cls: "bg-yellow-500/10 text-yellow-400 border-yellow-500/30", icon: Search },
  approved: { text: "مقبول", cls: "bg-green-500/10 text-green-400 border-green-500/30", icon: Check },
  rejected: { text: "مرفوض", cls: "bg-red-500/10 text-red-400 border-red-500/30", icon: X },
  frozen: { text: "مجمّد", cls: "bg-blue-500/10 text-blue-400 border-blue-500/30", icon: Snowflake },
};

const countryNames: Record<string, { flag: string; name: string }> = {
  IT: { flag: "🇮🇹", name: "إيطاليا" },
  FR: { flag: "🇫🇷", name: "فرنسا" },
  ES: { flag: "🇪🇸", name: "إسبانيا" },
};

export default function AdminRequestsPage() {
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [adminNotes, setAdminNotes] = useState<Record<string, string>>({});
  const [processing, setProcessing] = useState<string | null>(null);
  const [deviceCounts, setDeviceCounts] = useState<Record<string, number>>({});
  const [deleteTarget, setDeleteTarget] = useState<any | null>(null);

  const { data: requests, isLoading } = useQuery({
    queryKey: ["admin-requests", statusFilter],
    queryFn: async () => {
      let query = supabase
        .from("subscription_requests")
        .select("*, packages(name_ar, duration_months, price)")
        .order("created_at", { ascending: false });

      if (statusFilter !== "all") {
        query = query.eq("status", statusFilter);
      }

      const { data, error } = await query;
      if (error) throw error;

      // Fetch device counts for each unique user
      if (data) {
        const userIds = [...new Set(data.map((r: any) => r.user_id))];
        const counts: Record<string, number> = {};
        for (const uid of userIds) {
          const { data: devs } = await supabase
            .from('user_devices')
            .select('id')
            .eq('user_id', uid as string)
            .eq('is_active', true);
          counts[uid as string] = devs?.length || 0;
        }
        setDeviceCounts(counts);
      }

      return data;
    },
  });

  const updateStatus = async (id: string, status: string) => {
    setProcessing(id);
    try {
      const { data: { user } } = await supabase.auth.getUser();

      const updateData: any = {
        status,
        reviewed_by: user?.id,
        reviewed_at: new Date().toISOString(),
      };
      if (adminNotes[id]) updateData.admin_notes = adminNotes[id];

      // If approving, create the subscription
      if (status === 'approved') {
        const request = requests?.find((r: any) => r.id === id);
        if (request) {
          const months = request.packages?.duration_months || 3;
          const isUpgradeRequest = request.admin_notes?.includes('ترقية');

          // New subscription starts from today
          const expiresAt = new Date();
          expiresAt.setMonth(expiresAt.getMonth() + months);

          await supabase.from('subscriptions').insert({
            user_id: request.user_id,
            package_id: request.package_id,
            countries: request.countries,
            telegram_chat_id: request.telegram_chat_id,
            service_type: request.service_type || 'both',
            expires_at: expiresAt.toISOString(),
          });

          if (isUpgradeRequest) {
            toast.info(`تمت ترقية اشتراك ${request.full_name} — الاشتراك القديم يبقى نشطاً`);
          }
        }
      }

      const { error } = await supabase
        .from("subscription_requests")
        .update(updateData)
        .eq("id", id);

      if (error) throw error;

      // Send Telegram notification to user
      if (status === 'approved' || status === 'rejected' || status === 'frozen') {
        try {
          await supabase.functions.invoke('notify-subscription-status', {
            body: { requestId: id, status, adminNotes: adminNotes[id] || '' },
          });
        } catch (notifErr) {
          console.error('Failed to send Telegram notification:', notifErr);
        }
      }

      const actionText = { approved: "قبول", rejected: "رفض", frozen: "تجميد", pending: "إعادة تفعيل" }[status];
      toast.success(`تم ${actionText} الطلب بنجاح`);
      queryClient.invalidateQueries({ queryKey: ["admin-requests"] });
    } catch (err: any) {
      toast.error(err.message || "حدث خطأ");
    } finally {
      setProcessing(null);
    }
  };

  const retriggerAI = async (id: string, receiptUrl: string) => {
    setProcessing(id);
    try {
      const { data, error } = await supabase.functions.invoke("verify-receipt", {
        body: { requestId: id, receiptUrl },
      });
      if (error) throw error;
      toast.success("تم إعادة فحص الوصل بالذكاء الاصطناعي");
      queryClient.invalidateQueries({ queryKey: ["admin-requests"] });
    } catch (err: any) {
      toast.error(err.message || "فشل الفحص");
    } finally {
      setProcessing(null);
    }
  };

  const handleDeleteSubscriber = async () => {
    if (!deleteTarget) return;
    setProcessing(deleteTarget.id);
    try {
      // Delete related subscription(s) first
      await supabase
        .from('subscriptions')
        .delete()
        .eq('user_id', deleteTarget.user_id);

      // Delete the request
      const { error } = await supabase
        .from('subscription_requests')
        .delete()
        .eq('id', deleteTarget.id);

      if (error) throw error;

      // Notify via Telegram
      if (deleteTarget.telegram_chat_id) {
        try {
          await supabase.functions.invoke('notify-subscription-status', {
            body: { requestId: deleteTarget.id, status: 'rejected', adminNotes: 'تم حذف اشتراكك بالكامل من المنصة.' },
          });
        } catch (e) {
          console.error('Telegram notify failed:', e);
        }
      }

      toast.success(`تم حذف المشترك "${deleteTarget.full_name}" بالكامل`);
      queryClient.invalidateQueries({ queryKey: ["admin-requests"] });
    } catch (err: any) {
      toast.error(err.message || "حدث خطأ أثناء الحذف");
    } finally {
      setProcessing(null);
      setDeleteTarget(null);
    }
  };

  return (
    <AdminLayout title="طلبات الاشتراك" subtitle="مراجعة وإدارة طلبات المشتركين">
      <div className="max-w-4xl">

        {/* Status Filters */}
        <div className="flex gap-2 mb-6 flex-wrap">
          {statusFilters.map((f) => (
            <button
              key={f.value}
              onClick={() => setStatusFilter(f.value)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                statusFilter === f.value
                  ? "gradient-primary text-primary-foreground"
                  : "border border-border/50 text-muted-foreground hover:text-foreground"
              }`}
            >
              {f.label}
              {f.value !== "all" && requests && (
                <span className="mr-1 text-xs opacity-70">
                  ({requests.filter((r: any) => r.status === f.value).length})
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Fraud Alert Banner */}
        {requests?.some((r: any) => r.ai_fraud_detected && r.status === 'pending') && (
          <div className="mb-6 p-4 rounded-xl bg-destructive/10 border border-destructive/30 flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 text-destructive shrink-0" />
            <p className="text-sm text-destructive">
              ⚠️ يوجد طلبات تم اكتشاف تزوير محتمل في وصولاتها - يرجى المراجعة
            </p>
          </div>
        )}

        {/* Requests List */}
        {isLoading ? (
          <div className="text-center py-10 text-muted-foreground animate-pulse">جاري التحميل...</div>
        ) : !requests?.length ? (
          <div className="text-center py-10 text-muted-foreground">لا توجد طلبات</div>
        ) : (
          <div className="space-y-4">
            {requests.map((req: any) => {
              const st = statusConfig[req.status] || statusConfig.pending;
              const isExpanded = expandedId === req.id;
              const ai = req.ai_verification_result;

              return (
                <motion.div
                  key={req.id}
                  layout
                  className={`gradient-card rounded-2xl border shadow-card overflow-hidden ${
                    req.ai_fraud_detected ? "border-destructive/40" : "border-border/50"
                  }`}
                >
                  {/* Header */}
                  <button
                    onClick={() => setExpandedId(isExpanded ? null : req.id)}
                    className="w-full p-5 flex items-center justify-between text-right"
                  >
                    <div className="flex items-center gap-3">
                      {req.admin_notes?.includes('ترقية') && (
                        <span className="flex items-center gap-1 text-xs bg-accent/10 text-accent border border-accent/30 px-2 py-0.5 rounded-full">
                          <ArrowRight className="w-3 h-3 rotate-180" />
                          ترقية
                        </span>
                      )}
                      {req.ai_fraud_detected && <AlertTriangle className="w-5 h-5 text-destructive" />}
                      {(deviceCounts[req.user_id] || 0) > 1 && (
                        <span className="flex items-center gap-1 text-xs bg-yellow-500/10 text-yellow-400 border border-yellow-500/30 px-2 py-0.5 rounded-full">
                          <Monitor className="w-3 h-3" />
                          {deviceCounts[req.user_id]} أجهزة
                        </span>
                      )}
                      <div>
                        <p className="font-bold text-foreground">{req.full_name}</p>
                        <p className="text-xs text-muted-foreground">
                          {req.packages?.name_ar} • {req.countries?.map((c: string) => countryNames[c]?.flag).join(" ")} •{" "}
                          {new Date(req.created_at).toLocaleDateString("ar")}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`text-xs font-bold px-3 py-1 rounded-full border ${st.cls}`}>{st.text}</span>
                      <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${isExpanded ? "rotate-180" : ""}`} />
                    </div>
                  </button>

                  {/* Expanded Details */}
                  <AnimatePresence>
                    {isExpanded && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="overflow-hidden"
                      >
                        <div className="px-5 pb-5 space-y-4 border-t border-border/30 pt-4">
                          {/* Info Grid */}
                          <div className="grid grid-cols-2 gap-3 text-sm">
                            <div>
                              <span className="text-muted-foreground">الهاتف:</span>
                              <span className="text-foreground mr-2">{req.phone || "—"}</span>
                            </div>
                            <div>
                              <span className="text-muted-foreground">البريد:</span>
                              <span className="text-foreground mr-2">{req.email || "—"}</span>
                            </div>
                            <div>
                              <span className="text-muted-foreground">تليغرام:</span>
                              <span className="text-foreground mr-2">{req.telegram_chat_id || "—"}</span>
                            </div>
                            <div>
                              <span className="text-muted-foreground">السعر:</span>
                              <span className="text-foreground mr-2">{req.packages?.price ? `${req.packages.price} د.م` : "—"}</span>
                            </div>
                          </div>

                          {/* Receipt */}
                          {req.receipt_url && (
                            <div>
                              <p className="text-sm font-medium text-foreground mb-2 flex items-center gap-1">
                                <FileImage className="w-4 h-4 text-primary" />
                                وصل الدفع CCP
                              </p>
                              <a href={req.receipt_url} target="_blank" rel="noopener noreferrer">
                                <img src={req.receipt_url} alt="Receipt" className="max-h-56 rounded-xl border border-border/50 hover:opacity-90 transition-opacity" />
                              </a>
                            </div>
                          )}

                          {/* AI Verification */}
                          {ai && (
                            <div className={`rounded-xl p-4 border ${req.ai_fraud_detected ? "bg-destructive/5 border-destructive/30" : "bg-green-500/5 border-green-500/30"}`}>
                              <p className="text-sm font-bold text-foreground mb-2 flex items-center gap-2">
                                <Brain className="w-4 h-4" />
                                نتيجة فحص الذكاء الاصطناعي
                              </p>
                              <div className="grid grid-cols-2 gap-2 text-xs mb-2">
                                <div>
                                  <span className="text-muted-foreground">التوصية:</span>
                                  <span className={`mr-1 font-bold ${
                                    ai.recommendation === 'approve' ? 'text-green-400' :
                                    ai.recommendation === 'reject' ? 'text-red-400' : 'text-yellow-400'
                                  }`}>
                                    {ai.recommendation === 'approve' ? 'موافقة' : ai.recommendation === 'reject' ? 'رفض' : 'مراجعة'}
                                  </span>
                                </div>
                                <div>
                                  <span className="text-muted-foreground">الثقة:</span>
                                  <span className="text-foreground mr-1">{ai.confidence}%</span>
                                </div>
                                {ai.amount_detected && (
                                  <div>
                                    <span className="text-muted-foreground">المبلغ:</span>
                                    <span className="text-foreground mr-1">{ai.amount_detected}</span>
                                  </div>
                                )}
                                {ai.date_detected && (
                                  <div>
                                    <span className="text-muted-foreground">التاريخ:</span>
                                    <span className="text-foreground mr-1">{ai.date_detected}</span>
                                  </div>
                                )}
                              </div>
                              {ai.analysis_summary_ar && (
                                <p className="text-xs text-muted-foreground">{ai.analysis_summary_ar}</p>
                              )}
                              {ai.fraud_indicators?.length > 0 && (
                                <div className="mt-2">
                                  <p className="text-xs font-medium text-destructive">مؤشرات مشبوهة:</p>
                                  <ul className="text-xs text-destructive/80 list-disc pr-4 mt-1">
                                    {ai.fraud_indicators.map((f: string, i: number) => (
                                      <li key={i}>{f}</li>
                                    ))}
                                  </ul>
                                </div>
                              )}
                            </div>
                          )}

                          {/* Re-verify button */}
                          {req.receipt_url && (
                            <button
                              onClick={() => retriggerAI(req.id, req.receipt_url)}
                              disabled={processing === req.id}
                              className="text-xs text-primary hover:underline flex items-center gap-1"
                            >
                              <Brain className="w-3.5 h-3.5" />
                              إعادة فحص الوصل بالذكاء الاصطناعي
                            </button>
                          )}

                          {/* Admin Notes */}
                          <div>
                            <label className="text-sm font-medium text-foreground mb-1 block">ملاحظات الأدمن</label>
                            <textarea
                              value={adminNotes[req.id] ?? req.admin_notes ?? ""}
                              onChange={(e) => setAdminNotes({ ...adminNotes, [req.id]: e.target.value })}
                              rows={2}
                              placeholder="أضف ملاحظة..."
                              className="w-full rounded-xl border border-border/50 bg-secondary/30 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none"
                            />
                          </div>

                          {/* Action Buttons */}
                          <div className="flex flex-wrap gap-2">
                            {req.status !== "approved" && (
                              <button
                                onClick={() => updateStatus(req.id, "approved")}
                                disabled={processing === req.id}
                                className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-green-500/10 border border-green-500/30 text-green-400 text-sm font-medium hover:bg-green-500/20 transition-colors disabled:opacity-50"
                              >
                                <Check className="w-4 h-4" />
                                قبول
                              </button>
                            )}
                            {req.status !== "rejected" && (
                              <button
                                onClick={() => updateStatus(req.id, "rejected")}
                                disabled={processing === req.id}
                                className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-sm font-medium hover:bg-red-500/20 transition-colors disabled:opacity-50"
                              >
                                <X className="w-4 h-4" />
                                رفض
                              </button>
                            )}
                            {req.status !== "frozen" && req.status === "approved" && (
                              <button
                                onClick={() => updateStatus(req.id, "frozen")}
                                disabled={processing === req.id}
                                className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-500/10 border border-blue-500/30 text-blue-400 text-sm font-medium hover:bg-blue-500/20 transition-colors disabled:opacity-50"
                              >
                                <Snowflake className="w-4 h-4" />
                                تجميد
                              </button>
                            )}
                            {(req.status === "frozen" || req.status === "rejected") && (
                              <button
                                onClick={() => updateStatus(req.id, "pending")}
                                disabled={processing === req.id}
                                className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-yellow-500/10 border border-yellow-500/30 text-yellow-400 text-sm font-medium hover:bg-yellow-500/20 transition-colors disabled:opacity-50"
                              >
                                <RotateCcw className="w-4 h-4" />
                                إعادة تفعيل
                              </button>
                            )}
                            {/* Delete button */}
                            <button
                              onClick={() => setDeleteTarget(req)}
                              disabled={processing === req.id}
                              className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-destructive/10 border border-destructive/30 text-destructive text-sm font-medium hover:bg-destructive/20 transition-colors disabled:opacity-50 mr-auto"
                            >
                              <Trash2 className="w-4 h-4" />
                              حذف نهائي
                            </button>
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              );
            })}
          </div>
        )}
      </div>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent className="gradient-card border-destructive/30">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-foreground flex items-center gap-2">
              <Trash2 className="w-5 h-5 text-destructive" />
              تأكيد الحذف النهائي
            </AlertDialogTitle>
            <AlertDialogDescription className="text-muted-foreground text-right leading-relaxed">
              هل أنت متأكد من حذف المشترك <strong className="text-foreground">{deleteTarget?.full_name}</strong> نهائياً؟
              <br />
              <span className="text-destructive text-xs mt-2 block">
                ⚠️ سيتم حذف طلب الاشتراك وجميع الاشتراكات المرتبطة به بشكل دائم ولا يمكن التراجع عن هذا الإجراء.
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex gap-2 sm:gap-2">
            <AlertDialogCancel className="rounded-xl border-border/50">إلغاء</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteSubscriber}
              className="rounded-xl bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              <Trash2 className="w-4 h-4 ml-1" />
              حذف نهائي
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AdminLayout>
  );
}
