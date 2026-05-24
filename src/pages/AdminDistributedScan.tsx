import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

type Stats = {
  active_workers: number; pending_tasks: number; running_tasks: number;
  done_last_minute: number; failed_last_minute: number;
  avg_latency_ms: number | null; p95_latency_ms: number | null;
  burst_active_tasks: number;
};

type Worker = {
  id: string; worker_id: string; status: string; current_load: number;
  tasks_completed: number; tasks_failed: number;
  last_heartbeat: string; started_at: string; region: string | null;
};

type Task = {
  id: string; country_code: string; provider: string | null; status: string;
  is_burst: boolean; priority: number; claimed_by: string | null;
  latency_ms: number | null; finished_at: string | null; error: string | null;
};

export default function AdminDistributedScan() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const [s, w, t] = await Promise.all([
      supabase.rpc("get_scan_throughput_stats" as any),
      supabase.from("scan_workers").select("*").order("last_heartbeat", { ascending: false }).limit(50),
      supabase.from("scan_tasks").select("*").order("enqueued_at", { ascending: false }).limit(50),
    ]);
    setStats((Array.isArray(s.data) ? s.data[0] : s.data) as any);
    setWorkers((w.data as any) || []);
    setTasks((t.data as any) || []);
  };

  useEffect(() => { load(); const i = setInterval(load, 5000); return () => clearInterval(i); }, []);

  const trigger = async (burst: boolean, workersN?: number) => {
    setBusy(true);
    const { data, error } = await supabase.functions.invoke("scan-orchestrator", {
      body: { burst, workers: workersN },
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success(`Dispatched ${(data as any)?.workers_dispatched ?? 0} workers · enqueued ${(data as any)?.enqueued ?? 0}`);
    load();
  };

  const statusColor = (s: string) =>
    s === 'done' ? 'bg-green-500/15 text-green-700 dark:text-green-400' :
    s === 'failed' || s === 'expired' ? 'bg-red-500/15 text-red-700 dark:text-red-400' :
    s === 'pending' ? 'bg-yellow-500/15 text-yellow-700 dark:text-yellow-400' :
    'bg-blue-500/15 text-blue-700 dark:text-blue-400';

  return (
    <div className="container mx-auto p-6 space-y-6" dir="rtl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-bold">المسح المتوازي الموزّع</h1>
        <div className="flex gap-2">
          <Button onClick={() => trigger(false)} disabled={busy}>تشغيل عادي</Button>
          <Button onClick={() => trigger(true, 12)} disabled={busy} variant="default">
            وضع Burst (12 worker)
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card><CardContent className="p-4">
          <div className="text-sm text-muted-foreground">Workers نشطة</div>
          <div className="text-3xl font-bold">{stats?.active_workers ?? "—"}</div>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <div className="text-sm text-muted-foreground">قيد الانتظار / قيد التنفيذ</div>
          <div className="text-3xl font-bold">{stats?.pending_tasks ?? 0} / {stats?.running_tasks ?? 0}</div>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <div className="text-sm text-muted-foreground">Throughput (1 دقيقة)</div>
          <div className="text-3xl font-bold text-green-600">
            {stats?.done_last_minute ?? 0}
            {stats && stats.failed_last_minute > 0 && (
              <span className="text-red-600 text-lg"> / {stats.failed_last_minute} fail</span>
            )}
          </div>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <div className="text-sm text-muted-foreground">Latency (avg / p95)</div>
          <div className="text-3xl font-bold">
            {stats?.avg_latency_ms ? `${stats.avg_latency_ms}ms` : "—"}
            <span className="text-base text-muted-foreground"> / {stats?.p95_latency_ms ?? "—"}ms</span>
          </div>
        </CardContent></Card>
      </div>

      {stats && stats.burst_active_tasks > 0 && (
        <Card className="border-amber-500/40 bg-amber-500/5">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <div className="font-semibold text-amber-700 dark:text-amber-400">⚡ Burst Mode نشط</div>
              <div className="text-sm text-muted-foreground">{stats.burst_active_tasks} مهمة burst قيد المعالجة</div>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader><CardTitle>Workers ({workers.length})</CardTitle></CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-right text-muted-foreground border-b">
                <tr>
                  <th className="p-2">Worker ID</th>
                  <th className="p-2">الحالة</th>
                  <th className="p-2">منجز</th>
                  <th className="p-2">فاشل</th>
                  <th className="p-2">آخر نبضة</th>
                </tr>
              </thead>
              <tbody>
                {workers.map(w => (
                  <tr key={w.id} className="border-b">
                    <td className="p-2 font-mono text-xs">{w.worker_id}</td>
                    <td className="p-2"><Badge variant={w.status==='busy'?'default':'outline'}>{w.status}</Badge></td>
                    <td className="p-2 text-green-600">{w.tasks_completed}</td>
                    <td className="p-2 text-red-600">{w.tasks_failed}</td>
                    <td className="p-2">{new Date(w.last_heartbeat).toLocaleTimeString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>آخر 50 مهمة</CardTitle></CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-right text-muted-foreground border-b">
                <tr>
                  <th className="p-2">البلد</th>
                  <th className="p-2">المزوّد</th>
                  <th className="p-2">الأولوية</th>
                  <th className="p-2">الحالة</th>
                  <th className="p-2">Latency</th>
                  <th className="p-2">Worker</th>
                </tr>
              </thead>
              <tbody>
                {tasks.map(t => (
                  <tr key={t.id} className="border-b">
                    <td className="p-2 font-semibold">{t.country_code}</td>
                    <td className="p-2">{t.provider || "—"}</td>
                    <td className="p-2">{t.priority}{t.is_burst && " ⚡"}</td>
                    <td className="p-2"><Badge className={statusColor(t.status)}>{t.status}</Badge></td>
                    <td className="p-2">{t.latency_ms ? `${t.latency_ms}ms` : "—"}</td>
                    <td className="p-2 font-mono text-xs">{t.claimed_by || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}