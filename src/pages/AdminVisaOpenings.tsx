import { useEffect, useMemo, useState } from "react";
import AdminLayout from "@/components/AdminLayout";
import { supabase } from "@/integrations/supabase/client";
import { motion } from "framer-motion";
import {
  Activity, Calendar, Clock, Globe, Loader2, Radar, TrendingUp, Filter, Timer,
} from "lucide-react";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Cell,
  LineChart, Line,
} from "recharts";
import { formatRelativeArabic, formatFullDateAr } from "@/lib/relativeTime";

interface OpenEvent {
  id: string;
  country_code: string;
  provider: string;
  opened_at: string;
  closed_at: string | null;
  duration_minutes: number | null;
  detection_method: string | null;
  previous_status: string | null;
}

const COUNTRY_NAMES_AR: Record<string, string> = {
  IT: "إيطاليا", FR: "فرنسا", ES: "إسبانيا", DE: "ألمانيا", GR: "اليونان",
  PT: "البرتغال", NL: "هولندا", BE: "بلجيكا", AT: "النمسا", CH: "سويسرا",
  GB: "بريطانيا", US: "أمريكا", CA: "كندا",
};
const cn = (c: string) => COUNTRY_NAMES_AR[c] || c;

const PROVIDER_AR: Record<string, string> = {
  vfs: "VFS", tls: "TLScontact", bls: "BLS", capago: "Capago", other: "أخرى",
};

const RANGES = [
  { key: "24h", label: "آخر 24 ساعة", hours: 24 },
  { key: "7d", label: "آخر 7 أيام", hours: 24 * 7 },
  { key: "30d", label: "آخر 30 يوماً", hours: 24 * 30 },
  { key: "90d", label: "آخر 90 يوماً", hours: 24 * 90 },
] as const;

export default function AdminVisaOpenings() {
  const [loading, setLoading] = useState(true);
  const [events, setEvents] = useState<OpenEvent[]>([]);
  const [range, setRange] = useState<(typeof RANGES)[number]["key"]>("30d");
  const [filterCountry, setFilterCountry] = useState<string>("all");
  const [filterProvider, setFilterProvider] = useState<string>("all");

  const since = useMemo(() => {
    const r = RANGES.find((x) => x.key === range)!;
    return new Date(Date.now() - r.hours * 3600 * 1000).toISOString();
  }, [range]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from("visa_open_events" as any)
        .select("id,country_code,provider,opened_at,closed_at,duration_minutes,detection_method,previous_status")
        .gte("opened_at", since)
        .order("opened_at", { ascending: false })
        .limit(1000);
      setEvents((data as any) || []);
      setLoading(false);
    })();

    // realtime
    const ch = supabase
      .channel("voe-rt")
      .on("postgres_changes", { event: "*", schema: "public", table: "visa_open_events" }, async () => {
        const { data } = await supabase
          .from("visa_open_events" as any)
          .select("id,country_code,provider,opened_at,closed_at,duration_minutes,detection_method,previous_status")
          .gte("opened_at", since)
          .order("opened_at", { ascending: false })
          .limit(1000);
        setEvents((data as any) || []);
      })
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [since]);

  const filtered = useMemo(() => {
    return events.filter(
      (e) =>
        (filterCountry === "all" || e.country_code === filterCountry) &&
        (filterProvider === "all" || e.provider === filterProvider)
    );
  }, [events, filterCountry, filterProvider]);

  const countries = useMemo(() => Array.from(new Set(events.map((e) => e.country_code))).sort(), [events]);
  const providers = useMemo(() => Array.from(new Set(events.map((e) => e.provider))).sort(), [events]);

  // KPIs
  const total = filtered.length;
  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
  const today = filtered.filter((e) => new Date(e.opened_at) >= todayStart).length;
  const stillOpen = filtered.filter((e) => !e.closed_at).length;
  const durations = filtered.filter((e) => e.duration_minutes != null).map((e) => e.duration_minutes!);
  const avgDuration = durations.length
    ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length)
    : 0;

  // Per country breakdown
  const perCountry = useMemo(() => {
    const map = new Map<string, { count: number; lastOpen: string; durations: number[] }>();
    filtered.forEach((e) => {
      const cur = map.get(e.country_code) || { count: 0, lastOpen: e.opened_at, durations: [] };
      cur.count += 1;
      if (new Date(e.opened_at) > new Date(cur.lastOpen)) cur.lastOpen = e.opened_at;
      if (e.duration_minutes != null) cur.durations.push(e.duration_minutes);
      map.set(e.country_code, cur);
    });
    return Array.from(map.entries())
      .map(([code, v]) => ({
        code,
        name: cn(code),
        count: v.count,
        lastOpen: v.lastOpen,
        avgMin: v.durations.length
          ? Math.round(v.durations.reduce((a, b) => a + b, 0) / v.durations.length)
          : 0,
      }))
      .sort((a, b) => b.count - a.count);
  }, [filtered]);

  // Hourly heat (0-23) — when do openings happen most
  const hourly = useMemo(() => {
    const buckets = Array.from({ length: 24 }, (_, h) => ({ hour: h, count: 0 }));
    filtered.forEach((e) => {
      const h = new Date(e.opened_at).getHours();
      buckets[h].count += 1;
    });
    return buckets;
  }, [filtered]);

  // Daily trend
  const daily = useMemo(() => {
    const map = new Map<string, number>();
    filtered.forEach((e) => {
      const d = new Date(e.opened_at).toISOString().slice(0, 10);
      map.set(d, (map.get(d) || 0) + 1);
    });
    return Array.from(map.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, count]) => ({ date: date.slice(5), count }));
  }, [filtered]);

  return (
    <AdminLayout title="تتبع فتحات المواقع" subtitle="نظام إحصائي شامل لكل عملية فتح موعد">
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
        {/* Filters */}
        <div className="flex flex-wrap gap-2">
          {RANGES.map((r) => (
            <button
              key={r.key}
              onClick={() => setRange(r.key)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                range === r.key
                  ? "bg-primary text-primary-foreground shadow"
                  : "bg-muted/40 text-muted-foreground hover:bg-muted"
              }`}
            >
              {r.label}
            </button>
          ))}
          <div className="flex items-center gap-2 ms-auto">
            <Filter className="w-4 h-4 text-muted-foreground" />
            <select
              value={filterCountry}
              onChange={(e) => setFilterCountry(e.target.value)}
              className="px-2 py-1.5 rounded-lg bg-card border border-border text-xs"
            >
              <option value="all">كل الدول</option>
              {countries.map((c) => (
                <option key={c} value={c}>{cn(c)}</option>
              ))}
            </select>
            <select
              value={filterProvider}
              onChange={(e) => setFilterProvider(e.target.value)}
              className="px-2 py-1.5 rounded-lg bg-card border border-border text-xs"
            >
              <option value="all">كل المزودين</option>
              {providers.map((p) => (
                <option key={p} value={p}>{PROVIDER_AR[p] || p}</option>
              ))}
            </select>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
          </div>
        ) : (
          <>
            {/* KPIs */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <Kpi icon={<Radar className="w-5 h-5" />} label="إجمالي الفتحات" value={total} hint="ضمن الفترة" tone="primary" />
              <Kpi icon={<Calendar className="w-5 h-5" />} label="فتحات اليوم" value={today} hint="منذ منتصف الليل" tone="success" />
              <Kpi icon={<Activity className="w-5 h-5" />} label="مفتوح حالياً" value={stillOpen} hint="لم يُغلق بعد" tone="accent" />
              <Kpi icon={<Timer className="w-5 h-5" />} label="متوسط مدة الفتح" value={avgDuration} hint="بالدقائق" tone="muted" />
            </div>

            {/* Daily trend */}
            {daily.length > 0 && (
              <div className="rounded-xl border border-border/60 bg-card p-4">
                <div className="flex items-center gap-2 mb-3">
                  <TrendingUp className="w-4 h-4 text-primary" />
                  <h3 className="font-heading font-bold text-sm">الاتجاه اليومي</h3>
                </div>
                <div className="h-56">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={daily} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
                      <XAxis dataKey="date" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} />
                      <YAxis tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} allowDecimals={false} />
                      <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }} />
                      <Line type="monotone" dataKey="count" stroke="hsl(var(--primary))" strokeWidth={2} dot={{ r: 3 }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}

            {/* Hourly distribution */}
            <div className="rounded-xl border border-border/60 bg-card p-4">
              <div className="flex items-center gap-2 mb-3">
                <Clock className="w-4 h-4 text-primary" />
                <h3 className="font-heading font-bold text-sm">التوزيع حسب الساعة</h3>
              </div>
              <div className="h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={hourly} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
                    <XAxis dataKey="hour" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} />
                    <YAxis tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} allowDecimals={false} />
                    <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }} />
                    <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                      {hourly.map((_, i) => (
                        <Cell key={i} fill="hsl(var(--accent))" />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Per-country breakdown */}
            <div className="rounded-xl border border-border/60 bg-card p-4">
              <div className="flex items-center gap-2 mb-3">
                <Globe className="w-4 h-4 text-primary" />
                <h3 className="font-heading font-bold text-sm">تفصيل لكل دولة</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-muted-foreground border-b border-border/40">
                      <th className="text-start py-2">الدولة</th>
                      <th className="text-start py-2">عدد الفتحات</th>
                      <th className="text-start py-2">آخر فتح</th>
                      <th className="text-start py-2">متوسط المدة (د)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {perCountry.length === 0 && (
                      <tr><td colSpan={4} className="text-center py-6 text-muted-foreground">لا توجد بيانات</td></tr>
                    )}
                    {perCountry.map((c) => (
                      <tr key={c.code} className="border-b border-border/20">
                        <td className="py-2 font-bold">{c.name}</td>
                        <td className="py-2">{c.count}</td>
                        <td className="py-2">
                          <div className="text-foreground">{formatFullDateAr(c.lastOpen)}</div>
                          <div className="text-[10px] text-muted-foreground">{formatRelativeArabic(c.lastOpen)}</div>
                        </td>
                        <td className="py-2">{c.avgMin || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Recent timeline */}
            <div className="rounded-xl border border-border/60 bg-card p-4">
              <h3 className="font-heading font-bold text-sm mb-3 flex items-center gap-2">
                <Activity className="w-4 h-4 text-primary" />
                آخر الفتحات (تفصيلي)
              </h3>
              <div className="space-y-2 max-h-[480px] overflow-y-auto">
                {filtered.slice(0, 200).map((e) => (
                  <div
                    key={e.id}
                    className="flex items-start gap-3 p-2.5 rounded-lg bg-muted/20 border border-border/30"
                  >
                    <div className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${e.closed_at ? "bg-muted-foreground" : "bg-green-500 animate-pulse"}`} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <span className="font-bold text-sm">
                          {cn(e.country_code)} <span className="text-muted-foreground font-normal">· {PROVIDER_AR[e.provider] || e.provider}</span>
                        </span>
                        {!e.closed_at ? (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-green-500/15 text-green-500">مفتوح الآن</span>
                        ) : (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                            استمر {e.duration_minutes ?? 0} د
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-muted-foreground mt-0.5">
                        فُتح: {formatFullDateAr(e.opened_at)} ({formatRelativeArabic(e.opened_at)})
                      </div>
                      {e.closed_at && (
                        <div className="text-[11px] text-muted-foreground">
                          أُغلق: {formatFullDateAr(e.closed_at)}
                        </div>
                      )}
                      {e.detection_method && (
                        <div className="text-[10px] text-muted-foreground mt-0.5">
                          طريقة الكشف: <span className="font-mono">{e.detection_method}</span>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
                {filtered.length === 0 && (
                  <p className="text-center py-8 text-muted-foreground text-xs">لا توجد فتحات في هذه الفترة</p>
                )}
              </div>
            </div>
          </>
        )}
      </motion.div>
    </AdminLayout>
  );
}

function Kpi({
  icon, label, value, hint, tone,
}: {
  icon: React.ReactNode; label: string; value: number; hint: string;
  tone: "primary" | "success" | "accent" | "muted";
}) {
  const tones: Record<string, string> = {
    primary: "border-primary/30 bg-primary/5 text-primary",
    success: "border-green-500/30 bg-green-500/5 text-green-500",
    accent: "border-accent/30 bg-accent/5 text-accent",
    muted: "border-border bg-muted/20 text-muted-foreground",
  };
  return (
    <div className={`rounded-xl border p-3 ${tones[tone]}`}>
      <div className="mb-1.5">{icon}</div>
      <p className="text-2xl font-heading font-black text-foreground leading-none">{value}</p>
      <p className="text-[11px] font-bold text-foreground/80 mt-1">{label}</p>
      <p className="text-[10px] text-muted-foreground mt-0.5">{hint}</p>
    </div>
  );
}
