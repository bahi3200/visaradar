import { useState } from "react";
import AdminLayout from "@/components/AdminLayout";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
import {
  Activity, Server, Webhook, AlertTriangle, ShieldAlert, Plus, Trash2, CheckCircle2, XCircle, Clock,
} from "lucide-react";
import { toast } from "sonner";

function timeAgo(s: string | null) {
  if (!s) return "—";
  const m = Math.floor((Date.now() - new Date(s).getTime()) / 60000);
  if (m < 1) return "الآن";
  if (m < 60) return `منذ ${m}د`;
  const h = Math.floor(m / 60);
  if (h < 24) return `منذ ${h}س`;
  return `منذ ${Math.floor(h / 24)} يوم`;
}

function WorkersHealthCard() {
  const { data: workers } = useQuery({
    queryKey: ["worker-health"],
    queryFn: async () => {
      const { data } = await supabase
        .from("worker_health")
        .select("*")
        .order("started_at", { ascending: false })
        .limit(30);
      return data || [];
    },
    refetchInterval: 15000,
  });

  const recent = workers || [];
  const running = recent.filter((w: any) => w.status === "running").length;
  const completed = recent.filter((w: any) => w.status === "completed").length;
  const crashed = recent.filter((w: any) => w.status === "crashed" || w.status === "timeout").length;
  const avgDuration = recent.filter((w: any) => w.duration_ms).reduce((a: number, w: any) => a + w.duration_ms, 0) / Math.max(1, recent.filter((w: any) => w.duration_ms).length);

  return (
    <div className="gradient-card rounded-2xl border border-border/50 p-5">
      <h2 className="font-heading text-base font-bold flex items-center gap-2 mb-4">
        <Server className="w-4 h-4 text-primary" /> صحة العمال (Workers)
      </h2>
      <div className="grid grid-cols-4 gap-2 mb-4 text-center">
        <div className="rounded-lg bg-blue-500/10 border border-blue-500/30 p-2">
          <p className="font-bold text-lg text-blue-400">{running}</p>
          <p className="text-[10px] text-muted-foreground">قيد التشغيل</p>
        </div>
        <div className="rounded-lg bg-green-500/10 border border-green-500/30 p-2">
          <p className="font-bold text-lg text-green-400">{completed}</p>
          <p className="text-[10px] text-muted-foreground">مكتملة</p>
        </div>
        <div className="rounded-lg bg-red-500/10 border border-red-500/30 p-2">
          <p className="font-bold text-lg text-red-400">{crashed}</p>
          <p className="text-[10px] text-muted-foreground">فشل</p>
        </div>
        <div className="rounded-lg bg-amber-500/10 border border-amber-500/30 p-2">
          <p className="font-bold text-lg text-amber-400">{Math.round(avgDuration)}ms</p>
          <p className="text-[10px] text-muted-foreground">متوسط المدة</p>
        </div>
      </div>
      <div className="space-y-1 max-h-64 overflow-y-auto">
        {recent.slice(0, 10).map((w: any) => (
          <div key={w.id} className="flex items-center justify-between text-xs p-2 rounded border border-border/30 bg-secondary/20">
            <code className="text-[10px] text-muted-foreground">{w.worker_id}</code>
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">{w.checks_succeeded}/{w.checks_attempted}</span>
              <Badge variant="outline" className={
                w.status === "completed" ? "bg-green-500/10 text-green-400 border-green-500/30" :
                w.status === "crashed" ? "bg-red-500/10 text-red-400 border-red-500/30" :
                "bg-blue-500/10 text-blue-400 border-blue-500/30"
              }>{w.status}</Badge>
              <span className="text-[10px] text-muted-foreground">{timeAgo(w.started_at)}</span>
            </div>
          </div>
        ))}
        {recent.length === 0 && <p className="text-xs text-muted-foreground text-center py-4">لا توجد بيانات بعد</p>}
      </div>
    </div>
  );
}

function ScanPrioritiesCard() {
  const qc = useQueryClient();
  const { data: priorities } = useQuery({
    queryKey: ["scan-priorities"],
    queryFn: async () => {
      const { data } = await supabase.from("scan_priorities").select("*").order("country_code");
      return data || [];
    },
    refetchInterval: 30000,
  });

  const updatePri = async (id: string, patch: any) => {
    const { error } = await supabase.from("scan_priorities").update(patch).eq("id", id);
    if (error) toast.error(error.message); else { toast.success("تم التحديث"); qc.invalidateQueries({ queryKey: ["scan-priorities"] }); }
  };

  return (
    <div className="gradient-card rounded-2xl border border-border/50 p-5">
      <h2 className="font-heading text-base font-bold flex items-center gap-2 mb-4">
        <Activity className="w-4 h-4 text-primary" /> أولويات الفحص
      </h2>
      <div className="space-y-2">
        {(priorities || []).map((p: any) => (
          <div key={p.id} className="rounded-lg border border-border/30 bg-secondary/20 p-3">
            <div className="flex items-center justify-between mb-2">
              <span className="font-bold text-sm">{p.country_code}</span>
              <select
                value={p.priority}
                onChange={(e) => updatePri(p.id, { priority: e.target.value })}
                className="text-xs rounded border border-border/50 bg-background px-2 py-1"
              >
                <option value="high">عالية</option>
                <option value="medium">متوسطة</option>
                <option value="low">منخفضة</option>
                <option value="paused">متوقفة</option>
              </select>
            </div>
            <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
              <span>كل {p.current_interval_seconds}s</span>
              <span>آخر فحص: {timeAgo(p.last_scanned_at)}</span>
              {p.consecutive_failures > 0 && (
                <span className="text-red-400">فشل: {p.consecutive_failures}</span>
              )}
              {p.cooldown_until && new Date(p.cooldown_until) > new Date() && (
                <span className="text-amber-400 flex items-center gap-1">
                  <Clock className="w-3 h-3" /> تبريد حتى {new Date(p.cooldown_until).toLocaleTimeString("ar-DZ")}
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function WebhooksCard() {
  const qc = useQueryClient();
  const [openDlg, setOpenDlg] = useState(false);
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [secret, setSecret] = useState("");
  const [countries, setCountries] = useState("");

  const { data: webhooks } = useQuery({
    queryKey: ["outbound-webhooks"],
    queryFn: async () => {
      const { data } = await supabase.from("outbound_webhooks").select("*").order("created_at", { ascending: false });
      return data || [];
    },
  });

  const { data: logs } = useQuery({
    queryKey: ["webhook-logs"],
    queryFn: async () => {
      const { data } = await supabase.from("webhook_delivery_log").select("*").order("delivered_at", { ascending: false }).limit(20);
      return data || [];
    },
    refetchInterval: 20000,
  });

  const create = async () => {
    if (!name.trim() || !url.trim()) { toast.error("الاسم والرابط مطلوبان"); return; }
    const { error } = await supabase.from("outbound_webhooks").insert({
      name: name.trim(),
      url: url.trim(),
      secret: secret.trim() || null,
      countries: countries.split(",").map(s => s.trim().toUpperCase()).filter(Boolean),
      event_types: ["visa_opened"],
    });
    if (error) { toast.error(error.message); return; }
    toast.success("تم إنشاء الـ webhook");
    setOpenDlg(false); setName(""); setUrl(""); setSecret(""); setCountries("");
    qc.invalidateQueries({ queryKey: ["outbound-webhooks"] });
  };

  const remove = async (id: string) => {
    if (!confirm("حذف هذا الـ webhook؟")) return;
    const { error } = await supabase.from("outbound_webhooks").delete().eq("id", id);
    if (error) toast.error(error.message); else { toast.success("تم الحذف"); qc.invalidateQueries({ queryKey: ["outbound-webhooks"] }); }
  };

  const toggle = async (id: string, current: boolean) => {
    await supabase.from("outbound_webhooks").update({ is_active: !current }).eq("id", id);
    qc.invalidateQueries({ queryKey: ["outbound-webhooks"] });
  };

  return (
    <div className="gradient-card rounded-2xl border border-border/50 p-5 lg:col-span-2">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-heading text-base font-bold flex items-center gap-2">
          <Webhook className="w-4 h-4 text-primary" /> Webhooks الصادرة
        </h2>
        <Dialog open={openDlg} onOpenChange={setOpenDlg}>
          <DialogTrigger asChild>
            <Button size="sm"><Plus className="w-3 h-3 ml-1" /> جديد</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>إضافة Webhook جديد</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div><Label>الاسم</Label><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="مثال: Zapier production" /></div>
              <div><Label>الرابط (URL)</Label><Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://..." dir="ltr" /></div>
              <div><Label>سر التوقيع (اختياري)</Label><Input value={secret} onChange={(e) => setSecret(e.target.value)} placeholder="HMAC secret" dir="ltr" /></div>
              <div><Label>الدول (مفصولة بفواصل، فارغ = جميع الدول)</Label><Input value={countries} onChange={(e) => setCountries(e.target.value)} placeholder="IT, FR, ES" dir="ltr" /></div>
            </div>
            <DialogFooter><Button onClick={create}>إنشاء</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="space-y-2 mb-5">
        {(webhooks || []).map((w: any) => (
          <div key={w.id} className="rounded-lg border border-border/30 bg-secondary/20 p-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex-1 min-w-0">
                <p className="font-bold text-sm">{w.name}</p>
                <code className="text-[10px] text-muted-foreground truncate block" dir="ltr">{w.url}</code>
                <div className="flex items-center gap-2 mt-1 text-[10px] text-muted-foreground">
                  <span>الدول: {w.countries?.join(", ") || "كل الدول"}</span>
                  {w.failure_count > 0 && <span className="text-red-400">فشل: {w.failure_count}</span>}
                  {w.last_success_at && <span className="text-green-400">آخر نجاح: {timeAgo(w.last_success_at)}</span>}
                </div>
              </div>
              <button onClick={() => toggle(w.id, w.is_active)} className={`text-xs px-2 py-1 rounded ${w.is_active ? "bg-green-500/10 text-green-400" : "bg-muted text-muted-foreground"}`}>
                {w.is_active ? "نشط" : "متوقف"}
              </button>
              <button onClick={() => remove(w.id)} className="p-1 text-red-400 hover:bg-red-500/10 rounded"><Trash2 className="w-3.5 h-3.5" /></button>
            </div>
          </div>
        ))}
        {(webhooks || []).length === 0 && <p className="text-xs text-muted-foreground text-center py-4">لا توجد webhooks بعد</p>}
      </div>

      <h3 className="text-xs font-bold mb-2 text-muted-foreground">آخر عمليات التسليم</h3>
      <div className="space-y-1 max-h-48 overflow-y-auto">
        {(logs || []).slice(0, 10).map((l: any) => (
          <div key={l.id} className="flex items-center justify-between text-[11px] p-1.5 rounded bg-secondary/10">
            <span className="flex items-center gap-1.5">
              {l.success ? <CheckCircle2 className="w-3 h-3 text-green-400" /> : <XCircle className="w-3 h-3 text-red-400" />}
              {l.event_type}
            </span>
            <span className="text-muted-foreground">
              {l.response_status ?? "—"} · {timeAgo(l.delivered_at)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function FalsePositivesCard() {
  const { data: reports } = useQuery({
    queryKey: ["false-positives"],
    queryFn: async () => {
      const { data } = await supabase.from("false_positive_reports").select("*").order("created_at", { ascending: false }).limit(20);
      return data || [];
    },
  });

  const total = reports?.length || 0;
  const unresolved = reports?.filter((r: any) => !r.resolved).length || 0;

  return (
    <div className="gradient-card rounded-2xl border border-border/50 p-5">
      <h2 className="font-heading text-base font-bold flex items-center gap-2 mb-4">
        <AlertTriangle className="w-4 h-4 text-primary" /> بلاغات False Positive
      </h2>
      <div className="grid grid-cols-2 gap-2 mb-4 text-center">
        <div className="rounded-lg bg-amber-500/10 border border-amber-500/30 p-2">
          <p className="font-bold text-xl text-amber-400">{total}</p>
          <p className="text-[10px] text-muted-foreground">إجمالي البلاغات</p>
        </div>
        <div className="rounded-lg bg-red-500/10 border border-red-500/30 p-2">
          <p className="font-bold text-xl text-red-400">{unresolved}</p>
          <p className="text-[10px] text-muted-foreground">غير محلولة</p>
        </div>
      </div>
      <div className="space-y-1 max-h-48 overflow-y-auto">
        {(reports || []).slice(0, 8).map((r: any) => (
          <div key={r.id} className="text-xs p-2 rounded border border-border/30 bg-secondary/20">
            <div className="flex items-center justify-between">
              <span className="font-bold">{r.country_code} — {r.provider}</span>
              <Badge variant="outline" className={r.resolved ? "bg-green-500/10 text-green-400 border-green-500/30" : "bg-amber-500/10 text-amber-400 border-amber-500/30"}>
                {r.resolved ? "محلول" : "قيد المراجعة"}
              </Badge>
            </div>
            {r.reason && <p className="text-[10px] text-muted-foreground mt-1">{r.reason}</p>}
          </div>
        ))}
        {total === 0 && <p className="text-xs text-muted-foreground text-center py-4">لا توجد بلاغات</p>}
      </div>
    </div>
  );
}

export default function AdminEnterpriseMonitor() {
  return (
    <AdminLayout title="مراقبة Enterprise" subtitle="حالة Workers، Webhooks، أولويات الفحص، وبلاغات الجودة">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <WorkersHealthCard />
        <ScanPrioritiesCard />
        <WebhooksCard />
        <FalsePositivesCard />
      </div>
    </AdminLayout>
  );
}