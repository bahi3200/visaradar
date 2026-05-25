import AdminLayout from "@/components/AdminLayout";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Shield, RefreshCw, Send, AlertTriangle, Activity, Clock, Copy } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

type Row = {
  provider: string;
  country_code: string;
  active_sessions: number;
  quarantined_sessions: number;
  pending_challenges: number;
  avg_health: number;
  captcha_rate: number;
  success_rate: number;
};

type Challenge = {
  id: string;
  provider: string;
  country_code: string;
  challenge_type: string;
  status: string;
  deep_link_token: string;
  user_id: string | null;
  created_at: string;
  expires_at: string;
};

export default function AdminVerificationGateway() {
  const [hours, setHours] = useState(24);
  const [rows, setRows] = useState<Row[]>([]);
  const [challenges, setChallenges] = useState<Challenge[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try {
      const [dRes, cRes] = await Promise.all([
        supabase.rpc("hvg_dashboard" as any, { _hours: hours }),
        supabase
          .from("challenge_sessions" as any)
          .select("id, provider, country_code, challenge_type, status, deep_link_token, user_id, created_at, expires_at")
          .in("status", ["pending", "notified"])
          .gt("expires_at", new Date().toISOString())
          .order("created_at", { ascending: false })
          .limit(50),
      ]);
      setRows((dRes.data as any) || []);
      setChallenges((cRes.data as any) || []);
    } catch (e: any) {
      toast.error(e.message || "فشل التحميل");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [hours]);

  function copyLink(token: string) {
    const url = `${window.location.origin}/verify/${token}`;
    navigator.clipboard.writeText(url);
    toast.success("تم نسخ رابط التحقق");
  }

  async function cancelChallenge(id: string) {
    const { error } = await supabase.from("challenge_sessions" as any).update({ status: "cancelled" }).eq("id", id);
    if (error) toast.error(error.message); else { toast.success("ألغي التحدي"); load(); }
  }

  return (
    <AdminLayout title="Verification Gateway" subtitle="إدارة جلسات التحقق البشري لمزودي الفيزا">
      <div className="space-y-6">
        <div className="flex justify-between flex-wrap gap-3">
          <div className="flex gap-2">
            {[1, 6, 24, 72].map(h => (
              <button key={h} onClick={() => setHours(h)}
                className={`text-xs px-3 py-1.5 rounded-lg border ${hours === h ? "bg-primary/15 text-primary border-primary/40" : "bg-secondary/30 border-border/50 text-muted-foreground"}`}>
                آخر {h}س
              </button>
            ))}
          </div>
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            <RefreshCw className={`w-4 h-4 ml-1 ${loading ? "animate-spin" : ""}`} /> تحديث
          </Button>
        </div>

        <section className="gradient-card rounded-xl border border-border/50 p-4">
          <h3 className="font-bold text-foreground mb-3 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-orange-400" /> تحدّيات بانتظار الحلّ ({challenges.length})
          </h3>
          {challenges.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-6">لا توجد تحدّيات نشطة الآن.</p>
          ) : (
            <div className="space-y-2">
              {challenges.map(c => (
                <motion.div key={c.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                  className="flex items-center justify-between gap-3 p-3 rounded-lg bg-secondary/30">
                  <div className="min-w-0">
                    <p className="font-medium text-sm text-foreground">{c.provider} / {c.country_code}</p>
                    <p className="text-[10px] text-muted-foreground flex items-center gap-2">
                      <code className="text-orange-400">{c.challenge_type}</code>
                      <span>•</span>
                      <Clock className="w-3 h-3" />
                      ينتهي {new Date(c.expires_at).toLocaleTimeString("ar-DZ", { hour: "2-digit", minute: "2-digit" })}
                      <span>•</span>
                      <span className={c.status === "notified" ? "text-green-400" : "text-yellow-400"}>{c.status}</span>
                    </p>
                  </div>
                  <div className="flex gap-1">
                    <Button size="sm" variant="outline" onClick={() => copyLink(c.deep_link_token)} title="نسخ رابط التحقق">
                      <Copy className="w-3 h-3" />
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => cancelChallenge(c.id)} title="إلغاء">
                      ✕
                    </Button>
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </section>

        <section className="gradient-card rounded-xl border border-border/50 p-4">
          <h3 className="font-bold text-foreground mb-3 flex items-center gap-2">
            <Activity className="w-4 h-4 text-primary" /> صحة الجلسات لكل (مزود/دولة)
          </h3>
          {rows.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-6">لا توجد جلسات بعد. ستظهر هنا بعد أول تحقق بشري.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="text-muted-foreground">
                  <tr className="border-b border-border/40">
                    <th className="text-right p-2">مزود</th>
                    <th className="text-right p-2">دولة</th>
                    <th className="p-2">نشطة</th>
                    <th className="p-2">معزولة</th>
                    <th className="p-2">معلّقة</th>
                    <th className="p-2">صحة</th>
                    <th className="p-2">captcha%</th>
                    <th className="p-2">نجاح%</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={`${r.provider}-${r.country_code}-${i}`} className="border-b border-border/20">
                      <td className="text-right p-2 font-medium">{r.provider}</td>
                      <td className="text-right p-2">{r.country_code}</td>
                      <td className="text-center p-2 text-green-400">{r.active_sessions}</td>
                      <td className="text-center p-2 text-orange-400">{r.quarantined_sessions}</td>
                      <td className="text-center p-2 text-yellow-400">{r.pending_challenges}</td>
                      <td className={`text-center p-2 ${r.avg_health >= 70 ? "text-green-400" : r.avg_health >= 40 ? "text-orange-400" : "text-red-400"}`}>{r.avg_health}</td>
                      <td className={`text-center p-2 ${r.captcha_rate > 10 ? "text-orange-400" : "text-muted-foreground"}`}>{r.captcha_rate}%</td>
                      <td className={`text-center p-2 ${r.success_rate >= 80 ? "text-green-400" : "text-orange-400"}`}>{r.success_rate}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <div className="rounded-xl bg-primary/5 border border-primary/20 p-4 text-xs text-muted-foreground flex gap-3">
          <Shield className="w-4 h-4 text-primary shrink-0 mt-0.5" />
          <div>
            <p className="text-foreground font-bold mb-1">كيف يعمل النظام</p>
            عند اكتشاف CAPTCHA أو Cloudflare من قبل VPS worker، يُنشأ تحدٍّ ويُرسل رابط Telegram للمستخدم.
            بعد حلّه يدوياً، تُحفظ كوكيز الجلسة وتُعاد لاستعمال الـ worker بدون تكرار التحقق.
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}