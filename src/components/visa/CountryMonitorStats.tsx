import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { motion } from "framer-motion";
import {
  Activity, CheckCircle, XCircle, AlertTriangle, ShieldCheck, Zap,
  TrendingUp, Clock, BarChart3, Radar, Timer, Flame,
} from "lucide-react";

interface Props {
  countryCode: string;
  countryNameAr: string;
}

type Check = {
  id: string;
  country_code: string;
  status: string;
  previous_status: string | null;
  checked_at: string;
  detection_method: string | null;
  error_message: string | null;
};

type OpenEvent = {
  id?: string;
  opened_at: string;
  closed_at: string | null;
  duration_minutes: number | null;
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

const STATUS_LABEL: Record<string, { label: string; cls: string }> = {
  open: { label: "مفتوح", cls: "bg-green-500/10 text-green-500 border-green-500/30" },
  closed: { label: "مغلق", cls: "bg-red-500/10 text-red-400 border-red-500/30" },
  unknown: { label: "غير معروف", cls: "bg-amber-500/10 text-amber-400 border-amber-500/30" },
  error: { label: "خطأ", cls: "bg-red-500/10 text-red-400 border-red-500/30" },
};

export default function CountryMonitorStats({ countryCode, countryNameAr }: Props) {
  const [checks, setChecks] = useState<Check[]>([]);
  const [opens, setOpens] = useState<OpenEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);

  const fetchData = async () => {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();

    const [{ data: ck }, { data: ev }] = await Promise.all([
      supabase
        .from("visa_monitor_checks")
        .select("id, country_code, status, previous_status, checked_at, detection_method, error_message")
        .eq("country_code", countryCode)
        .gte("checked_at", sevenDaysAgo)
        .order("checked_at", { ascending: false })
        .limit(500),
      supabase
        .from("visa_open_events" as any)
        .select("id, opened_at, closed_at, duration_minutes")
        .eq("country_code", countryCode)
        .gte("opened_at", ninetyDaysAgo)
        .order("opened_at", { ascending: false })
        .limit(200),
    ]);

    setChecks((ck as Check[]) || []);
    setOpens(((ev as unknown) as OpenEvent[]) || []);
    setLoading(false);
  };

  useEffect(() => {
    fetchData();
    const sevenDaysAgoMs = () => Date.now() - 7 * 24 * 60 * 60 * 1000;
    const ninetyDaysAgoMs = () => Date.now() - 90 * 24 * 60 * 60 * 1000;
    const channel = supabase
      .channel(`country-monitor-${countryCode}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "visa_monitor_checks", filter: `country_code=eq.${countryCode}` },
        (payload: any) => {
          const row = payload.new as Check | undefined;
          if (!row?.id || !row.checked_at) return;
          if (new Date(row.checked_at).getTime() < sevenDaysAgoMs()) return;
          setChecks((prev) => (prev.some((c) => c.id === row.id) ? prev : [row, ...prev].slice(0, 500)));
        }
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "visa_open_events", filter: `country_code=eq.${countryCode}` },
        (payload: any) => {
          const row = payload.new as OpenEvent | undefined;
          if (!row?.opened_at) return;
          if (new Date(row.opened_at).getTime() < ninetyDaysAgoMs()) return;
          setOpens((prev) => (row.id && prev.some((o) => o.id === row.id) ? prev : [row, ...prev].slice(0, 200)));
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "visa_open_events", filter: `country_code=eq.${countryCode}` },
        (payload: any) => {
          const row = payload.new as OpenEvent | undefined;
          if (!row?.id) return;
          setOpens((prev) => prev.map((o) => (o.id === row.id ? { ...o, ...row } : o)));
        }
      )
      .subscribe();
    const id = setInterval(() => setTick((t) => t + 1), 30_000);
    return () => {
      supabase.removeChannel(channel);
      clearInterval(id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [countryCode]);

  const stats = useMemo(() => {
    const total = checks.length;
    const errors = checks.filter((c) => c.status === "error" || c.error_message).length;
    const successRate = total ? ((total - errors) / total) * 100 : 0;
    const now = Date.now();
    const last24h = checks.filter((c) => now - new Date(c.checked_at).getTime() < 86_400_000).length;
    const last7d = total;
    const opensCount = checks.filter((c) => c.status === "open").length;
    const closedCount = checks.filter((c) => c.status === "closed").length;
    const changes = checks.filter((c) => c.previous_status && c.previous_status !== c.status).length;
    const latest = checks[0] || null;

    // detection methods
    const methods: Record<string, number> = {};
    checks.forEach((c) => {
      const key = (c.detection_method || "unknown").split("(")[0].trim();
      methods[key] = (methods[key] || 0) + 1;
    });

    // opens analytics
    const totalOpens90 = opens.length;
    const durations = opens.map((o) => o.duration_minutes).filter((d): d is number => typeof d === "number");
    const avgDuration = durations.length
      ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length)
      : 0;
    const totalOpenMins = durations.reduce((a, b) => a + b, 0);
    const lastOpen = opens[0]?.opened_at || null;

    return {
      total,
      errors,
      successRate,
      last24h,
      last7d,
      opensCount,
      closedCount,
      changes,
      latest,
      methods,
      totalOpens90,
      avgDuration,
      totalOpenMins,
      lastOpen,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checks, opens, tick]);

  const formatDuration = (m: number) => {
    if (!m) return "—";
    if (m < 60) return `${m} د`;
    const h = Math.floor(m / 60);
    const r = m % 60;
    return r ? `${h}س ${r}د` : `${h}س`;
  };

  if (loading) {
    return (
      <div className="rounded-2xl border border-border/50 bg-card p-6 text-center text-sm text-muted-foreground">
        جاري تحميل إحصائيات المراقبة…
      </div>
    );
  }

  if (stats.total === 0) {
    return (
      <div className="rounded-2xl border border-border/50 bg-card p-6 text-center">
        <Radar className="w-8 h-8 mx-auto text-muted-foreground mb-2" />
        <p className="text-sm text-muted-foreground">لا توجد بيانات مراقبة متاحة لهذه الدولة بعد.</p>
      </div>
    );
  }

  const status = stats.latest?.status || "unknown";
  const statusCfg = STATUS_LABEL[status] || STATUS_LABEL.unknown;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="gradient-card rounded-2xl border border-border/50 p-5 space-y-5"
    >
      {/* Header / Current status */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="relative">
            <Activity className="w-5 h-5 text-primary" />
            <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-green-500 animate-ping" />
            <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-green-500" />
          </div>
          <h2 className="font-heading text-base md:text-lg font-bold text-foreground">
            مراقبة موقع {countryNameAr}
          </h2>
        </div>
        <span className={`inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-1 rounded-full border ${statusCfg.cls}`}>
          {status === "open" ? <CheckCircle className="w-3 h-3" /> : status === "closed" ? <XCircle className="w-3 h-3" /> : <AlertTriangle className="w-3 h-3" />}
          {statusCfg.label}
        </span>
      </div>

      {stats.latest && (
        <p className="text-[11px] text-muted-foreground -mt-2">
          آخر فحص: {timeAgo(stats.latest.checked_at)}
          {stats.latest.detection_method ? ` • ${stats.latest.detection_method.split("(")[0].trim()}` : ""}
        </p>
      )}

      {/* KPI grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { icon: ShieldCheck, label: "نسبة النجاح", value: `${stats.successRate.toFixed(0)}%`, color: "text-green-500", bg: "bg-green-500/10" },
          { icon: Zap, label: "فحوصات 24س", value: stats.last24h, color: "text-primary", bg: "bg-primary/10" },
          { icon: TrendingUp, label: "فحوصات 7 أيام", value: stats.last7d, color: "text-accent", bg: "bg-accent/10" },
          { icon: CheckCircle, label: "مرات الفتح", value: stats.opensCount, color: "text-green-500", bg: "bg-green-500/10" },
        ].map((s, i) => (
          <div key={i} className="rounded-xl border border-border/30 bg-secondary/20 p-3 text-center">
            <div className={`w-8 h-8 rounded-lg ${s.bg} flex items-center justify-center mx-auto mb-2`}>
              <s.icon className={`w-4 h-4 ${s.color}`} />
            </div>
            <p className="font-heading text-xl font-black text-foreground leading-none">{s.value}</p>
            <p className="text-[10px] text-muted-foreground mt-1">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Success bar */}
      <div>
        <div className="flex items-center justify-between text-[11px] text-muted-foreground mb-1.5">
          <span>موثوقية المراقبة (آخر 7 أيام)</span>
          <span className="font-mono">{stats.errors} خطأ من {stats.total}</span>
        </div>
        <div className="w-full h-2 rounded-full bg-secondary/50 overflow-hidden">
          <div
            className={`h-full transition-all ${stats.successRate >= 90 ? "bg-green-500" : stats.successRate >= 70 ? "bg-amber-500" : "bg-red-500"}`}
            style={{ width: `${stats.successRate}%` }}
          />
        </div>
      </div>

      {/* Opens analytics */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2 border-t border-border/30">
        <div className="rounded-xl border border-border/30 bg-secondary/10 p-3">
          <div className="flex items-center gap-1.5 text-muted-foreground mb-1">
            <Flame className="w-3.5 h-3.5 text-accent" />
            <span className="text-[10px] font-bold">فتحات 90 يوماً</span>
          </div>
          <p className="font-heading text-lg font-black text-foreground">{stats.totalOpens90}</p>
        </div>
        <div className="rounded-xl border border-border/30 bg-secondary/10 p-3">
          <div className="flex items-center gap-1.5 text-muted-foreground mb-1">
            <Timer className="w-3.5 h-3.5 text-primary" />
            <span className="text-[10px] font-bold">متوسط مدة الفتح</span>
          </div>
          <p className="font-heading text-lg font-black text-foreground">{formatDuration(stats.avgDuration)}</p>
        </div>
        <div className="rounded-xl border border-border/30 bg-secondary/10 p-3">
          <div className="flex items-center gap-1.5 text-muted-foreground mb-1">
            <Clock className="w-3.5 h-3.5 text-primary" />
            <span className="text-[10px] font-bold">إجمالي وقت الفتح</span>
          </div>
          <p className="font-heading text-lg font-black text-foreground">{formatDuration(stats.totalOpenMins)}</p>
        </div>
        <div className="rounded-xl border border-border/30 bg-secondary/10 p-3">
          <div className="flex items-center gap-1.5 text-muted-foreground mb-1">
            <Activity className="w-3.5 h-3.5 text-accent" />
            <span className="text-[10px] font-bold">آخر فتح</span>
          </div>
          <p className="font-heading text-sm font-bold text-foreground">
            {stats.lastOpen ? timeAgo(stats.lastOpen) : "—"}
          </p>
        </div>
      </div>

      {/* Recent transitions */}
      {(() => {
        const transitions = checks.filter((c) => c.previous_status && c.previous_status !== c.status).slice(0, 5);
        if (transitions.length === 0) return null;
        return (
          <div>
            <h3 className="text-sm font-bold text-foreground mb-2 flex items-center gap-1.5">
              <BarChart3 className="w-4 h-4 text-primary" />
              آخر تغييرات الحالة
            </h3>
            <ul className="space-y-1.5">
              {transitions.map((t) => (
                <li key={t.id} className="flex items-center justify-between text-xs rounded-lg border border-border/30 bg-secondary/10 px-3 py-2">
                  <span className="text-muted-foreground">
                    {STATUS_LABEL[t.previous_status!]?.label || t.previous_status} →{" "}
                    <span className="text-foreground font-bold">{STATUS_LABEL[t.status]?.label || t.status}</span>
                  </span>
                  <span className="text-[10px] text-muted-foreground font-mono">{timeAgo(t.checked_at)}</span>
                </li>
              ))}
            </ul>
          </div>
        );
      })()}

      {/* Detection methods */}
      {Object.keys(stats.methods).length > 0 && (
        <div className="flex flex-wrap gap-2 pt-2 border-t border-border/30">
          <span className="text-[11px] text-muted-foreground self-center">طرق الكشف:</span>
          {Object.entries(stats.methods)
            .sort(([, a], [, b]) => b - a)
            .slice(0, 5)
            .map(([m, n]) => (
              <span key={m} className="rounded-lg border border-border/30 bg-secondary/20 px-2 py-1 text-[11px]">
                <span className="text-muted-foreground">{m}</span>
                <span className="font-bold text-foreground mr-1.5">{n}</span>
              </span>
            ))}
        </div>
      )}
    </motion.div>
  );
}