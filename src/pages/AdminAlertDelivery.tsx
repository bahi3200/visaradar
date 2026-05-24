import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

type Stats = {
  pending_total: number; pending_p0: number; pending_p1: number;
  delivered_last_minute: number; failed_last_minute: number;
  sends_per_second: number;
  p50_latency_ms: number | null; p95_latency_ms: number | null; p99_latency_ms: number | null;
  failure_rate_pct: number; active_workers: number;
};

type LogRow = {
  id: number; chat_id: string; priority: number; success: boolean;
  e2e_latency_ms: number | null; delivered_at: string; error: string | null;
  country_code: string | null; provider: string | null; worker_id: string | null;
};

const PRIORITY_LABEL: Record<number, string> = { 0: 'P0 ⚡', 1: 'P1', 2: 'P2', 3: 'P3' };
const PRIORITY_COLOR: Record<number, string> = {
  0: 'bg-red-500/15 text-red-700 dark:text-red-400',
  1: 'bg-orange-500/15 text-orange-700 dark:text-orange-400',
  2: 'bg-blue-500/15 text-blue-700 dark:text-blue-400',
  3: 'bg-muted text-muted-foreground',
};

export default function AdminAlertDelivery() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [logs, setLogs] = useState<LogRow[]>([]);
  const [testChat, setTestChat] = useState("");

  const load = async () => {
    const [s, l] = await Promise.all([
      supabase.rpc("get_alert_delivery_stats" as any),
      supabase.from("alert_delivery_log").select("*").order("delivered_at", { ascending: false }).limit(50),
    ]);
    setStats((Array.isArray(s.data) ? s.data[0] : s.data) as any);
    setLogs((l.data as any) || []);
  };

  useEffect(() => { load(); const i = setInterval(load, 3000); return () => clearInterval(i); }, []);

  // Realtime: refresh on every new delivery log row
  useEffect(() => {
    const ch = supabase.channel('alert_delivery_log')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'alert_delivery_log' }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  const sendTest = async () => {
    if (!testChat.trim()) return toast.error("أدخل chat_id");
    const { data, error } = await supabase.functions.invoke("alert-dispatcher", {
      body: {
        chat_ids: [testChat.trim()], priority: 0,
        text: `⚡ Ultra-fast test · ${new Date().toLocaleTimeString()}`,
      },
    });
    if (error) return toast.error(error.message);
    toast.success(`Sent in ${(data as any)?.latency_ms}ms`);
    load();
  };

  return (
    <div className="container mx-auto p-6 space-y-6" dir="rtl">
      <h1 className="text-3xl font-bold">تسليم التنبيهات فائق السرعة</h1>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card><CardContent className="p-4">
          <div className="text-sm text-muted-foreground">قيد الانتظار</div>
          <div className="text-3xl font-bold">{stats?.pending_total ?? 0}</div>
          {stats && (stats.pending_p0 + stats.pending_p1) > 0 && (
            <div className="text-sm mt-1">
              <span className="text-red-600">P0: {stats.pending_p0}</span>
              {" · "}
              <span className="text-orange-600">P1: {stats.pending_p1}</span>
            </div>
          )}
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <div className="text-sm text-muted-foreground">Throughput (1د)</div>
          <div className="text-3xl font-bold text-green-600">
            {stats?.delivered_last_minute ?? 0}
            {stats && stats.failed_last_minute > 0 && (
              <span className="text-red-600 text-lg"> / {stats.failed_last_minute}</span>
            )}
          </div>
          <div className="text-xs text-muted-foreground mt-1">{stats?.sends_per_second ?? 0} msg/s</div>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <div className="text-sm text-muted-foreground">Latency (p50/p95/p99)</div>
          <div className="text-2xl font-bold">
            {stats?.p50_latency_ms ?? "—"}<span className="text-sm text-muted-foreground">ms</span>
          </div>
          <div className="text-xs text-muted-foreground mt-1">
            p95: {stats?.p95_latency_ms ?? "—"}ms · p99: {stats?.p99_latency_ms ?? "—"}ms
          </div>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <div className="text-sm text-muted-foreground">معدل الفشل / Workers</div>
          <div className="text-3xl font-bold">
            <span className={stats && stats.failure_rate_pct > 5 ? "text-red-600" : "text-green-600"}>
              {stats?.failure_rate_pct ?? 0}%
            </span>
          </div>
          <div className="text-xs text-muted-foreground mt-1">{stats?.active_workers ?? 0} نشط</div>
        </CardContent></Card>
      </div>

      <Card>
        <CardHeader><CardTitle>اختبار تسليم فوري</CardTitle></CardHeader>
        <CardContent className="flex gap-2 flex-wrap">
          <Input className="w-64" placeholder="Telegram chat_id"
            value={testChat} onChange={(e) => setTestChat(e.target.value)} />
          <Button onClick={sendTest}>إرسال P0</Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>آخر 50 تسليم (Realtime)</CardTitle></CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-right text-muted-foreground border-b">
                <tr>
                  <th className="p-2">الوقت</th>
                  <th className="p-2">Chat</th>
                  <th className="p-2">Priority</th>
                  <th className="p-2">البلد</th>
                  <th className="p-2">Latency</th>
                  <th className="p-2">الحالة</th>
                  <th className="p-2">Worker</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((l) => (
                  <tr key={l.id} className="border-b">
                    <td className="p-2 text-xs">{new Date(l.delivered_at).toLocaleTimeString()}</td>
                    <td className="p-2 font-mono text-xs">{l.chat_id}</td>
                    <td className="p-2"><Badge className={PRIORITY_COLOR[l.priority]}>{PRIORITY_LABEL[l.priority]}</Badge></td>
                    <td className="p-2">{l.country_code || "—"}</td>
                    <td className="p-2 font-semibold">
                      <span className={
                        (l.e2e_latency_ms ?? 0) < 500 ? "text-green-600" :
                        (l.e2e_latency_ms ?? 0) < 2000 ? "text-yellow-600" : "text-red-600"
                      }>
                        {l.e2e_latency_ms ?? "—"}ms
                      </span>
                    </td>
                    <td className="p-2">
                      {l.success
                        ? <Badge className="bg-green-500/15 text-green-700 dark:text-green-400">sent</Badge>
                        : <Badge variant="destructive" title={l.error || ""}>failed</Badge>}
                    </td>
                    <td className="p-2 font-mono text-xs">{l.worker_id || "—"}</td>
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