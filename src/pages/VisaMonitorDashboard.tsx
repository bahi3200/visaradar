import { useState, useEffect } from "react";
import AdminLayout from "@/components/AdminLayout";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { motion, AnimatePresence } from "framer-motion";
import {
  Activity, CheckCircle, XCircle, AlertTriangle, Clock, RefreshCw,
  Globe, Eye, Filter, BellRing, X
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: typeof CheckCircle }> = {
  open: { label: "مفتوح", color: "bg-green-500/10 text-green-400 border-green-500/30", icon: CheckCircle },
  closed: { label: "مغلق", color: "bg-red-500/10 text-red-400 border-red-500/30", icon: XCircle },
  unknown: { label: "غير معروف", color: "bg-amber-500/10 text-amber-400 border-amber-500/30", icon: AlertTriangle },
  error: { label: "خطأ", color: "bg-red-500/10 text-red-400 border-red-500/30", icon: XCircle },
  changed: { label: "تغيّر", color: "bg-blue-500/10 text-blue-400 border-blue-500/30", icon: Activity },
};

const COUNTRY_NAMES: Record<string, string> = {
  IT: "إيطاليا 🇮🇹",
  FR: "فرنسا 🇫🇷",
  ES: "إسبانيا 🇪🇸",
  DE: "ألمانيا 🇩🇪",
  GR: "اليونان 🇬🇷",
};

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "الآن";
  if (mins < 60) return `منذ ${mins} دقيقة`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `منذ ${hours} ساعة`;
  return `منذ ${Math.floor(hours / 24)} يوم`;
}

type StatusAlert = {
  id: string;
  country: string;
  previousStatus: string;
  newStatus: string;
  time: string;
};

export default function VisaMonitorDashboard() {
  const queryClient = useQueryClient();
  const [countryFilter, setCountryFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [alerts, setAlerts] = useState<StatusAlert[]>([]);

  // Realtime: listen for new checks with status changes
  useEffect(() => {
    const channel = supabase
      .channel("visa-monitor-realtime")
      .on("postgres_changes", {
        event: "INSERT",
        schema: "public",
        table: "visa_monitor_checks",
      }, (payload: any) => {
        const row = payload.new;
        queryClient.invalidateQueries({ queryKey: ["visa-monitor-checks"] });

        // Detect closed → open change
        if (row.status === "open" && row.previous_status && row.previous_status !== "open") {
          const countryName = COUNTRY_NAMES[row.country_code] || row.country_code;
          const alert: StatusAlert = {
            id: row.id,
            country: countryName,
            previousStatus: row.previous_status,
            newStatus: row.status,
            time: row.checked_at,
          };
          setAlerts(prev => [alert, ...prev].slice(0, 5));
          toast.success(`🚨 مواعيد مفتوحة! ${countryName}`, {
            description: `تغيّرت الحالة من "${STATUS_CONFIG[row.previous_status]?.label || row.previous_status}" إلى "مفتوح"`,
            duration: 15000,
          });
        }
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [queryClient]);

  const { data: checks, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["visa-monitor-checks"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("visa_monitor_checks")
        .select("*")
        .order("checked_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return data || [];
    },
    refetchInterval: 30000,
  });

  // Latest check per country
  const latestByCountry = (checks || []).reduce((acc, check) => {
    if (!acc[check.country_code]) acc[check.country_code] = check;
    return acc;
  }, {} as Record<string, any>);

  const latestChecks = Object.values(latestByCountry);

  // Stats
  const totalChecks = checks?.length || 0;
  const openCount = latestChecks.filter((c: any) => c.status === "open").length;
  const errorCount = latestChecks.filter((c: any) => c.status === "error" || c.error_message).length;
  const lastCheckTime = checks?.[0]?.checked_at;

  // Filtered list
  const filteredChecks = (checks || []).filter((c) => {
    if (countryFilter !== "all" && c.country_code !== countryFilter) return false;
    if (statusFilter !== "all" && c.status !== statusFilter) return false;
    return true;
  });

  const countries = [...new Set((checks || []).map((c) => c.country_code))];

  const statCards = [
    { label: "إجمالي الفحوصات", value: totalChecks, icon: Eye, color: "text-primary", bg: "bg-primary/10" },
    { label: "مواعيد مفتوحة", value: openCount, icon: CheckCircle, color: "text-green-400", bg: "bg-green-500/10" },
    { label: "أخطاء", value: errorCount, icon: AlertTriangle, color: "text-red-400", bg: "bg-red-500/10" },
    { label: "آخر فحص", value: lastCheckTime ? timeAgo(lastCheckTime) : "—", icon: Clock, color: "text-amber-400", bg: "bg-amber-500/10" },
  ];

  return (
    <AdminLayout title="مراقبة التأشيرات" subtitle="سجل الفحوصات والحالات في الوقت الفعلي">
      {/* Realtime status change alerts */}
      <AnimatePresence>
        {alerts.map((alert) => (
          <motion.div
            key={alert.id}
            initial={{ opacity: 0, y: -20, height: 0 }}
            animate={{ opacity: 1, y: 0, height: "auto" }}
            exit={{ opacity: 0, x: 100, height: 0 }}
            className="mb-3 rounded-xl border border-green-500/40 bg-green-500/10 p-4 flex items-center gap-3"
          >
            <BellRing className="w-5 h-5 text-green-400 shrink-0 animate-pulse" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-green-300">
                🚨 مواعيد مفتوحة — {alert.country}
              </p>
              <p className="text-xs text-green-400/70 mt-0.5">
                تغيّرت من "{STATUS_CONFIG[alert.previousStatus]?.label || alert.previousStatus}" → "مفتوح" • {timeAgo(alert.time)}
              </p>
            </div>
            <button
              onClick={() => setAlerts(prev => prev.filter(a => a.id !== alert.id))}
              className="p-1 rounded hover:bg-green-500/20 text-green-400 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </motion.div>
        ))}
      </AnimatePresence>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
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

      {/* Latest status per country */}
      <div className="mb-6">
        <h2 className="font-heading text-lg font-bold text-foreground mb-4 flex items-center gap-2">
          <Globe className="w-5 h-5 text-primary" />
          الحالة الحالية لكل دولة
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {latestChecks.map((check: any) => {
            const cfg = STATUS_CONFIG[check.status] || STATUS_CONFIG.unknown;
            const Icon = cfg.icon;
            return (
              <motion.div
                key={check.country_code}
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="gradient-card rounded-xl border border-border/50 p-4 flex items-center gap-4"
              >
                <div className={`w-12 h-12 rounded-xl ${cfg.color.split(" ")[0]} flex items-center justify-center shrink-0`}>
                  <Icon className={`w-6 h-6 ${cfg.color.split(" ")[1]}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-foreground">
                    {COUNTRY_NAMES[check.country_code] || check.country_code}
                  </p>
                  <p className="text-xs text-muted-foreground">{check.provider}</p>
                  <p className="text-[10px] text-muted-foreground mt-1">{timeAgo(check.checked_at)}</p>
                </div>
                <Badge variant="outline" className={`${cfg.color} text-xs`}>
                  {cfg.label}
                </Badge>
              </motion.div>
            );
          })}
          {latestChecks.length === 0 && !isLoading && (
            <p className="text-sm text-muted-foreground col-span-full text-center py-8">لا توجد فحوصات بعد</p>
          )}
        </div>
      </div>

      {/* Filters + Table */}
      <div className="gradient-card rounded-2xl border border-border/50 shadow-card overflow-hidden">
        <div className="p-4 border-b border-border/30 flex flex-wrap items-center gap-3">
          <h3 className="font-heading text-sm font-bold text-foreground flex items-center gap-2 flex-1">
            <Activity className="w-4 h-4 text-primary" />
            سجل الفحوصات
          </h3>
          <div className="flex items-center gap-2">
            <Select value={countryFilter} onValueChange={setCountryFilter}>
              <SelectTrigger className="w-[130px] h-8 text-xs">
                <Filter className="w-3 h-3 ml-1" />
                <SelectValue placeholder="الدولة" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">جميع الدول</SelectItem>
                {countries.map((c) => (
                  <SelectItem key={c} value={c}>{COUNTRY_NAMES[c] || c}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[120px] h-8 text-xs">
                <SelectValue placeholder="الحالة" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">جميع الحالات</SelectItem>
                {Object.entries(STATUS_CONFIG).map(([key, cfg]) => (
                  <SelectItem key={key} value={key}>{cfg.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <button
              onClick={() => refetch()}
              disabled={isFetching}
              className="p-2 rounded-lg hover:bg-muted/50 text-muted-foreground transition-colors disabled:opacity-50"
              title="تحديث"
            >
              <RefreshCw className={`w-4 h-4 ${isFetching ? "animate-spin" : ""}`} />
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-right">الدولة</TableHead>
                <TableHead className="text-right">المزوّد</TableHead>
                <TableHead className="text-right">الحالة</TableHead>
                <TableHead className="text-right">الحالة السابقة</TableHead>
                <TableHead className="text-right">طريقة الكشف</TableHead>
                <TableHead className="text-right">الوقت</TableHead>
                <TableHead className="text-right">الخطأ</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-12">
                    <RefreshCw className="w-5 h-5 animate-spin mx-auto text-muted-foreground" />
                  </TableCell>
                </TableRow>
              ) : filteredChecks.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-12 text-muted-foreground text-sm">
                    لا توجد نتائج
                  </TableCell>
                </TableRow>
              ) : (
                filteredChecks.map((check) => {
                  const cfg = STATUS_CONFIG[check.status] || STATUS_CONFIG.unknown;
                  const detectionMethod = (check as any).detection_method || "—";
                  return (
                    <TableRow key={check.id}>
                      <TableCell className="font-medium text-sm">
                        {COUNTRY_NAMES[check.country_code] || check.country_code}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">{check.provider}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={`${cfg.color} text-xs`}>
                          {cfg.label}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {check.previous_status ? (STATUS_CONFIG[check.previous_status]?.label || check.previous_status) : "—"}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground max-w-[180px] truncate" title={detectionMethod}>
                        {detectionMethod}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                        {timeAgo(check.checked_at)}
                      </TableCell>
                      <TableCell className="text-xs text-red-400 max-w-[200px] truncate">
                        {check.error_message || "—"}
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </AdminLayout>
  );
}
