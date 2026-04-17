import AdminLayout from "@/components/AdminLayout";
import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { Mail, MessageCircle, Loader2, RefreshCw, Search, Filter, Calendar, User as UserIcon, AlertCircle, CheckCircle2, MinusCircle } from "lucide-react";
import { toast } from "sonner";

type ReminderRow = {
  id: string;
  user_id: string;
  subscription_id: string;
  package_name: string | null;
  recipient_name: string | null;
  recipient_email: string | null;
  telegram_chat_id: string | null;
  milestone_days: number;
  days_left: number;
  expires_at: string;
  email_status: string;
  email_error: string | null;
  telegram_status: string;
  telegram_error: string | null;
  created_at: string;
};

type StatusFilter = "all" | "sent" | "failed";
type ChannelFilter = "all" | "email" | "telegram";

function StatusBadge({ status }: { status: string }) {
  if (status === "sent") {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-500 text-[11px] font-bold">
        <CheckCircle2 className="w-3 h-3" /> أُرسل
      </span>
    );
  }
  if (status === "failed") {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-destructive/15 text-destructive text-[11px] font-bold">
        <AlertCircle className="w-3 h-3" /> فشل
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-muted text-muted-foreground text-[11px] font-medium">
      <MinusCircle className="w-3 h-3" /> متخطى
    </span>
  );
}

export default function ExpiryReminderLogPage() {
  const [rows, setRows] = useState<ReminderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [milestoneFilter, setMilestoneFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [channelFilter, setChannelFilter] = useState<ChannelFilter>("all");

  const fetchRows = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("expiry_reminder_log")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) {
      toast.error("فشل تحميل السجل");
    } else {
      setRows((data || []) as ReminderRow[]);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchRows();
  }, []);

  const milestones = useMemo(() => {
    const set = new Set<number>();
    rows.forEach((r) => set.add(r.milestone_days));
    return Array.from(set).sort((a, b) => b - a);
  }, [rows]);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (milestoneFilter !== "all" && String(r.milestone_days) !== milestoneFilter) return false;
      if (channelFilter === "email" && r.email_status === "skipped") return false;
      if (channelFilter === "telegram" && r.telegram_status === "skipped") return false;
      if (statusFilter === "sent" && r.email_status !== "sent" && r.telegram_status !== "sent") return false;
      if (statusFilter === "failed" && r.email_status !== "failed" && r.telegram_status !== "failed") return false;
      if (search) {
        const q = search.toLowerCase();
        const hay = [r.recipient_name, r.recipient_email, r.telegram_chat_id, r.package_name].filter(Boolean).join(" ").toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [rows, milestoneFilter, statusFilter, channelFilter, search]);

  const stats = useMemo(() => {
    const total = rows.length;
    const emailSent = rows.filter((r) => r.email_status === "sent").length;
    const telegramSent = rows.filter((r) => r.telegram_status === "sent").length;
    const failed = rows.filter((r) => r.email_status === "failed" || r.telegram_status === "failed").length;
    return { total, emailSent, telegramSent, failed };
  }, [rows]);

  return (
    <AdminLayout title="سجل تذكيرات التجديد" subtitle="جميع التذكيرات المرسلة قبل انتهاء الاشتراك">
      <div className="space-y-6">
        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="gradient-card border border-border/40 rounded-2xl p-4">
            <p className="text-xs text-muted-foreground mb-1">إجمالي التذكيرات</p>
            <p className="font-heading text-2xl font-bold text-foreground">{stats.total}</p>
          </motion.div>
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }} className="gradient-card border border-border/40 rounded-2xl p-4">
            <p className="text-xs text-muted-foreground mb-1 flex items-center gap-1.5"><Mail className="w-3 h-3" /> بريد مُرسل</p>
            <p className="font-heading text-2xl font-bold text-emerald-500">{stats.emailSent}</p>
          </motion.div>
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="gradient-card border border-border/40 rounded-2xl p-4">
            <p className="text-xs text-muted-foreground mb-1 flex items-center gap-1.5"><MessageCircle className="w-3 h-3" /> Telegram مُرسل</p>
            <p className="font-heading text-2xl font-bold text-sky-500">{stats.telegramSent}</p>
          </motion.div>
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }} className="gradient-card border border-border/40 rounded-2xl p-4">
            <p className="text-xs text-muted-foreground mb-1 flex items-center gap-1.5"><AlertCircle className="w-3 h-3" /> فاشلة</p>
            <p className="font-heading text-2xl font-bold text-destructive">{stats.failed}</p>
          </motion.div>
        </div>

        {/* Filters */}
        <div className="gradient-card border border-border/40 rounded-2xl p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-primary" />
            <span className="font-bold text-sm text-foreground">عوامل التصفية</span>
            <button
              onClick={fetchRows}
              className="mr-auto inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-border/50 hover:bg-muted/50 transition-colors"
            >
              <RefreshCw className="w-3.5 h-3.5" /> تحديث
            </button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <div className="md:col-span-2 relative">
              <Search className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="بحث بالاسم، البريد، Telegram، الباقة..."
                className="w-full rounded-xl border border-border/50 bg-secondary/30 pr-9 pl-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
            </div>
            <select
              value={milestoneFilter}
              onChange={(e) => setMilestoneFilter(e.target.value)}
              className="rounded-xl border border-border/50 bg-secondary/30 px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
            >
              <option value="all">كل المراحل</option>
              {milestones.map((m) => (
                <option key={m} value={String(m)}>D-{m}</option>
              ))}
            </select>
            <div className="flex gap-2">
              <select
                value={channelFilter}
                onChange={(e) => setChannelFilter(e.target.value as ChannelFilter)}
                className="flex-1 rounded-xl border border-border/50 bg-secondary/30 px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
              >
                <option value="all">كل القنوات</option>
                <option value="email">البريد فقط</option>
                <option value="telegram">Telegram فقط</option>
              </select>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
                className="flex-1 rounded-xl border border-border/50 bg-secondary/30 px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
              >
                <option value="all">كل الحالات</option>
                <option value="sent">ناجحة</option>
                <option value="failed">فاشلة</option>
              </select>
            </div>
          </div>
        </div>

        {/* List */}
        {loading ? (
          <div className="flex items-center justify-center py-20 text-muted-foreground">
            <Loader2 className="w-6 h-6 animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-20 text-muted-foreground">
            <Mail className="w-12 h-12 mx-auto mb-3 opacity-40" />
            <p className="text-sm">لا توجد تذكيرات تطابق التصفية الحالية</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map((r, idx) => (
              <motion.div
                key={r.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: Math.min(idx * 0.02, 0.3) }}
                className="gradient-card border border-border/40 rounded-2xl p-4 space-y-3"
              >
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                      <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold ${r.milestone_days <= 1 ? "bg-destructive/15 text-destructive" : r.milestone_days <= 3 ? "bg-orange-500/15 text-orange-500" : "bg-yellow-500/15 text-yellow-600"}`}>
                        D-{r.milestone_days}
                      </span>
                      {r.package_name && (
                        <span className="text-[11px] px-2 py-0.5 rounded-full bg-primary/10 text-primary font-medium">
                          {r.package_name}
                        </span>
                      )}
                    </div>
                    <p className="text-sm font-bold text-foreground flex items-center gap-1.5">
                      <UserIcon className="w-3.5 h-3.5 text-muted-foreground" />
                      {r.recipient_name || "بدون اسم"}
                    </p>
                    {r.recipient_email && (
                      <p className="text-xs text-muted-foreground mt-0.5" dir="ltr">{r.recipient_email}</p>
                    )}
                  </div>
                  <div className="text-left text-[11px] text-muted-foreground space-y-0.5 shrink-0">
                    <p className="flex items-center gap-1 justify-end">
                      <Calendar className="w-3 h-3" />
                      أُرسل: {new Date(r.created_at).toLocaleString("ar", { dateStyle: "short", timeStyle: "short" })}
                    </p>
                    <p>تنتهي: {new Date(r.expires_at).toLocaleDateString("ar", { dateStyle: "medium" })}</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-2 pt-3 border-t border-border/30">
                  <div className="rounded-lg bg-secondary/30 px-3 py-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[11px] font-bold text-foreground flex items-center gap-1.5">
                        <Mail className="w-3.5 h-3.5" /> البريد
                      </span>
                      <StatusBadge status={r.email_status} />
                    </div>
                    {r.email_error && (
                      <p className="text-[10px] text-destructive mt-1 truncate" title={r.email_error}>{r.email_error}</p>
                    )}
                  </div>
                  <div className="rounded-lg bg-secondary/30 px-3 py-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[11px] font-bold text-foreground flex items-center gap-1.5">
                        <MessageCircle className="w-3.5 h-3.5" /> Telegram
                      </span>
                      <StatusBadge status={r.telegram_status} />
                    </div>
                    {r.telegram_chat_id && r.telegram_status !== "skipped" && (
                      <p className="text-[10px] text-muted-foreground mt-1" dir="ltr">chat: {r.telegram_chat_id}</p>
                    )}
                    {r.telegram_error && (
                      <p className="text-[10px] text-destructive mt-1 truncate" title={r.telegram_error}>{r.telegram_error}</p>
                    )}
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
