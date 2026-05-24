import { useEffect, useMemo, useState } from "react";
import AdminLayout from "@/components/AdminLayout";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
import {
  Activity, Server, Webhook, AlertTriangle, Plus, Trash2, CheckCircle2,
  XCircle, Clock, Gauge, Zap, ShieldCheck, RefreshCw, Pause, Play,
  Heart, AlertOctagon, Wifi, Database, TrendingUp,
} from "lucide-react";
import { toast } from "sonner";
import { motion } from "framer-motion";

function timeAgo(s: string | null) {
  if (!s) return "—";
  const m = Math.floor((Date.now() - new Date(s).getTime()) / 60000);
  if (m < 1) return "الآن";
  if (m < 60) return `منذ ${m}د`;
  const h = Math.floor(m / 60);
  if (h < 24) return `منذ ${h}س`;
  return `منذ ${Math.floor(h / 24)} يوم`;
}

function percentile(arr: number[], p: number): number {
  if (!arr.length) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

// ─────────── System Health Banner ───────────
function SystemHealthBanner({ workers, priorities, webhooks, checks }: any) {
  const recentCrashed = (workers || []).filter((w: any) =>
    (w.status === "crashed" || w.status === "timeout") &&
    Date.now() - new Date(w.started_at).getTime() < 30 * 60_000
  ).length;
  const inCooldown = (priorities || []).filter((p: any) =>
    p.cooldown_until && new Date(p.cooldown_until) > new Date()
  ).length;
  const failingWebhooks = (webhooks || []).filter((w: any) => w.is_active && w.failure_count >= 3).length;
  const recentErrors = (checks || []).filter((c: any) =>
    c.status === "error" && Date.now() - new Date(c.checked_at).getTime() < 30 * 60_000
  ).length;

  let health: "healthy" | "degraded" | "critical" = "healthy";
  if (recentCrashed >= 5 || inCooldown >= 3 || recentErrors >= 20) health = "critical";
  else if (recentCrashed >= 1 || inCooldown >= 1 || failingWebhooks >= 1 || recentErrors >= 5) health = "degraded";

  const cfg = {
    healthy:  { label: "النظام يعمل بشكل ممتاز", color: "from-green-500/20 to-emerald-500/10 border-green-500/40", text: "text-green-400", icon: Heart },
    degraded: { label: "أداء متراجع — يحتاج متابعة", color: "from-amber-500/20 to-yellow-500/10 border-amber-500/40", text: "text-amber-400", icon: AlertTriangle },
    critical: { label: "حالة حرجة — تدخل فوري مطلوب", color: "from-red-500/20 to-rose-500/10 border-red-500/40", text: "text-red-400", icon: AlertOctagon },
  }[health];
  const Icon = cfg.icon;

  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
      className={`rounded-2xl border bg-gradient-to-br ${cfg.color} p-5 mb-5 flex items-center gap-4`}
    >
      <div className={`w-12 h-12 rounded-xl bg-background/40 flex items-center justify-center ${cfg.text}`}>
        <Icon className={`w-6 h-6 ${health === "healthy" ? "animate-pulse" : ""}`} />
      </div>
      <div className="flex-1 min-w-0">
        <h2 className={`font-heading text-lg font-black ${cfg.text}`}>{cfg.label}</h2>
        <div className="flex flex-wrap gap-3 mt-1 text-[11px] text-muted-foreground">
          <span>عمال فشلوا (30د): <b className={recentCrashed ? "text-red-400" : "text-foreground"}>{recentCrashed}</b></span>
          <span>في وضع التبريد: <b className={inCooldown ? "text-amber-400" : "text-foreground"}>{inCooldown}</b></span>
          <span>Webhooks فاشلة: <b className={failingWebhooks ? "text-red-400" : "text-foreground"}>{failingWebhooks}</b></span>
          <span>أخطاء فحص (30د): <b className={recentErrors ? "text-red-400" : "text-foreground"}>{recentErrors}</b></span>
        </div>
      </div>
      <div className="hidden sm:flex flex-col items-center gap-1">
        <span className="text-[10px] text-muted-foreground">آخر تحديث</span>
        <span className={`text-xs font-mono ${cfg.text}`}>{new Date().toLocaleTimeString("ar-DZ")}</span>
      </div>
    </motion.div>
  );
}

// ─────────── Overview KPIs ───────────
function OverviewKpis({ workers, checks, priorities }: any) {
  const queueDepth = (priorities || []).filter((p: any) => {
    if (!p.last_scanned_at) return true;
    const due = new Date(p.last_scanned_at).getTime() + p.current_interval_seconds * 1000;
    return due < Date.now();
  }).length;

  const runningWorkers = (workers || []).filter((w: any) => w.status === "running").length;
  const last1h = (checks || []).filter((c: any) => Date.now() - new Date(c.checked_at).getTime() < 3600_000);
  const opensLast24h = (checks || []).filter((c: any) =>
    c.status === "open" && Date.now() - new Date(c.checked_at).getTime() < 86400_000
  ).length;
  const successRate = checks?.length
    ? Math.round((checks.filter((c: any) => c.status !== "error").length / checks.length) * 100)
    : 100;

  const cards = [
    { label: "العمال النشطون", value: runningWorkers, icon: Server, color: "text-blue-400", bg: "bg-blue-500/10" },
    { label: "طوابير تنتظر", value: queueDepth, icon: Database, color: queueDepth > 3 ? "text-red-400" : "text-amber-400", bg: queueDepth > 3 ? "bg-red-500/10" : "bg-amber-500/10" },
    { label: "فحوصات/ساعة", value: last1h.length, icon: Activity, color: "text-primary", bg: "bg-primary/10" },
    { label: "نسبة النجاح", value: `${successRate}%`, icon: ShieldCheck, color: successRate >= 90 ? "text-green-400" : "text-amber-400", bg: successRate >= 90 ? "bg-green-500/10" : "bg-amber-500/10" },
    { label: "اكتشافات (24س)", value: opensLast24h, icon: Zap, color: "text-green-400", bg: "bg-green-500/10" },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-5">
      {cards.map((c, i) => (
        <motion.div
          key={c.label}
          initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}
          className="gradient-card rounded-2xl border border-border/50 p-4"
        >
          <div className={`w-9 h-9 rounded-lg ${c.bg} flex items-center justify-center mb-2`}>
            <c.icon className={`w-4 h-4 ${c.color}`} />
          </div>
          <p className="font-heading text-2xl font-black text-foreground">{c.value}</p>
          <p className="text-[10px] text-muted-foreground mt-0.5">{c.label}</p>
        </motion.div>
      ))}
    </div>
  );
}

// ─────────── Performance Tab ───────────
function PerformanceTab({ workers, checks }: any) {
  const durations = (workers || []).filter((w: any) => w.duration_ms).map((w: any) => w.duration_ms);
  const avg = durations.length ? Math.round(durations.reduce((a: number, b: number) => a + b, 0) / durations.length) : 0;
  const p50 = percentile(durations, 50);
  const p95 = percentile(durations, 95);
  const p99 = percentile(durations, 99);

  // Detection speed: time between consecutive "open" events vs scan interval
  const opens = (checks || [])
    .filter((c: any) => c.status === "open" && c.previous_status && c.previous_status !== "open")
    .slice(0, 20);

  const succ = workers?.length
    ? Math.round(((workers.filter((w: any) => w.status === "completed").length) / workers.length) * 100)
    : 0;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <div className="gradient-card rounded-2xl border border-border/50 p-5">
        <h3 className="font-heading font-bold mb-3 flex items-center gap-2"><Gauge className="w-4 h-4 text-primary" /> زمن الاستجابة</h3>
        <div className="grid grid-cols-4 gap-2 text-center">
          {[
            { l: "متوسط", v: avg, c: "text-blue-400" },
            { l: "p50", v: p50, c: "text-green-400" },
            { l: "p95", v: p95, c: "text-amber-400" },
            { l: "p99", v: p99, c: "text-red-400" },
          ].map(x => (
            <div key={x.l} className="rounded-lg border border-border/30 bg-secondary/20 p-2">
              <p className={`font-bold text-lg ${x.c}`}>{x.v}<span className="text-[10px] mr-1">ms</span></p>
              <p className="text-[10px] text-muted-foreground">{x.l}</p>
            </div>
          ))}
        </div>
        <div className="mt-4 pt-4 border-t border-border/30">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs text-muted-foreground">نسبة نجاح العمال</span>
            <span className={`text-sm font-bold ${succ >= 90 ? "text-green-400" : succ >= 70 ? "text-amber-400" : "text-red-400"}`}>{succ}%</span>
          </div>
          <div className="w-full h-2 rounded-full bg-secondary/50 overflow-hidden">
            <div className={`h-full ${succ >= 90 ? "bg-green-500" : succ >= 70 ? "bg-amber-500" : "bg-red-500"}`} style={{ width: `${succ}%` }} />
          </div>
        </div>
      </div>

      <div className="gradient-card rounded-2xl border border-border/50 p-5">
        <h3 className="font-heading font-bold mb-3 flex items-center gap-2"><TrendingUp className="w-4 h-4 text-primary" /> سرعة الاكتشاف</h3>
        {opens.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-8">لم تُسجَّل اكتشافات حديثة</p>
        ) : (
          <div className="space-y-1.5 max-h-72 overflow-y-auto">
            {opens.map((o: any) => (
              <div key={o.id} className="flex items-center justify-between text-xs p-2 rounded border border-green-500/20 bg-green-500/5">
                <span className="font-bold text-foreground">{o.country_code} — {o.provider}</span>
                <div className="flex items-center gap-2">
                  {o.confidence_score != null && (
                    <Badge variant="outline" className="bg-blue-500/10 text-blue-400 border-blue-500/30 text-[10px]">
                      ثقة {o.confidence_score}%
                    </Badge>
                  )}
                  <span className="text-muted-foreground">{timeAgo(o.checked_at)}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────── Providers Tab ───────────
function ProvidersTab({ checks, priorities }: any) {
  const { data: adapters } = useQuery({
    queryKey: ["provider-adapters"],
    queryFn: async () => (await supabase.from("provider_adapters_config").select("*")).data || [],
  });

  const qc = useQueryClient();

  const stats = useMemo(() => {
    const providers = [...new Set((checks || []).map((c: any) => c.provider))] as string[];
    return providers.map((p) => {
      const pChecks = (checks || []).filter((c: any) => c.provider === p);
      const total = pChecks.length;
      const errors = pChecks.filter((c: any) => c.status === "error").length;
      const opens = pChecks.filter((c: any) => c.status === "open").length;
      const lastSucc = pChecks.find((c: any) => c.status !== "error");
      const lastFail = pChecks.find((c: any) => c.status === "error");
      const reliability = total ? Math.round(((total - errors) / total) * 100) : 0;
      // Ban probability: % of last 20 checks that returned 403/blocked
      const last20 = pChecks.slice(0, 20);
      const banned = last20.filter((c: any) =>
        c.error_message && /403|blocked|forbidden|ban|cloudflare/i.test(c.error_message)
      ).length;
      const banProb = last20.length ? Math.round((banned / last20.length) * 100) : 0;
      const countriesInCooldown = (priorities || []).filter((pr: any) =>
        pr.cooldown_until && new Date(pr.cooldown_until) > new Date()
      ).length;
      return { provider: p, total, errors, opens, reliability, lastSucc, lastFail, banProb, countriesInCooldown };
    });
  }, [checks, priorities]);

  const toggleAdapter = async (id: string, current: boolean) => {
    await supabase.from("provider_adapters_config").update({ is_active: !current }).eq("id", id);
    qc.invalidateQueries({ queryKey: ["provider-adapters"] });
    toast.success(current ? "تم إيقاف المزود" : "تم تفعيل المزود");
  };

  return (
    <div className="space-y-3">
      {stats.map((s) => {
        const adapter = (adapters || []).find((a: any) => a.provider.toLowerCase() === s.provider?.toLowerCase());
        return (
          <div key={s.provider} className="gradient-card rounded-2xl border border-border/50 p-5">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${s.reliability >= 90 ? "bg-green-500/10 text-green-400" : s.reliability >= 70 ? "bg-amber-500/10 text-amber-400" : "bg-red-500/10 text-red-400"}`}>
                  <Wifi className="w-5 h-5" />
                </div>
                <div>
                  <p className="font-heading font-bold text-foreground uppercase">{s.provider}</p>
                  <p className="text-[11px] text-muted-foreground">{s.total} فحص · {s.opens} اكتشاف · {s.errors} خطأ</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {s.banProb > 30 && (
                  <Badge variant="outline" className="bg-red-500/10 text-red-400 border-red-500/30">
                    خطر حظر {s.banProb}%
                  </Badge>
                )}
                {adapter && (
                  <Button size="sm" variant="outline" onClick={() => toggleAdapter(adapter.id, adapter.is_active)}>
                    {adapter.is_active ? <><Pause className="w-3 h-3 ml-1" /> إيقاف</> : <><Play className="w-3 h-3 ml-1" /> تفعيل</>}
                  </Button>
                )}
              </div>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
              <div className="rounded-lg bg-secondary/20 border border-border/30 p-2">
                <p className="text-muted-foreground">الاستقرار</p>
                <p className={`font-bold ${s.reliability >= 90 ? "text-green-400" : s.reliability >= 70 ? "text-amber-400" : "text-red-400"}`}>{s.reliability}%</p>
              </div>
              <div className="rounded-lg bg-secondary/20 border border-border/30 p-2">
                <p className="text-muted-foreground">آخر نجاح</p>
                <p className="font-bold text-green-400">{timeAgo(s.lastSucc?.checked_at)}</p>
              </div>
              <div className="rounded-lg bg-secondary/20 border border-border/30 p-2">
                <p className="text-muted-foreground">آخر فشل</p>
                <p className="font-bold text-red-400">{timeAgo(s.lastFail?.checked_at)}</p>
              </div>
              <div className="rounded-lg bg-secondary/20 border border-border/30 p-2">
                <p className="text-muted-foreground">حد المعدل</p>
                <p className="font-bold text-blue-400">{adapter?.rate_limit_per_minute ?? "—"}/د</p>
              </div>
            </div>
          </div>
        );
      })}
      {stats.length === 0 && <p className="text-sm text-muted-foreground text-center py-8">لا توجد بيانات مزودين بعد</p>}
    </div>
  );
}

// ─────────── Alerts / Incidents Tab ───────────
function AlertsTab({ workers, checks, webhooks, priorities }: any) {
  const incidents = useMemo(() => {
    const list: any[] = [];
    (workers || []).filter((w: any) => w.status === "crashed" || w.status === "timeout").slice(0, 20).forEach((w: any) => {
      list.push({
        id: `w-${w.id}`, severity: "high", type: "Worker Crash",
        title: `${w.worker_id} — ${w.status}`,
        detail: w.error_message || "no message",
        time: w.started_at, payload: w,
      });
    });
    (priorities || []).filter((p: any) => p.cooldown_until && new Date(p.cooldown_until) > new Date()).forEach((p: any) => {
      list.push({
        id: `c-${p.id}`, severity: "medium", type: "Provider Cooldown",
        title: `${p.country_code} في تبريد`,
        detail: `${p.consecutive_failures} فشل متتالي · ${p.ban_detected_count} حظر`,
        time: p.updated_at, payload: p,
      });
    });
    (webhooks || []).filter((w: any) => w.failure_count >= 3).forEach((w: any) => {
      list.push({
        id: `wh-${w.id}`, severity: "medium", type: "Webhook Failing",
        title: w.name, detail: `${w.failure_count} فشل متتالي`,
        time: w.last_failure_at, payload: w,
      });
    });
    (checks || []).filter((c: any) => c.status === "error").slice(0, 20).forEach((c: any) => {
      list.push({
        id: `e-${c.id}`, severity: "low", type: "Check Error",
        title: `${c.country_code} — ${c.provider}`,
        detail: c.error_message || "—", time: c.checked_at, payload: c,
      });
    });
    return list.sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime());
  }, [workers, checks, webhooks, priorities]);

  const [filter, setFilter] = useState("all");
  const [selected, setSelected] = useState<any>(null);
  const filtered = filter === "all" ? incidents : incidents.filter((i) => i.severity === filter);

  const sevConfig: any = {
    high: { color: "bg-red-500/10 text-red-400 border-red-500/30", label: "حرجة" },
    medium: { color: "bg-amber-500/10 text-amber-400 border-amber-500/30", label: "متوسطة" },
    low: { color: "bg-blue-500/10 text-blue-400 border-blue-500/30", label: "منخفضة" },
  };

  return (
    <div className="gradient-card rounded-2xl border border-border/50 p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-heading font-bold flex items-center gap-2"><AlertOctagon className="w-4 h-4 text-primary" /> الحوادث ({filtered.length})</h3>
        <div className="flex gap-1">
          {["all", "high", "medium", "low"].map((f) => (
            <button key={f} onClick={() => setFilter(f)}
              className={`text-[11px] px-2 py-1 rounded ${filter === f ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/70"}`}>
              {f === "all" ? "الكل" : sevConfig[f].label}
            </button>
          ))}
        </div>
      </div>
      <div className="space-y-1.5 max-h-[60vh] overflow-y-auto">
        {filtered.map((inc) => (
          <button key={inc.id} onClick={() => setSelected(inc)}
            className="w-full text-right rounded-lg border border-border/30 bg-secondary/20 p-3 hover:bg-secondary/40 transition-colors">
            <div className="flex items-center justify-between gap-2 mb-1">
              <span className="font-bold text-sm text-foreground">{inc.title}</span>
              <Badge variant="outline" className={`${sevConfig[inc.severity].color} text-[10px]`}>{sevConfig[inc.severity].label}</Badge>
            </div>
            <div className="flex items-center justify-between text-[11px] text-muted-foreground">
              <span>{inc.type} · {inc.detail.slice(0, 80)}</span>
              <span>{timeAgo(inc.time)}</span>
            </div>
          </button>
        ))}
        {filtered.length === 0 && <p className="text-sm text-muted-foreground text-center py-8">لا توجد حوادث</p>}
      </div>

      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>{selected?.title}</DialogTitle></DialogHeader>
          <div className="space-y-2 text-xs">
            <p className="text-muted-foreground">{selected?.type} · {timeAgo(selected?.time)}</p>
            <pre className="rounded bg-secondary/40 p-3 overflow-auto max-h-96 text-[11px]" dir="ltr">
              {JSON.stringify(selected?.payload, null, 2)}
            </pre>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─────────── Recovery Tab ───────────
function RecoveryTab({ workers, priorities }: any) {
  const recovered = (priorities || []).filter((p: any) =>
    p.consecutive_failures === 0 && p.ban_detected_count > 0
  ).length;
  const stuck = (workers || []).filter((w: any) =>
    w.status === "running" && Date.now() - new Date(w.started_at).getTime() > 5 * 60_000
  );
  const dead = (workers || []).filter((w: any) => w.status === "crashed").slice(0, 10);
  const totalCrashes = (workers || []).filter((w: any) => w.status === "crashed" || w.status === "timeout").length;
  const totalRuns = workers?.length || 1;
  const recoveryRate = Math.round(((totalRuns - totalCrashes) / totalRuns) * 100);

  const qc = useQueryClient();
  const forceRetry = async (id: string) => {
    await supabase.from("scan_priorities").update({
      cooldown_until: null, consecutive_failures: 0,
    }).eq("id", id);
    qc.invalidateQueries({ queryKey: ["enterprise-priorities"] });
    toast.success("تم إلغاء التبريد — سيُعاد الفحص فوراً");
  };

  const killStuck = async (id: string) => {
    await supabase.from("worker_health").update({
      status: "timeout", finished_at: new Date().toISOString(),
      error_message: "Killed manually by admin",
    }).eq("id", id);
    qc.invalidateQueries({ queryKey: ["enterprise-workers"] });
    toast.success("تم إنهاء العامل");
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <div className="gradient-card rounded-2xl border border-border/50 p-5">
        <h3 className="font-heading font-bold mb-3 flex items-center gap-2"><RefreshCw className="w-4 h-4 text-primary" /> فعالية الاسترداد</h3>
        <div className="text-center py-4">
          <p className={`font-heading text-4xl font-black ${recoveryRate >= 90 ? "text-green-400" : recoveryRate >= 70 ? "text-amber-400" : "text-red-400"}`}>{recoveryRate}%</p>
          <p className="text-xs text-muted-foreground mt-1">معدل النجاح الإجمالي</p>
        </div>
        <div className="grid grid-cols-2 gap-2 text-center text-xs">
          <div className="rounded-lg bg-green-500/10 border border-green-500/30 p-2">
            <p className="font-bold text-green-400">{recovered}</p>
            <p className="text-[10px] text-muted-foreground">مُسترَدّة تلقائياً</p>
          </div>
          <div className="rounded-lg bg-red-500/10 border border-red-500/30 p-2">
            <p className="font-bold text-red-400">{totalCrashes}</p>
            <p className="text-[10px] text-muted-foreground">حوادث كلية</p>
          </div>
        </div>
      </div>

      <div className="gradient-card rounded-2xl border border-border/50 p-5">
        <h3 className="font-heading font-bold mb-3 flex items-center gap-2"><Clock className="w-4 h-4 text-amber-400" /> عمال عالقون ({stuck.length})</h3>
        <div className="space-y-1.5 max-h-64 overflow-y-auto">
          {stuck.map((w: any) => (
            <div key={w.id} className="flex items-center justify-between text-xs p-2 rounded border border-amber-500/30 bg-amber-500/5">
              <div className="flex-1 min-w-0">
                <code className="text-[10px]">{w.worker_id}</code>
                <p className="text-[10px] text-muted-foreground">منذ {timeAgo(w.started_at)}</p>
              </div>
              <Button size="sm" variant="outline" onClick={() => killStuck(w.id)}>إنهاء</Button>
            </div>
          ))}
          {stuck.length === 0 && <p className="text-xs text-muted-foreground text-center py-4">لا يوجد عمال عالقون</p>}
        </div>
      </div>

      <div className="gradient-card rounded-2xl border border-border/50 p-5">
        <h3 className="font-heading font-bold mb-3 flex items-center gap-2"><XCircle className="w-4 h-4 text-red-400" /> آخر الفشل</h3>
        <div className="space-y-1.5 max-h-64 overflow-y-auto">
          {dead.map((w: any) => (
            <div key={w.id} className="text-xs p-2 rounded border border-red-500/20 bg-red-500/5">
              <p className="font-bold text-foreground truncate">{w.worker_id}</p>
              <p className="text-[10px] text-red-400/70 truncate">{w.error_message || "—"}</p>
              <p className="text-[10px] text-muted-foreground">{timeAgo(w.started_at)}</p>
            </div>
          ))}
          {dead.length === 0 && <p className="text-xs text-muted-foreground text-center py-4">لا يوجد فشل مُسجَّل</p>}
        </div>
      </div>

      <div className="lg:col-span-3 gradient-card rounded-2xl border border-border/50 p-5">
        <h3 className="font-heading font-bold mb-3 flex items-center gap-2"><Play className="w-4 h-4 text-primary" /> إعادة تشغيل مهام في التبريد</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
          {(priorities || []).filter((p: any) => p.cooldown_until && new Date(p.cooldown_until) > new Date()).map((p: any) => (
            <div key={p.id} className="flex items-center justify-between p-2 rounded-lg border border-amber-500/30 bg-amber-500/5 text-xs">
              <span><b>{p.country_code}</b> · حتى {new Date(p.cooldown_until).toLocaleTimeString("ar-DZ")}</span>
              <Button size="sm" variant="outline" onClick={() => forceRetry(p.id)}>الآن</Button>
            </div>
          ))}
          {!(priorities || []).some((p: any) => p.cooldown_until && new Date(p.cooldown_until) > new Date()) && (
            <p className="text-xs text-muted-foreground col-span-full text-center py-4">لا توجد مهام في التبريد</p>
          )}
        </div>
      </div>
    </div>
  );
}

// ─────────── Control Tab (priorities + manual scan) ───────────
function ControlTab({ priorities }: any) {
  const qc = useQueryClient();
  const [intervals, setIntervals] = useState<Record<string, number>>({});
  const [running, setRunning] = useState(false);

  const update = async (id: string, patch: any) => {
    await supabase.from("scan_priorities").update(patch).eq("id", id);
    qc.invalidateQueries({ queryKey: ["enterprise-priorities"] });
    toast.success("تم");
  };

  const triggerScan = async () => {
    setRunning(true);
    try {
      const { error } = await supabase.functions.invoke("monitor-visa-sites");
      if (error) throw error;
      toast.success("✅ تم تشغيل دورة فحص يدوية");
      qc.invalidateQueries();
    } catch (e: any) {
      toast.error(e?.message || "فشل التشغيل");
    } finally { setRunning(false); }
  };

  return (
    <div className="space-y-4">
      <div className="gradient-card rounded-2xl border border-border/50 p-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="font-heading font-bold">تشغيل دورة فحص فورية</h3>
          <p className="text-xs text-muted-foreground mt-1">يتجاوز الفترات الزمنية وينفّذ فحصاً واحداً لكل الدول النشطة</p>
        </div>
        <Button onClick={triggerScan} disabled={running}>
          {running ? <RefreshCw className="w-4 h-4 ml-1 animate-spin" /> : <Zap className="w-4 h-4 ml-1" />}
          {running ? "جارٍ التشغيل..." : "تشغيل الآن"}
        </Button>
      </div>

      <div className="gradient-card rounded-2xl border border-border/50 p-5">
        <h3 className="font-heading font-bold mb-3">سرعة الفحص والأولويات</h3>
        <div className="space-y-2">
          {(priorities || []).map((p: any) => (
            <div key={p.id} className="rounded-lg border border-border/30 bg-secondary/20 p-3">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <span className="font-bold text-sm">{p.country_code}</span>
                <div className="flex items-center gap-2 flex-wrap">
                  <select value={p.priority} onChange={(e) => update(p.id, { priority: e.target.value })}
                    className="text-xs rounded border border-border/50 bg-background px-2 py-1">
                    <option value="high">عالية</option>
                    <option value="medium">متوسطة</option>
                    <option value="low">منخفضة</option>
                    <option value="paused">متوقفة</option>
                  </select>
                  <Input type="number" className="w-20 h-8 text-xs"
                    defaultValue={p.current_interval_seconds}
                    onChange={(e) => setIntervals((s) => ({ ...s, [p.id]: parseInt(e.target.value) || p.current_interval_seconds }))} />
                  <span className="text-[10px] text-muted-foreground">ثانية</span>
                  <Button size="sm" variant="outline"
                    onClick={() => update(p.id, { current_interval_seconds: intervals[p.id] ?? p.current_interval_seconds })}>
                    حفظ
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─────────── Webhooks Tab (unchanged from previous) ───────────
function WebhooksTab() {
  const qc = useQueryClient();
  const [openDlg, setOpenDlg] = useState(false);
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [secret, setSecret] = useState("");
  const [countries, setCountries] = useState("");

  const { data: webhooks } = useQuery({
    queryKey: ["enterprise-webhooks"],
    queryFn: async () => (await supabase.from("outbound_webhooks").select("*").order("created_at", { ascending: false })).data || [],
  });
  const { data: logs } = useQuery({
    queryKey: ["enterprise-webhook-logs"],
    queryFn: async () => (await supabase.from("webhook_delivery_log").select("*").order("delivered_at", { ascending: false }).limit(30)).data || [],
    refetchInterval: 20000,
  });

  const create = async () => {
    if (!name.trim() || !url.trim()) { toast.error("الاسم والرابط مطلوبان"); return; }
    const { error } = await supabase.from("outbound_webhooks").insert({
      name: name.trim(), url: url.trim(), secret: secret.trim() || null,
      countries: countries.split(",").map((s) => s.trim().toUpperCase()).filter(Boolean),
      event_types: ["visa_opened"],
    });
    if (error) { toast.error(error.message); return; }
    toast.success("تم إنشاء الـ webhook");
    setOpenDlg(false); setName(""); setUrl(""); setSecret(""); setCountries("");
    qc.invalidateQueries({ queryKey: ["enterprise-webhooks"] });
  };
  const remove = async (id: string) => {
    if (!confirm("حذف هذا الـ webhook؟")) return;
    await supabase.from("outbound_webhooks").delete().eq("id", id);
    qc.invalidateQueries({ queryKey: ["enterprise-webhooks"] });
  };
  const toggle = async (id: string, current: boolean) => {
    await supabase.from("outbound_webhooks").update({ is_active: !current }).eq("id", id);
    qc.invalidateQueries({ queryKey: ["enterprise-webhooks"] });
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <div className="lg:col-span-2 gradient-card rounded-2xl border border-border/50 p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-heading font-bold flex items-center gap-2"><Webhook className="w-4 h-4 text-primary" /> Webhooks الصادرة</h3>
          <Dialog open={openDlg} onOpenChange={setOpenDlg}>
            <DialogTrigger asChild><Button size="sm"><Plus className="w-3 h-3 ml-1" /> جديد</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>إضافة Webhook جديد</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div><Label>الاسم</Label><Input value={name} onChange={(e) => setName(e.target.value)} /></div>
                <div><Label>الرابط</Label><Input value={url} onChange={(e) => setUrl(e.target.value)} dir="ltr" /></div>
                <div><Label>سر HMAC (اختياري)</Label><Input value={secret} onChange={(e) => setSecret(e.target.value)} dir="ltr" /></div>
                <div><Label>الدول (فارغ = الكل)</Label><Input value={countries} onChange={(e) => setCountries(e.target.value)} placeholder="IT, FR" dir="ltr" /></div>
              </div>
              <DialogFooter><Button onClick={create}>إنشاء</Button></DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
        <div className="space-y-2">
          {(webhooks || []).map((w: any) => (
            <div key={w.id} className="rounded-lg border border-border/30 bg-secondary/20 p-3 flex items-center justify-between gap-2">
              <div className="flex-1 min-w-0">
                <p className="font-bold text-sm">{w.name}</p>
                <code className="text-[10px] text-muted-foreground truncate block" dir="ltr">{w.url}</code>
                <div className="flex items-center gap-2 mt-1 text-[10px] text-muted-foreground">
                  <span>{w.countries?.join(", ") || "كل الدول"}</span>
                  {w.failure_count > 0 && <span className="text-red-400">فشل {w.failure_count}</span>}
                </div>
              </div>
              <button onClick={() => toggle(w.id, w.is_active)} className={`text-xs px-2 py-1 rounded ${w.is_active ? "bg-green-500/10 text-green-400" : "bg-muted text-muted-foreground"}`}>
                {w.is_active ? "نشط" : "متوقف"}
              </button>
              <button onClick={() => remove(w.id)} className="p-1 text-red-400 hover:bg-red-500/10 rounded"><Trash2 className="w-3.5 h-3.5" /></button>
            </div>
          ))}
          {(webhooks || []).length === 0 && <p className="text-xs text-muted-foreground text-center py-4">لا توجد webhooks</p>}
        </div>
      </div>

      <div className="gradient-card rounded-2xl border border-border/50 p-5">
        <h3 className="font-heading font-bold mb-3">سجل التسليم</h3>
        <div className="space-y-1 max-h-[60vh] overflow-y-auto">
          {(logs || []).map((l: any) => (
            <div key={l.id} className="flex items-center justify-between text-[11px] p-1.5 rounded bg-secondary/10">
              <span className="flex items-center gap-1.5">
                {l.success ? <CheckCircle2 className="w-3 h-3 text-green-400" /> : <XCircle className="w-3 h-3 text-red-400" />}
                {l.event_type}
              </span>
              <span className="text-muted-foreground">{l.response_status ?? "—"} · {timeAgo(l.delivered_at)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─────────── Main Page ───────────
export default function AdminEnterpriseMonitor() {
  const qc = useQueryClient();

  const { data: workers } = useQuery({
    queryKey: ["enterprise-workers"],
    queryFn: async () => (await supabase.from("worker_health").select("*").order("started_at", { ascending: false }).limit(100)).data || [],
    refetchInterval: 15000,
  });
  const { data: checks } = useQuery({
    queryKey: ["enterprise-checks"],
    queryFn: async () => (await supabase.from("visa_monitor_checks").select("*").order("checked_at", { ascending: false }).limit(300)).data || [],
    refetchInterval: 20000,
  });
  const { data: priorities } = useQuery({
    queryKey: ["enterprise-priorities"],
    queryFn: async () => (await supabase.from("scan_priorities").select("*").order("country_code")).data || [],
    refetchInterval: 30000,
  });
  const { data: webhooks } = useQuery({
    queryKey: ["enterprise-webhooks-overview"],
    queryFn: async () => (await supabase.from("outbound_webhooks").select("*")).data || [],
    refetchInterval: 30000,
  });

  // Realtime subscriptions
  useEffect(() => {
    const ch = supabase
      .channel("enterprise-monitor-rt")
      .on("postgres_changes", { event: "*", schema: "public", table: "worker_health" }, () => {
        qc.invalidateQueries({ queryKey: ["enterprise-workers"] });
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "visa_monitor_checks" }, () => {
        qc.invalidateQueries({ queryKey: ["enterprise-checks"] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "scan_priorities" }, () => {
        qc.invalidateQueries({ queryKey: ["enterprise-priorities"] });
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "webhook_delivery_log" }, () => {
        qc.invalidateQueries({ queryKey: ["enterprise-webhook-logs"] });
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [qc]);

  return (
    <AdminLayout title="Enterprise Dashboard" subtitle="مراقبة شاملة لصحة النظام، الأداء، والاسترداد التلقائي">
      <SystemHealthBanner workers={workers} priorities={priorities} webhooks={webhooks} checks={checks} />
      <OverviewKpis workers={workers} checks={checks} priorities={priorities} />

      <Tabs defaultValue="performance" className="w-full">
        <TabsList className="w-full flex flex-wrap h-auto gap-1">
          <TabsTrigger value="performance">الأداء</TabsTrigger>
          <TabsTrigger value="providers">المزودون</TabsTrigger>
          <TabsTrigger value="alerts">التنبيهات</TabsTrigger>
          <TabsTrigger value="recovery">الاسترداد</TabsTrigger>
          <TabsTrigger value="webhooks">Webhooks</TabsTrigger>
          <TabsTrigger value="control">التحكم</TabsTrigger>
        </TabsList>

        <TabsContent value="performance" className="mt-4"><PerformanceTab workers={workers} checks={checks} /></TabsContent>
        <TabsContent value="providers" className="mt-4"><ProvidersTab checks={checks} priorities={priorities} /></TabsContent>
        <TabsContent value="alerts" className="mt-4"><AlertsTab workers={workers} checks={checks} webhooks={webhooks} priorities={priorities} /></TabsContent>
        <TabsContent value="recovery" className="mt-4"><RecoveryTab workers={workers} priorities={priorities} /></TabsContent>
        <TabsContent value="webhooks" className="mt-4"><WebhooksTab /></TabsContent>
        <TabsContent value="control" className="mt-4"><ControlTab priorities={priorities} /></TabsContent>
      </Tabs>
    </AdminLayout>
  );
}