import AdminLayout from "@/components/AdminLayout";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Shield, Activity, AlertTriangle, Eye, Pause, Play, RefreshCw, Cpu, Zap } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

type DashboardStats = {
  total_requests: number;
  success_count: number;
  captcha_count: number;
  block_count: number;
  cloudflare_count: number;
  captcha_rate: number;
  block_rate: number;
  success_rate: number;
  active_profiles: number;
  quarantined_proxies: number;
  high_risk_providers: number;
};

type Quarantine = {
  id: string;
  proxy_label: string;
  provider: string | null;
  country_code: string | null;
  reason: string;
  quarantined_until: string;
  released_at: string | null;
};

type StealthProfile = {
  id: string;
  name: string;
  score: number;
  is_active: boolean;
  success_count: number;
  failure_count: number;
  captcha_count: number;
  block_count: number;
  last_used_at: string | null;
};

type ProviderRisk = {
  provider: string;
  risk_score: number;
  captcha_rate: number;
  block_rate: number;
  recommended_interval_seconds: number;
  updated_at: string;
};

export default function AdminStealthAnalytics() {
  const [hours, setHours] = useState(24);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [quarantines, setQuarantines] = useState<Quarantine[]>([]);
  const [profiles, setProfiles] = useState<StealthProfile[]>([]);
  const [risks, setRisks] = useState<ProviderRisk[]>([]);
  const [loading, setLoading] = useState(true);

  async function loadAll() {
    setLoading(true);
    try {
      const [statsRes, qRes, pRes, rRes] = await Promise.all([
        supabase.rpc("get_stealth_dashboard_stats" as any, { _hours: hours }),
        supabase
          .from("proxy_quarantine" as any)
          .select("id, proxy_label, provider, country_code, reason, quarantined_until, released_at")
          .is("released_at", null)
          .gt("quarantined_until", new Date().toISOString())
          .order("quarantined_until", { ascending: false }),
        supabase
          .from("stealth_profiles" as any)
          .select("id, name, score, is_active, success_count, failure_count, captcha_count, block_count, last_used_at")
          .order("score", { ascending: false })
          .limit(50),
        supabase
          .from("provider_risk_scores")
          .select("provider, risk_score, captcha_rate, block_rate, recommended_interval_seconds, updated_at")
          .order("risk_score", { ascending: false }),
      ]);

      const s = (statsRes.data as any);
      setStats(Array.isArray(s) ? s[0] ?? null : s);
      setQuarantines((qRes.data as any) || []);
      setProfiles((pRes.data as any) || []);
      setRisks((rRes.data as any) || []);
    } catch (e: any) {
      toast.error(e.message || "فشل تحميل البيانات");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadAll(); }, [hours]);

  async function releaseProxy(id: string) {
    const { error } = await supabase
      .from("proxy_quarantine" as any)
      .update({ released_at: new Date().toISOString() })
      .eq("id", id);
    if (error) toast.error(error.message);
    else { toast.success("تم الإفراج عن البروكسي"); loadAll(); }
  }

  async function toggleProfile(id: string, active: boolean) {
    const { error } = await supabase
      .from("stealth_profiles" as any)
      .update({ is_active: !active })
      .eq("id", id);
    if (error) toast.error(error.message);
    else { toast.success(active ? "تم إيقاف البصمة" : "تم تفعيل البصمة"); loadAll(); }
  }

  const cards = [
    { label: "إجمالي الطلبات", value: stats?.total_requests ?? 0, icon: Activity, color: "text-primary" },
    { label: "نسبة النجاح", value: `${stats?.success_rate ?? 0}%`, icon: Zap, color: "text-green-400" },
    { label: "نسبة Captcha", value: `${stats?.captcha_rate ?? 0}%`, icon: AlertTriangle, color: "text-orange-400" },
    { label: "نسبة الحظر", value: `${stats?.block_rate ?? 0}%`, icon: Shield, color: "text-red-400" },
    { label: "بصمات فعّالة", value: stats?.active_profiles ?? 0, icon: Cpu, color: "text-blue-400" },
    { label: "بروكسي معزول", value: stats?.quarantined_proxies ?? 0, icon: Pause, color: "text-yellow-400" },
    { label: "Providers خطرة", value: stats?.high_risk_providers ?? 0, icon: AlertTriangle, color: "text-red-400" },
    { label: "Cloudflare", value: stats?.cloudflare_count ?? 0, icon: Eye, color: "text-purple-400" },
  ];

  return (
    <AdminLayout title="Stealth Analytics" subtitle="مراقبة أداء طبقة الـ Human Simulation ومقاومة كشف البوت">
      <div className="space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex gap-2">
            {[1, 6, 24, 72].map((h) => (
              <button
                key={h}
                onClick={() => setHours(h)}
                className={`text-xs px-3 py-1.5 rounded-lg border transition ${
                  hours === h
                    ? "bg-primary/15 text-primary border-primary/40"
                    : "bg-secondary/30 border-border/50 text-muted-foreground"
                }`}
              >
                آخر {h}س
              </button>
            ))}
          </div>
          <Button variant="outline" size="sm" onClick={loadAll} disabled={loading}>
            <RefreshCw className={`w-4 h-4 mr-1 ${loading ? "animate-spin" : ""}`} />
            تحديث
          </Button>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {cards.map((c) => (
            <motion.div
              key={c.label}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="gradient-card rounded-xl border border-border/50 p-4"
            >
              <c.icon className={`w-5 h-5 ${c.color} mb-2`} />
              <p className="text-2xl font-black text-foreground">{c.value}</p>
              <p className="text-xs text-muted-foreground mt-1">{c.label}</p>
            </motion.div>
          ))}
        </div>

        <section className="gradient-card rounded-xl border border-border/50 p-4">
          <h3 className="font-bold text-foreground mb-3 flex items-center gap-2">
            <Shield className="w-4 h-4 text-red-400" /> Provider Risk Score
          </h3>
          {risks.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-6">لا توجد بيانات بعد</p>
          ) : (
            <div className="space-y-2">
              {risks.map((r) => (
                <div key={r.provider} className="flex items-center justify-between gap-3 p-2 rounded-lg bg-secondary/30">
                  <div>
                    <p className="font-medium text-foreground text-sm">{r.provider}</p>
                    <p className="text-[10px] text-muted-foreground">
                      captcha {Math.round(r.captcha_rate * 100)}% • block {Math.round(r.block_rate * 100)}% • فاصل موصى به {Math.round(r.recommended_interval_seconds / 60)}د
                    </p>
                  </div>
                  <span className={`text-xs font-bold px-3 py-1 rounded-full ${
                    r.risk_score >= 70 ? "bg-red-500/15 text-red-400" :
                    r.risk_score >= 40 ? "bg-orange-500/15 text-orange-400" :
                    "bg-green-500/15 text-green-400"
                  }`}>
                    {Math.round(r.risk_score)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="gradient-card rounded-xl border border-border/50 p-4">
          <h3 className="font-bold text-foreground mb-3 flex items-center gap-2">
            <Pause className="w-4 h-4 text-yellow-400" /> Proxy Quarantine
          </h3>
          {quarantines.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-6">لا يوجد بروكسي معزول حالياً</p>
          ) : (
            <div className="space-y-2">
              {quarantines.map((q) => (
                <div key={q.id} className="flex items-center justify-between gap-3 p-2 rounded-lg bg-secondary/30">
                  <div className="min-w-0">
                    <p className="font-mono text-xs text-foreground truncate">{q.proxy_label}</p>
                    <p className="text-[10px] text-muted-foreground">
                      {q.provider || "—"} / {q.country_code || "—"} • حتى {new Date(q.quarantined_until).toLocaleString("ar-DZ", { hour: "2-digit", minute: "2-digit", day: "numeric", month: "short" })}
                    </p>
                    <p className="text-[10px] text-orange-400 truncate">{q.reason}</p>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => releaseProxy(q.id)}>
                    <Play className="w-3 h-3 mr-1" /> إفراج
                  </Button>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="gradient-card rounded-xl border border-border/50 p-4">
          <h3 className="font-bold text-foreground mb-3 flex items-center gap-2">
            <Cpu className="w-4 h-4 text-blue-400" /> Stealth Profiles
          </h3>
          {profiles.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-6">
              لا توجد بصمات بعد — أضِفها من VPS Worker أو يدوياً عبر الجداول.
            </p>
          ) : (
            <div className="space-y-2">
              {profiles.map((p) => {
                const total = p.success_count + p.failure_count + p.captcha_count + p.block_count;
                return (
                  <div key={p.id} className="flex items-center justify-between gap-3 p-2 rounded-lg bg-secondary/30">
                    <div className="min-w-0">
                      <p className="font-medium text-foreground text-sm truncate">{p.name}</p>
                      <p className="text-[10px] text-muted-foreground">
                        {total} طلب • نجاح {p.success_count} • captcha {p.captcha_count} • حظر {p.block_count}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`text-xs font-bold px-2 py-1 rounded-full ${
                        p.score >= 70 ? "bg-green-500/15 text-green-400" :
                        p.score >= 40 ? "bg-orange-500/15 text-orange-400" :
                        "bg-red-500/15 text-red-400"
                      }`}>
                        {Math.round(p.score)}
                      </span>
                      <Button size="sm" variant="outline" onClick={() => toggleProfile(p.id, p.is_active)}>
                        {p.is_active ? "إيقاف" : "تفعيل"}
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </AdminLayout>
  );
}