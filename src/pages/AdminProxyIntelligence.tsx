import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

type Proxy = {
  id: string; host: string; port: number; protocol: string;
  geo_country: string | null; status: string;
  score: number; ban_probability: number;
  avg_latency_ms: number | null; captcha_count: number; block_count: number;
  success_count: number; failure_count: number; total_requests: number;
  cooldown_until: string | null; disabled_reason: string | null;
  last_success_at: string | null;
};

type Affinity = {
  provider: string; affinity_score: number;
  success_count: number; failure_count: number;
  captcha_count: number; block_count: number;
  proxy_id: string;
};

export default function AdminProxyIntelligence() {
  const [proxies, setProxies] = useState<Proxy[]>([]);
  const [affinity, setAffinity] = useState<Affinity[]>([]);
  const [loading, setLoading] = useState(true);
  const [recomputing, setRecomputing] = useState(false);
  const [provider, setProvider] = useState("");
  const [country, setCountry] = useState("");
  const [best, setBest] = useState<any | null>(null);

  const load = async () => {
    setLoading(true);
    const [p, a] = await Promise.all([
      supabase.from("proxy_endpoints").select("*").order("score", { ascending: false }),
      supabase.from("proxy_provider_affinity").select("*").order("affinity_score", { ascending: false }).limit(200),
    ]);
    setProxies((p.data as any) || []);
    setAffinity((a.data as any) || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const recompute = async () => {
    setRecomputing(true);
    const { data, error } = await supabase.rpc("recompute_proxy_scores" as any);
    setRecomputing(false);
    if (error) return toast.error(error.message);
    const row = Array.isArray(data) ? data[0] : data;
    toast.success(`تم التحديث: ${row?.updated ?? 0} | معطّل تلقائياً: ${row?.auto_disabled ?? 0}`);
    load();
  };

  const pickBest = async () => {
    const { data, error } = await supabase.rpc("pick_best_proxy" as any, {
      _provider: provider || null, _country: country || null, _pool_name: null,
    });
    if (error) return toast.error(error.message);
    setBest(Array.isArray(data) ? data[0] : data);
  };

  const reEnable = async (id: string) => {
    const { error } = await supabase.from("proxy_endpoints").update({
      status: "active", disabled_reason: null, auto_disabled_at: null, consecutive_failures: 0, cooldown_until: null,
    }).eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("تم إعادة التفعيل");
    load();
  };

  const scoreColor = (s: number) =>
    s >= 80 ? "bg-green-500/15 text-green-700 dark:text-green-400" :
    s >= 50 ? "bg-yellow-500/15 text-yellow-700 dark:text-yellow-400" :
              "bg-red-500/15 text-red-700 dark:text-red-400";

  return (
    <div className="container mx-auto p-6 space-y-6" dir="rtl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-bold">ذكاء البروكسي المتقدم</h1>
        <Button onClick={recompute} disabled={recomputing}>
          {recomputing ? "جاري الحساب..." : "إعادة حساب النتائج"}
        </Button>
      </div>

      <Card>
        <CardHeader><CardTitle>اختيار أفضل بروكسي تلقائياً</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <Input placeholder="Provider (مثال: vfs)" value={provider} onChange={e=>setProvider(e.target.value)} className="w-48" />
            <Input placeholder="Country (مثال: FR)" value={country} onChange={e=>setCountry(e.target.value)} className="w-32" />
            <Button onClick={pickBest}>اختر</Button>
          </div>
          {best && (
            <div className="rounded-md border p-3 text-sm space-y-1">
              <div><b>{best.protocol}://{best.host}:{best.port}</b></div>
              <div className="flex gap-2 flex-wrap">
                <Badge className={scoreColor(Number(best.score))}>Score {Number(best.score).toFixed(1)}</Badge>
                <Badge variant="outline">Affinity {Number(best.affinity).toFixed(1)}</Badge>
                <Badge variant="outline">Latency {best.avg_latency_ms ?? "-"}ms</Badge>
                <Badge variant="outline">Ban prob {Number(best.ban_probability).toFixed(1)}%</Badge>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>كل البروكسي ({proxies.length})</CardTitle></CardHeader>
        <CardContent>
          {loading ? <p className="text-muted-foreground">جاري التحميل...</p> : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-right text-muted-foreground border-b">
                  <tr>
                    <th className="p-2">العنوان</th>
                    <th className="p-2">البلد</th>
                    <th className="p-2">الحالة</th>
                    <th className="p-2">Score</th>
                    <th className="p-2">Ban %</th>
                    <th className="p-2">Latency</th>
                    <th className="p-2">Cap/Block</th>
                    <th className="p-2">نجاح/فشل</th>
                    <th className="p-2">إجراء</th>
                  </tr>
                </thead>
                <tbody>
                  {proxies.map(p => (
                    <tr key={p.id} className="border-b">
                      <td className="p-2 font-mono text-xs">{p.protocol}://{p.host}:{p.port}</td>
                      <td className="p-2">{p.geo_country || "—"}</td>
                      <td className="p-2">
                        <Badge variant={p.status === "active" ? "default" : "destructive"}>{p.status}</Badge>
                      </td>
                      <td className="p-2"><Badge className={scoreColor(Number(p.score))}>{Number(p.score).toFixed(1)}</Badge></td>
                      <td className="p-2">{Number(p.ban_probability).toFixed(1)}%</td>
                      <td className="p-2">{p.avg_latency_ms ?? "—"}ms</td>
                      <td className="p-2">{p.captcha_count}/{p.block_count}</td>
                      <td className="p-2">{p.success_count}/{p.failure_count}</td>
                      <td className="p-2">
                        {p.status !== "active" && (
                          <Button size="sm" variant="outline" onClick={() => reEnable(p.id)}>إعادة تفعيل</Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>تقارب البروكسي مع المزودين (Top 200)</CardTitle></CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-right text-muted-foreground border-b">
                <tr>
                  <th className="p-2">Provider</th>
                  <th className="p-2">Affinity</th>
                  <th className="p-2">نجاح</th>
                  <th className="p-2">فشل</th>
                  <th className="p-2">Captcha</th>
                  <th className="p-2">Block</th>
                </tr>
              </thead>
              <tbody>
                {affinity.map(a => (
                  <tr key={a.proxy_id + a.provider} className="border-b">
                    <td className="p-2 font-semibold">{a.provider}</td>
                    <td className="p-2"><Badge className={scoreColor(Number(a.affinity_score))}>{Number(a.affinity_score).toFixed(1)}</Badge></td>
                    <td className="p-2 text-green-600">{a.success_count}</td>
                    <td className="p-2 text-red-600">{a.failure_count}</td>
                    <td className="p-2">{a.captcha_count}</td>
                    <td className="p-2">{a.block_count}</td>
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