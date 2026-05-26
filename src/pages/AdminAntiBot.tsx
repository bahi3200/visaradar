import { useEffect, useMemo, useState } from "react";
import AdminLayout from "@/components/AdminLayout";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ShieldAlert, RefreshCcw, Eye, AlertTriangle, Rocket } from "lucide-react";
import { Link } from "react-router-dom";
import { formatDistanceToNow } from "date-fns";

type RiskRow = {
  provider: string;
  risk_score: number;
  captcha_rate: number;
  block_rate: number;
  recommended_interval_seconds: number;
  throttle_until: string | null;
  last_event_at: string | null;
};
type Event = {
  id: string;
  country_code: string;
  provider: string;
  detection_type: string;
  severity: number;
  blocked_reason: string | null;
  http_status: number | null;
  proxy_used: string | null;
  screenshot_path: string | null;
  html_snapshot_path: string | null;
  page_title: string | null;
  page_text_snippet: string | null;
  fingerprint_used: any;
  detected_at: string;
};
type ProxyHealth = {
  proxy_label: string;
  provider: string;
  status: string;
  cooldown_until: string | null;
  failure_count: number;
  captcha_count: number;
  success_count: number;
  last_error: string | null;
  updated_at: string;
};

function riskColor(score: number) {
  if (score >= 80) return "destructive";
  if (score >= 50) return "default";
  if (score >= 25) return "secondary";
  return "outline";
}

export default function AdminAntiBot() {
  const [risks, setRisks] = useState<RiskRow[]>([]);
  const [events, setEvents] = useState<Event[]>([]);
  const [proxies, setProxies] = useState<ProxyHealth[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Event | null>(null);
  const [evidenceUrl, setEvidenceUrl] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const [{ data: r }, { data: e }, { data: p }] = await Promise.all([
      supabase.from("provider_risk_scores").select("*").order("risk_score", { ascending: false }),
      supabase.from("bot_detection_events").select("*").order("detected_at", { ascending: false }).limit(100),
      supabase.from("proxy_health").select("*").order("updated_at", { ascending: false }).limit(50),
    ]);
    setRisks((r as any) || []);
    setEvents((e as any) || []);
    setProxies((p as any) || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const openEvidence = async (path: string | null) => {
    if (!path) return;
    const { data } = await supabase.storage.from("bot-evidence").createSignedUrl(path, 600);
    setEvidenceUrl(data?.signedUrl || null);
  };

  const summary = useMemo(() => {
    const last24h = events.filter(e => Date.now() - new Date(e.detected_at).getTime() < 86_400_000);
    return {
      total: last24h.length,
      captchas: last24h.filter(e => e.detection_type.includes("captcha")).length,
      blocks: last24h.filter(e => ["block","cloudflare","rate_limit"].includes(e.detection_type)).length,
    };
  }, [events]);

  return (
    <AdminLayout title="Anti-Bot Evasion" subtitle="Bot-detection risk، captchas، blocks، proxy cooldowns">
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex gap-2 text-sm text-muted-foreground">
            <span>آخر 24 ساعة:</span>
            <Badge variant="outline">{summary.total} حدث</Badge>
            <Badge variant="secondary">{summary.captchas} captcha</Badge>
            <Badge variant="destructive">{summary.blocks} block</Badge>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={load} disabled={loading}>
              <RefreshCcw className={`w-4 h-4 ml-2 ${loading ? "animate-spin" : ""}`} /> تحديث
            </Button>
            <Button asChild size="sm">
              <Link to="/dashboard/deploy-worker"><Rocket className="w-4 h-4 ml-2" /> Deploy Worker</Link>
            </Button>
          </div>
        </div>

        {/* Provider Risk */}
        <section>
          <h2 className="font-heading text-lg mb-3 flex items-center gap-2"><ShieldAlert className="w-5 h-5" /> Provider Risk Scores</h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {risks.length === 0 && <p className="text-sm text-muted-foreground">لا توجد بيانات بعد.</p>}
            {risks.map(r => (
              <Card key={r.provider} className="p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <h3 className="font-bold uppercase">{r.provider}</h3>
                  <Badge variant={riskColor(Number(r.risk_score)) as any}>{Number(r.risk_score).toFixed(0)}/100</Badge>
                </div>
                <div className="text-xs text-muted-foreground space-y-1">
                  <div>Captcha rate: {(Number(r.captcha_rate) * 100).toFixed(1)}%</div>
                  <div>Block rate: {(Number(r.block_rate) * 100).toFixed(1)}%</div>
                  <div>Scan interval: {r.recommended_interval_seconds}s</div>
                  {r.throttle_until && (
                    <div className="text-destructive font-medium">
                      مُعطَّل حتى {formatDistanceToNow(new Date(r.throttle_until), { addSuffix: true })}
                    </div>
                  )}
                </div>
              </Card>
            ))}
          </div>
        </section>

        {/* Proxy health */}
        <section>
          <h2 className="font-heading text-lg mb-3">Proxy Health & Cooldowns</h2>
          <Card className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40">
                <tr><th className="p-2 text-right">Proxy</th><th className="p-2">Provider</th><th className="p-2">Status</th><th className="p-2">Fails</th><th className="p-2">Captchas</th><th className="p-2">Cooldown</th></tr>
              </thead>
              <tbody>
                {proxies.map(p => (
                  <tr key={p.proxy_label + p.provider} className="border-t border-border/30">
                    <td className="p-2 font-mono text-xs">{p.proxy_label}</td>
                    <td className="p-2">{p.provider}</td>
                    <td className="p-2"><Badge variant={p.status === "healthy" ? "outline" : p.status === "cooldown" ? "secondary" : "destructive"}>{p.status}</Badge></td>
                    <td className="p-2 text-center">{p.failure_count}</td>
                    <td className="p-2 text-center">{p.captcha_count}</td>
                    <td className="p-2 text-xs">{p.cooldown_until ? formatDistanceToNow(new Date(p.cooldown_until), { addSuffix: true }) : "-"}</td>
                  </tr>
                ))}
                {proxies.length === 0 && <tr><td colSpan={6} className="p-4 text-center text-muted-foreground text-xs">لا توجد سجلات بعد.</td></tr>}
              </tbody>
            </table>
          </Card>
        </section>

        {/* Recent events */}
        <section>
          <h2 className="font-heading text-lg mb-3 flex items-center gap-2"><AlertTriangle className="w-5 h-5" /> Detection Events (آخر 100)</h2>
          <Card className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40">
                <tr><th className="p-2 text-right">الوقت</th><th className="p-2">Provider</th><th className="p-2">Country</th><th className="p-2">Type</th><th className="p-2">Sev</th><th className="p-2">Status</th><th className="p-2">Proxy</th><th className="p-2"></th></tr>
              </thead>
              <tbody>
                {events.map(ev => (
                  <tr key={ev.id} className="border-t border-border/30">
                    <td className="p-2 text-xs">{formatDistanceToNow(new Date(ev.detected_at), { addSuffix: true })}</td>
                    <td className="p-2 uppercase">{ev.provider}</td>
                    <td className="p-2">{ev.country_code}</td>
                    <td className="p-2"><Badge variant="secondary">{ev.detection_type}</Badge></td>
                    <td className="p-2 text-center">{ev.severity}</td>
                    <td className="p-2">{ev.http_status || "-"}</td>
                    <td className="p-2 font-mono text-xs">{ev.proxy_used || "-"}</td>
                    <td className="p-2"><Button size="sm" variant="ghost" onClick={() => setSelected(ev)}><Eye className="w-4 h-4" /></Button></td>
                  </tr>
                ))}
                {events.length === 0 && <tr><td colSpan={8} className="p-4 text-center text-muted-foreground text-xs">لا توجد أحداث.</td></tr>}
              </tbody>
            </table>
          </Card>
        </section>

        {/* Evidence panel */}
        {selected && (
          <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={() => { setSelected(null); setEvidenceUrl(null); }}>
            <Card className="max-w-3xl w-full max-h-[90vh] overflow-y-auto p-5 space-y-3" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between">
                <h3 className="font-bold">{selected.detection_type} — {selected.provider.toUpperCase()}/{selected.country_code}</h3>
                <Button size="sm" variant="ghost" onClick={() => { setSelected(null); setEvidenceUrl(null); }}>إغلاق</Button>
              </div>
              <div className="text-xs space-y-1">
                <div><b>Detected:</b> {new Date(selected.detected_at).toLocaleString()}</div>
                <div><b>HTTP:</b> {selected.http_status || "-"}</div>
                <div><b>Proxy:</b> <code>{selected.proxy_used || "-"}</code></div>
                <div><b>Title:</b> {selected.page_title || "-"}</div>
                <div><b>Reason:</b> {selected.blocked_reason || "-"}</div>
              </div>
              {selected.fingerprint_used && (
                <details className="text-xs"><summary className="cursor-pointer font-medium">Fingerprint used</summary>
                  <pre className="bg-muted/30 p-2 rounded text-[10px] overflow-auto">{JSON.stringify(selected.fingerprint_used, null, 2)}</pre>
                </details>
              )}
              {selected.page_text_snippet && (
                <details className="text-xs"><summary className="cursor-pointer font-medium">Page text</summary>
                  <pre className="bg-muted/30 p-2 rounded text-[10px] overflow-auto whitespace-pre-wrap">{selected.page_text_snippet}</pre>
                </details>
              )}
              <div className="flex gap-2">
                {selected.screenshot_path && (
                  <Button size="sm" variant="outline" onClick={() => openEvidence(selected.screenshot_path)}>عرض الـ screenshot</Button>
                )}
                {selected.html_snapshot_path && (
                  <Button size="sm" variant="outline" onClick={() => openEvidence(selected.html_snapshot_path)}>عرض الـ HTML</Button>
                )}
              </div>
              {evidenceUrl && (
                <div className="border border-border/30 rounded overflow-hidden">
                  {evidenceUrl.endsWith(".html") || evidenceUrl.includes("text/html")
                    ? <iframe src={evidenceUrl} className="w-full h-[500px]" />
                    : <img src={evidenceUrl} alt="evidence" className="w-full" />}
                </div>
              )}
            </Card>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}