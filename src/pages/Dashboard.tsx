import AdminLayout from "@/components/AdminLayout";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import {
  User, Mail, Phone, Globe, Monitor, Smartphone, AlertTriangle, X,
  Users, Clock, ClipboardList, UserCheck, TrendingUp, Briefcase, Bell, Crown, ArrowLeft, BarChart3, Download
} from "lucide-react";
import { toast } from "sonner";
import { useDeviceCheck, useMyDevices } from "@/hooks/useDeviceCheck";
import { useAuth } from "@/hooks/useAuth";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import Layout from "@/components/Layout";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line, CartesianGrid } from "recharts";

export default function DashboardPage() {
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const { result: deviceCheck, loading: deviceLoading } = useDeviceCheck();
  const { devices, deactivateDevice } = useMyDevices();

  const { data: stats } = useQuery({
    queryKey: ["admin-stats"],
    queryFn: async () => {
      const [subsRes, pendingRes, activeSubsRes] = await Promise.all([
        supabase.from("subscription_requests").select("id", { count: "exact", head: true }),
        supabase.from("subscription_requests").select("id", { count: "exact", head: true }).eq("status", "pending"),
        supabase.from("subscriptions").select("id", { count: "exact", head: true }).eq("status", "active"),
      ]);
      return {
        totalRequests: subsRes.count || 0,
        pendingRequests: pendingRes.count || 0,
        activeSubscriptions: activeSubsRes.count || 0,
      };
    },
    enabled: !!user,
  });

  // Charts data
  const { data: chartData } = useQuery({
    queryKey: ["admin-charts"],
    queryFn: async () => {
      const [requestsRes, subsRes] = await Promise.all([
        supabase.from("subscription_requests").select("created_at, status"),
        supabase.from("subscriptions").select("created_at, status, packages(name_ar)"),
      ]);

      const requests = requestsRes.data || [];
      const subs = subsRes.data || [];

      // Monthly requests trend (last 6 months)
      const monthlyMap = new Map<string, { approved: number; rejected: number; pending: number }>();
      const now = new Date();
      for (let i = 5; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const key = d.toLocaleDateString("ar", { month: "short", year: "2-digit" });
        monthlyMap.set(key, { approved: 0, rejected: 0, pending: 0 });
      }
      requests.forEach((r) => {
        const d = new Date(r.created_at);
        const key = d.toLocaleDateString("ar", { month: "short", year: "2-digit" });
        if (monthlyMap.has(key)) {
          const entry = monthlyMap.get(key)!;
          if (r.status === "approved") entry.approved++;
          else if (r.status === "rejected") entry.rejected++;
          else entry.pending++;
        }
      });
      const monthlyTrend = Array.from(monthlyMap.entries()).map(([month, data]) => ({
        month, ...data, total: data.approved + data.rejected + data.pending,
      }));

      // Status distribution pie
      const statusCounts = { approved: 0, rejected: 0, pending: 0, frozen: 0 };
      requests.forEach((r) => {
        if (r.status in statusCounts) statusCounts[r.status as keyof typeof statusCounts]++;
      });
      const statusPie = [
        { name: "مقبول", value: statusCounts.approved, color: "hsl(142, 71%, 45%)" },
        { name: "مرفوض", value: statusCounts.rejected, color: "hsl(0, 84%, 60%)" },
        { name: "معلّق", value: statusCounts.pending, color: "hsl(45, 93%, 47%)" },
        { name: "مجمّد", value: statusCounts.frozen, color: "hsl(210, 40%, 50%)" },
      ].filter((s) => s.value > 0);

      // Subscriptions by package
      const pkgMap = new Map<string, number>();
      subs.forEach((s: any) => {
        const name = s.packages?.name_ar || "غير محدد";
        pkgMap.set(name, (pkgMap.get(name) || 0) + 1);
      });
      const packageDist = Array.from(pkgMap.entries()).map(([name, count]) => ({ name, count }));

      return { monthlyTrend, statusPie, packageDist };
    },
    enabled: !!user,
  });

  const exportCSV = async () => {
    try {
      const { data, error } = await supabase
        .from("subscriptions")
        .select("id, user_id, status, starts_at, expires_at, service_type, countries, telegram_chat_id, created_at, packages(name_ar, name_en, price, duration_months)");
      if (error) throw error;
      if (!data || data.length === 0) { toast.error("لا توجد بيانات للتصدير"); return; }

      const rows = data.map((s: any) => ({
        "المعرّف": s.id,
        "معرّف المستخدم": s.user_id,
        "الحالة": s.status,
        "الباقة": s.packages?.name_ar || "",
        "السعر": s.packages?.price || "",
        "المدة (أشهر)": s.packages?.duration_months || "",
        "نوع الخدمة": s.service_type,
        "الدول": (s.countries || []).join("، "),
        "تاريخ البداية": s.starts_at,
        "تاريخ الانتهاء": s.expires_at,
        "تليغرام": s.telegram_chat_id || "",
        "تاريخ الإنشاء": s.created_at,
      }));

      const headers = Object.keys(rows[0]);
      const csv = "\uFEFF" + [
        headers.join(","),
        ...rows.map((r: any) => headers.map((h) => `"${String(r[h]).replace(/"/g, '""')}"`).join(",")),
      ].join("\n");

      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `subscriptions_${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("تم تصدير البيانات بنجاح");
    } catch (err) {
      toast.error("حدث خطأ أثناء التصدير");
      console.error(err);
    }
  };

  if (!user) return null;

  const fullName = user.user_metadata?.full_name || "";
  const email = user.email || "";

  // Device blocked
  if (deviceCheck && !deviceCheck.allowed) {
    return (
      <Layout>
        <div className="container py-20 max-w-lg text-center">
          <div className="gradient-card rounded-2xl border border-destructive/40 p-8">
            <AlertTriangle className="w-16 h-16 text-destructive mx-auto mb-4" />
            <h1 className="font-heading text-2xl font-bold text-foreground mb-2">تم حظر الوصول</h1>
            <p className="text-muted-foreground mb-6">
              {deviceCheck.error || "تم تجاوز الحد الأقصى للأجهزة (جهازين). يرجى إلغاء تفعيل جهاز آخر."}
            </p>
            <button onClick={async () => { await signOut(); navigate("/auth/login"); }} className="gradient-primary px-6 py-3 rounded-xl font-bold text-primary-foreground">
              تسجيل الخروج
            </button>
          </div>
        </div>
      </Layout>
    );
  }

  const activeDevices = devices.filter((d) => d.is_active);

  const statCards = [
    { label: "المشتركين النشطين", value: stats?.activeSubscriptions || 0, icon: UserCheck, color: "text-green-400", bg: "bg-green-500/10" },
    { label: "طلبات معلّقة", value: stats?.pendingRequests || 0, icon: Clock, color: "text-amber-400", bg: "bg-amber-500/10" },
    { label: "إجمالي الطلبات", value: stats?.totalRequests || 0, icon: ClipboardList, color: "text-primary", bg: "bg-primary/10" },
    { label: "الأجهزة النشطة", value: `${activeDevices.length}/2`, icon: Monitor, color: "text-primary", bg: "bg-primary/10" },
  ];

  const quickActions = [
    { label: "طلبات الاشتراك", desc: "مراجعة الطلبات المعلّقة", icon: ClipboardList, path: "/dashboard/requests", count: stats?.pendingRequests },
    { label: "المستخدمين", desc: "عرض وإدارة المشتركين", icon: Users, path: "/dashboard/users" },
    { label: "إدارة الوظائف", desc: "إضافة وتعديل الوظائف", icon: Briefcase, path: "/dashboard/jobs" },
    { label: "الإشعارات", desc: "إرسال تنبيهات الفيزا", icon: Bell, path: "/dashboard/notifications" },
  ];

  return (
    <AdminLayout title="نظرة عامة" subtitle={`مرحباً، ${fullName || email}`}>
      {/* Device sharing warning */}
      {deviceCheck?.isShared && (
        <div className="mb-6 p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0" />
          <p className="text-sm text-amber-400">
            ⚠️ حسابك مستخدم على {deviceCheck.activeDeviceCount} أجهزة. الحد الأقصى المسموح: جهازين.
          </p>
        </div>
      )}

      {/* Stats Grid */}
      <div className="flex items-center justify-between mb-4">
        <div />
        <button
          onClick={exportCSV}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-primary/10 hover:bg-primary/20 text-primary text-xs font-bold transition-colors border border-primary/20"
        >
          <Download className="w-4 h-4" />
          تصدير CSV
        </button>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {statCards.map((stat, i) => (
          <motion.div
            key={stat.label}
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}
            className="gradient-card rounded-2xl border border-border/50 shadow-card p-5"
          >
            <div className={`w-10 h-10 rounded-xl ${stat.bg} flex items-center justify-center mb-3`}>
              <stat.icon className={`w-5 h-5 ${stat.color}`} />
            </div>
            <p className="font-heading text-2xl font-black text-foreground">{stat.value}</p>
            <p className="text-xs text-muted-foreground mt-1">{stat.label}</p>
          </motion.div>
        ))}
      </div>

      {/* Quick Actions */}
      <div className="mb-8">
        <h2 className="font-heading text-lg font-bold text-foreground mb-4">إجراءات سريعة</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {quickActions.map((action, i) => (
            <motion.button
              key={action.path}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 + i * 0.05 }}
              onClick={() => navigate(action.path)}
              className="gradient-card rounded-xl border border-border/50 p-4 flex items-center gap-4 text-right hover:border-primary/30 hover:shadow-glow transition-all group"
            >
              <div className="w-11 h-11 rounded-xl bg-primary/10 flex items-center justify-center shrink-0 group-hover:bg-primary/20 transition-colors">
                <action.icon className="w-5 h-5 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-foreground">{action.label}</p>
                <p className="text-xs text-muted-foreground">{action.desc}</p>
              </div>
              {action.count !== undefined && action.count > 0 && (
                <span className="px-2.5 py-1 rounded-full bg-amber-500/10 text-amber-400 text-xs font-bold border border-amber-500/30">
                  {action.count}
                </span>
              )}
              <ArrowLeft className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
            </motion.button>
          ))}
        </div>
      </div>

      {/* Charts Section */}
      {chartData && (
        <div className="grid lg:grid-cols-2 gap-6 mb-8">
          {/* Monthly Trend */}
          <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.25 }}
            className="gradient-card rounded-2xl border border-border/50 shadow-card p-5"
          >
            <h3 className="font-heading text-sm font-bold text-foreground mb-4 flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-primary" />
              تطور الطلبات (آخر 6 أشهر)
            </h3>
            <div className="h-52">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData.monthlyTrend} barGap={2}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
                  <XAxis dataKey="month" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
                  <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} allowDecimals={false} />
                  <Tooltip
                    contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 12, fontSize: 12 }}
                    labelStyle={{ color: "hsl(var(--foreground))" }}
                  />
                  <Bar dataKey="approved" name="مقبول" fill="hsl(142, 71%, 45%)" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="pending" name="معلّق" fill="hsl(45, 93%, 47%)" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="rejected" name="مرفوض" fill="hsl(0, 84%, 60%)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </motion.div>

          {/* Status Distribution Pie */}
          <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="gradient-card rounded-2xl border border-border/50 shadow-card p-5"
          >
            <h3 className="font-heading text-sm font-bold text-foreground mb-4 flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-primary" />
              توزيع حالات الطلبات
            </h3>
            <div className="h-52 flex items-center">
              {chartData.statusPie.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={chartData.statusPie}
                      cx="50%"
                      cy="50%"
                      innerRadius={45}
                      outerRadius={75}
                      dataKey="value"
                      paddingAngle={3}
                      label={({ name, value }) => `${name}: ${value}`}
                    >
                      {chartData.statusPie.map((entry, idx) => (
                        <Cell key={idx} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 12, fontSize: 12 }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <p className="text-xs text-muted-foreground text-center w-full">لا توجد بيانات بعد</p>
              )}
            </div>
          </motion.div>

          {/* Package Distribution */}
          {chartData.packageDist.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.35 }}
              className="gradient-card rounded-2xl border border-border/50 shadow-card p-5 lg:col-span-2"
            >
              <h3 className="font-heading text-sm font-bold text-foreground mb-4 flex items-center gap-2">
                <Crown className="w-4 h-4 text-accent" />
                الاشتراكات حسب الباقة
              </h3>
              <div className="h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData.packageDist} layout="vertical" barSize={20}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
                    <XAxis type="number" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} allowDecimals={false} />
                    <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: "hsl(var(--foreground))" }} width={100} />
                    <Tooltip
                      contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 12, fontSize: 12 }}
                    />
                    <Bar dataKey="count" name="اشتراكات" fill="hsl(var(--primary))" radius={[0, 6, 6, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </motion.div>
          )}
        </div>
      )}

      {/* Profile + Devices Row */}
      <div className="grid lg:grid-cols-2 gap-6">
        {/* Profile */}
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="gradient-card rounded-2xl border border-border/50 shadow-card p-6"
        >
          <h3 className="font-heading text-base font-bold text-foreground mb-4 flex items-center gap-2">
            <User className="w-4 h-4 text-primary" />
            الملف الشخصي
          </h3>
          <div className="flex items-center gap-4 mb-5">
            <div className="w-14 h-14 rounded-full gradient-primary flex items-center justify-center">
              <span className="text-primary-foreground font-bold text-lg">
                {(fullName || email)[0]?.toUpperCase()}
              </span>
            </div>
            <div>
              <h4 className="font-heading font-bold text-foreground">{fullName || "مستخدم"}</h4>
              <p className="text-xs text-muted-foreground">{email}</p>
            </div>
          </div>
          <div className="space-y-2.5 text-sm">
            <div className="flex items-center gap-2.5 text-muted-foreground p-2.5 rounded-lg bg-muted/30">
              <Mail className="w-4 h-4 text-primary" />
              <span>{email}</span>
            </div>
            <div className="flex items-center gap-2.5 text-muted-foreground p-2.5 rounded-lg bg-muted/30">
              <Phone className="w-4 h-4 text-primary" />
              <span>{user.user_metadata?.phone || "غير محدد"}</span>
            </div>
          </div>
        </motion.div>

        {/* Active Devices */}
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.35 }}
          className="gradient-card rounded-2xl border border-border/50 shadow-card p-6"
        >
          <h3 className="font-heading text-base font-bold text-foreground mb-4 flex items-center gap-2">
            <Smartphone className="w-4 h-4 text-primary" />
            الأجهزة المتصلة ({activeDevices.length}/2)
          </h3>
          <div className="space-y-2.5">
            {devices.map((device) => (
              <div
                key={device.id}
                className={`rounded-xl border p-3 flex items-center justify-between ${
                  device.is_active ? "border-border/50 bg-muted/20" : "border-border/20 opacity-40"
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${device.is_active ? "bg-primary/10" : "bg-muted/30"}`}>
                    <Monitor className={`w-4 h-4 ${device.is_active ? "text-primary" : "text-muted-foreground"}`} />
                  </div>
                  <div>
                    <p className="text-xs font-medium text-foreground">{device.device_name || "جهاز"}</p>
                    <p className="text-[10px] text-muted-foreground">{device.browser} • {device.os}</p>
                  </div>
                </div>
                {device.is_active && (
                  <button
                    onClick={() => { deactivateDevice(device.id); toast.success("تم إلغاء تفعيل الجهاز"); }}
                    className="p-1.5 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                    title="إلغاء تفعيل"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            ))}
            {devices.length === 0 && (
              <p className="text-xs text-muted-foreground text-center py-6">لا توجد أجهزة مسجلة</p>
            )}
          </div>
        </motion.div>
      </div>
    </AdminLayout>
  );
}
