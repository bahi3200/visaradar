import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Brain, RefreshCw, TrendingUp, Calendar } from "lucide-react";
import { toast } from "sonner";

const DAYS_AR = ["الأحد", "الإثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];
const COUNTRIES = [
  { code: "ALL", name: "كل الدول" }, { code: "IT", name: "🇮🇹 إيطاليا" }, { code: "FR", name: "🇫🇷 فرنسا" },
  { code: "ES", name: "🇪🇸 إسبانيا" }, { code: "DE", name: "🇩🇪 ألمانيا" }, { code: "GR", name: "🇬🇷 اليونان" },
];
const PROVIDERS = [
  { code: "ALL", name: "كل المزودين" },
  { code: "VFS Global", name: "VFS Global" },
  { code: "Capago (TLScontact)", name: "Capago / TLS" },
  { code: "BLS International Algeria", name: "BLS International" },
];

type HeatCell = { weekday: number; hour: number; open_count: number; avg_duration_minutes: number | null };
type Window = { country_code: string; provider: string; weekday: number; hour: number; open_count: number; total_samples: number; score: number; last_seen_at: string | null };

export default function AdminHistoricalIntel() {
  const [country, setCountry] = useState("ALL");
  const [provider, setProvider] = useState("ALL");
  const [days, setDays] = useState(60);
  const [heat, setHeat] = useState<HeatCell[]>([]);
  const [windows, setWindows] = useState<Window[]>([]);
  const [loading, setLoading] = useState(false);
  const [recomputing, setRecomputing] = useState(false);

  const load = async () => {
    setLoading(true);
    const [{ data: h }, { data: w }] = await Promise.all([
      supabase.rpc("get_open_heatmap", {
        _country: country === "ALL" ? null : country,
        _provider: provider === "ALL" ? null : provider,
        _days: days,
      }),
      supabase.from("predictive_windows").select("*").order("score", { ascending: false }).limit(50),
    ]);
    setHeat((h || []) as HeatCell[]);
    setWindows((w || []) as Window[]);
    setLoading(false);
  };

  useEffect(() => { load(); }, [country, provider, days]);

  const recompute = async () => {
    setRecomputing(true);
    const { data, error } = await supabase.functions.invoke("compute-predictive-windows", { body: { days: 60 } });
    setRecomputing(false);
    if (error) toast.error("فشل: " + error.message);
    else { toast.success(`تمت إعادة الحساب: ${(data as any)?.inserted ?? 0} نافذة`); load(); }
  };

  const heatMap = useMemo(() => {
    const m = new Map<string, HeatCell>();
    for (const c of heat) m.set(`${c.weekday}-${c.hour}`, c);
    return m;
  }, [heat]);

  const maxCount = Math.max(1, ...heat.map(h => h.open_count));
  const totalOpenings = heat.reduce((s, h) => s + h.open_count, 0);
  const topWindow = [...heat].sort((a, b) => b.open_count - a.open_count)[0];

  const cellColor = (count: number) => {
    if (count === 0) return "bg-muted/30";
    const intensity = count / maxCount;
    if (intensity > 0.75) return "bg-red-500/80 text-white";
    if (intensity > 0.5) return "bg-orange-500/70 text-white";
    if (intensity > 0.25) return "bg-yellow-500/60";
    return "bg-green-500/40";
  };

  return (
    <div className="container mx-auto p-6 space-y-6" dir="rtl">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Brain className="h-7 w-7 text-primary" /> Historical Detection Intelligence
          </h1>
          <p className="text-muted-foreground mt-1">تحليل أنماط فتح المواعيد + نوافذ المسح التنبؤية</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Select value={country} onValueChange={setCountry}>
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>{COUNTRIES.map(c => <SelectItem key={c.code} value={c.code}>{c.name}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={provider} onValueChange={setProvider}>
            <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
            <SelectContent>{PROVIDERS.map(p => <SelectItem key={p.code} value={p.code}>{p.name}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={String(days)} onValueChange={(v) => setDays(parseInt(v))}>
            <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
            <SelectContent>{[7, 30, 60, 90, 180].map(d => <SelectItem key={d} value={String(d)}>{d} يوم</SelectItem>)}</SelectContent>
          </Select>
          <Button onClick={recompute} disabled={recomputing} variant="default">
            <RefreshCw className={`h-4 w-4 ml-2 ${recomputing ? "animate-spin" : ""}`} /> إعادة حساب التنبؤات
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">إجمالي حالات الفتح</CardTitle></CardHeader>
          <CardContent><div className="text-3xl font-bold">{totalOpenings}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">الذروة</CardTitle></CardHeader>
          <CardContent>
            {topWindow ? (
              <div>
                <div className="text-2xl font-bold">{DAYS_AR[topWindow.weekday]} • {topWindow.hour}:00</div>
                <div className="text-sm text-muted-foreground">{topWindow.open_count} حالة فتح</div>
              </div>
            ) : <div className="text-muted-foreground text-sm">لا توجد بيانات</div>}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">نوافذ تنبؤية محفوظة</CardTitle></CardHeader>
          <CardContent><div className="text-3xl font-bold text-primary">{windows.length}</div></CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Calendar className="h-5 w-5" /> Heatmap — حسب يوم/ساعة (Africa/Algiers)</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? <p className="text-center text-muted-foreground py-8">جارٍ التحميل...</p> : (
            <div className="overflow-x-auto">
              <table className="text-xs w-full">
                <thead>
                  <tr>
                    <th className="p-1"></th>
                    {Array.from({ length: 24 }, (_, h) => <th key={h} className="p-1 font-normal text-muted-foreground">{h}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {DAYS_AR.map((day, wd) => (
                    <tr key={wd}>
                      <td className="p-1 font-medium pr-2 whitespace-nowrap">{day}</td>
                      {Array.from({ length: 24 }, (_, h) => {
                        const cell = heatMap.get(`${wd}-${h}`);
                        const count = cell?.open_count ?? 0;
                        return (
                          <td key={h} className="p-0.5">
                            <div
                              className={`${cellColor(count)} rounded h-7 w-7 flex items-center justify-center text-[10px] font-medium border border-border/50`}
                              title={`${day} ${h}:00 — ${count} فتح${cell?.avg_duration_minutes ? ` • متوسط ${cell.avg_duration_minutes}د` : ""}`}
                            >
                              {count > 0 ? count : ""}
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="flex items-center gap-3 mt-4 text-xs text-muted-foreground">
                <span>الكثافة:</span>
                <span className="inline-block w-4 h-4 bg-green-500/40 rounded"></span><span>منخفض</span>
                <span className="inline-block w-4 h-4 bg-yellow-500/60 rounded"></span><span>متوسط</span>
                <span className="inline-block w-4 h-4 bg-orange-500/70 rounded"></span><span>عال</span>
                <span className="inline-block w-4 h-4 bg-red-500/80 rounded"></span><span>ذروة</span>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5" /> أفضل 50 نافذة تنبؤية للمسح
          </CardTitle>
          <p className="text-sm text-muted-foreground">المسح يتم تكثيفه تلقائياً خلال هذه الأوقات (تجاوز للـ cooldown الناعم).</p>
        </CardHeader>
        <CardContent>
          {windows.length === 0 ? (
            <p className="text-muted-foreground text-sm py-6 text-center">لم يتم حساب أي نوافذ بعد — اضغط "إعادة حساب التنبؤات"</p>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
              {windows.map(w => (
                <div key={`${w.country_code}-${w.provider}-${w.weekday}-${w.hour}`}
                  className="border rounded-lg p-3 bg-card hover:bg-accent/30 transition-colors">
                  <div className="flex justify-between items-start mb-1">
                    <span className="font-mono font-bold">{w.country_code}</span>
                    <Badge variant={w.score >= 20 ? "default" : "secondary"}>{w.score}%</Badge>
                  </div>
                  <div className="text-xs text-muted-foreground truncate" title={w.provider}>{w.provider}</div>
                  <div className="mt-2 text-sm font-medium">{DAYS_AR[w.weekday]} • {w.hour}:00</div>
                  <div className="text-xs text-muted-foreground mt-1">
                    {w.open_count} / {w.total_samples} فتح
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}