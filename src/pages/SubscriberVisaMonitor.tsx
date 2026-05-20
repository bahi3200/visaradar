import { useEffect, useMemo, useState } from "react";
import Layout from "@/components/Layout";
import SEO from "@/components/SEO";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import {
  Activity, CheckCircle, XCircle, AlertTriangle, Clock, Globe,
  Radar, TrendingUp, Timer, RefreshCw, ChevronLeft, ChevronRight,
  FileDown, FileText, Bell, BellOff,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { toast } from "sonner";

const COUNTRY_NAMES: Record<string, string> = {
  IT: "إيطاليا 🇮🇹", FR: "فرنسا 🇫🇷", ES: "إسبانيا 🇪🇸",
  DE: "ألمانيا 🇩🇪", GR: "اليونان 🇬🇷", PT: "البرتغال 🇵🇹",
  NL: "هولندا 🇳🇱", BE: "بلجيكا 🇧🇪", AT: "النمسا 🇦🇹",
  CH: "سويسرا 🇨🇭", GB: "بريطانيا 🇬🇧",
};
const cn = (c: string) => COUNTRY_NAMES[c] || c;

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: typeof CheckCircle }> = {
  open: { label: "مفتوح", color: "bg-green-500/10 text-green-400 border-green-500/30", icon: CheckCircle },
  closed: { label: "مغلق", color: "bg-red-500/10 text-red-400 border-red-500/30", icon: XCircle },
  unknown: { label: "غير معروف", color: "bg-amber-500/10 text-amber-400 border-amber-500/30", icon: AlertTriangle },
  error: { label: "خطأ", color: "bg-red-500/10 text-red-400 border-red-500/30", icon: XCircle },
  changed: { label: "تغيّر", color: "bg-blue-500/10 text-blue-400 border-blue-500/30", icon: Activity },
};

const RANGES = [
  { key: "24h", label: "آخر 24 ساعة", hours: 24 },
  { key: "7d", label: "آخر 7 أيام", hours: 24 * 7 },
  { key: "30d", label: "آخر 30 يوماً", hours: 24 * 30 },
] as const;

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "الآن";
  if (mins < 60) return `منذ ${mins} دقيقة`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `منذ ${hours} ساعة`;
  return `منذ ${Math.floor(hours / 24)} يوم`;
}

interface OpenEvent {
  id: string;
  country_code: string;
  provider: string;
  opened_at: string;
  closed_at: string | null;
  duration_minutes: number | null;
}

export default function SubscriberVisaMonitor() {
  const { user } = useAuth();
  const { isPrivileged } = useIsAdmin();
  const [range, setRange] = useState<(typeof RANGES)[number]["key"]>("7d");
  const [filterCountry, setFilterCountry] = useState<string>("all");
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 20;
  const queryClient = useQueryClient();
  const [alertsEnabled, setAlertsEnabled] = useState<boolean>(() => {
    if (typeof window === "undefined") return true;
    return localStorage.getItem("visa_monitor_alerts") !== "off";
  });

  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem("visa_monitor_alerts", alertsEnabled ? "on" : "off");
    }
  }, [alertsEnabled]);

  const playBeep = () => {
    try {
      const Ctx = (window as any).AudioContext || (window as any).webkitAudioContext;
      if (!Ctx) return;
      const ctx = new Ctx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = "sine";
      osc.frequency.value = 880;
      gain.gain.setValueAtTime(0.001, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.15, ctx.currentTime + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
      osc.start();
      osc.stop(ctx.currentTime + 0.45);
    } catch { /* ignore */ }
  };

  // User's active subscription countries (admins see all)
  const { data: subCountries = [] } = useQuery({
    queryKey: ["sub-monitor-countries", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase
        .from("subscriptions")
        .select("countries")
        .eq("user_id", user!.id)
        .eq("status", "active")
        .gt("expires_at", new Date().toISOString())
        .order("expires_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      return (data?.countries as string[]) || [];
    },
  });

  const countries = useMemo(
    () => (isPrivileged ? [] : subCountries),
    [isPrivileged, subCountries]
  );

  // Latest check per (country, provider) — live status
  const { data: latestChecks = [], refetch: refetchLatest, isFetching } = useQuery({
    queryKey: ["sub-latest-checks", countries],
    refetchInterval: 60_000,
    queryFn: async () => {
      let q = supabase
        .from("visa_monitor_checks")
        .select("id,country_code,provider,status,previous_status,checked_at,detection_method")
        .order("checked_at", { ascending: false })
        .limit(500);
      if (countries.length > 0) q = q.in("country_code", countries);
      const { data } = await q;
      // Dedupe — keep most recent per country|provider
      const seen = new Set<string>();
      const latest: any[] = [];
      for (const row of data || []) {
        const k = `${row.country_code}|${row.provider}`;
        if (seen.has(k)) continue;
        seen.add(k);
        latest.push(row);
      }
      return latest;
    },
  });

  // Opening events history
  const since = useMemo(() => {
    const r = RANGES.find((x) => x.key === range)!;
    return new Date(Date.now() - r.hours * 3600 * 1000).toISOString();
  }, [range]);

  const { data: events = [], isLoading: loadingEvents } = useQuery({
    queryKey: ["sub-open-events", countries, since],
    queryFn: async () => {
      let q = supabase
        .from("visa_open_events" as any)
        .select("id,country_code,provider,opened_at,closed_at,duration_minutes")
        .gte("opened_at", since)
        .order("opened_at", { ascending: false })
        .limit(500);
      if (countries.length > 0) q = q.in("country_code", countries);
      const { data } = await q;
      return (data || []) as unknown as OpenEvent[];
    },
  });

  // Realtime: refresh on new checks + show alerts on status changes
  useEffect(() => {
    const ch = supabase
      .channel("sub-visa-monitor")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "visa_monitor_checks" },
        (payload) => {
          const row: any = payload.new;
          if (!row) return;

          // Filter to user's countries (admins see all)
          if (!isPrivileged && countries.length > 0 && !countries.includes(row.country_code)) return;

          refetchLatest();

          const prev = row.previous_status;
          const curr = row.status;
          const changed = prev && prev !== curr;
          const isOpening = curr === "open" && prev !== "open";

          // Always refresh events list when a new opening is detected
          if (isOpening) {
            queryClient.invalidateQueries({ queryKey: ["sub-open-events"] });
          }

          if (!alertsEnabled) return;

          if (isOpening) {
            toast.success(`🎉 فتحة جديدة: ${cn(row.country_code)}`, {
              description: `المزوّد ${String(row.provider).toUpperCase()} أصبح مفتوحاً الآن`,
              duration: 8000,
            });
            playBeep();
          } else if (changed) {
            const cfg = STATUS_CONFIG[curr] || STATUS_CONFIG.unknown;
            toast(`تغيّر الحالة: ${cn(row.country_code)}`, {
              description: `${String(row.provider).toUpperCase()} — ${cfg.label}`,
              duration: 6000,
            });
          }
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [refetchLatest, queryClient, alertsEnabled, isPrivileged, countries]);

  const filteredEvents = useMemo(
    () => events.filter((e) => filterCountry === "all" || e.country_code === filterCountry),
    [events, filterCountry]
  );

  const totalPages = Math.max(1, Math.ceil(filteredEvents.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const paginatedEvents = filteredEvents.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  // Reset page when filters change
  useEffect(() => {
    setPage(1);
  }, [range, filterCountry]);

  const stats = useMemo(() => {
    const total = events.length;
    const stillOpen = events.filter((e) => !e.closed_at).length;
    const durations = events.filter((e) => e.duration_minutes != null).map((e) => e.duration_minutes!);
    const avg = durations.length ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length) : 0;
    return { total, stillOpen, avg };
  }, [events]);

  const fmtDur = (min: number | null) => {
    if (min == null) return "—";
    if (min < 60) return `${min} د`;
    const h = Math.floor(min / 60);
    const m = min % 60;
    return m ? `${h} س ${m} د` : `${h} س`;
  };

  const rangeLabel = RANGES.find((r) => r.key === range)?.label || range;
  const fmtDate = (s: string) => new Date(s).toLocaleString("ar", { hour12: false });

  const exportCSV = () => {
    if (filteredEvents.length === 0) {
      toast.error("لا توجد بيانات للتصدير");
      return;
    }
    const headers = ["الدولة", "رمز الدولة", "المزوّد", "فُتحت في", "أُغلقت في", "المدة (دقائق)", "الحالة"];
    const rows = filteredEvents.map((e) => [
      cn(e.country_code),
      e.country_code,
      e.provider,
      fmtDate(e.opened_at),
      e.closed_at ? fmtDate(e.closed_at) : "—",
      e.duration_minutes ?? "",
      e.closed_at ? "مغلق" : "مفتوح",
    ]);
    const csv = [headers, ...rows]
      .map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `visa-openings-${range}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("تم تصدير ملف CSV");
  };

  const exportPDF = () => {
    if (filteredEvents.length === 0) {
      toast.error("لا توجد بيانات للتصدير");
      return;
    }
    const doc = new jsPDF({ orientation: "landscape" });
    doc.setFontSize(14);
    doc.text("Visa Openings Log", 14, 15);
    doc.setFontSize(10);
    doc.text(`Period: ${rangeLabel}  |  Country: ${filterCountry === "all" ? "All" : filterCountry}`, 14, 22);
    doc.text(`Generated: ${new Date().toLocaleString()}`, 14, 28);
    doc.text(
      `Total: ${filteredEvents.length}  |  Still open: ${stats.stillOpen}  |  Avg duration: ${fmtDur(stats.avg)}`,
      14,
      34
    );

    autoTable(doc, {
      startY: 40,
      head: [["Country", "Provider", "Opened At", "Closed At", "Duration (min)", "Status"]],
      body: filteredEvents.map((e) => [
        e.country_code,
        e.provider.toUpperCase(),
        new Date(e.opened_at).toLocaleString(),
        e.closed_at ? new Date(e.closed_at).toLocaleString() : "—",
        e.duration_minutes ?? "—",
        e.closed_at ? "Closed" : "Open",
      ]),
      styles: { fontSize: 8 },
      headStyles: { fillColor: [15, 23, 42] },
    });

    doc.save(`visa-openings-${range}-${new Date().toISOString().slice(0, 10)}.pdf`);
    toast.success("تم تصدير ملف PDF");
  };

  return (
    <Layout>
      <SEO title="مراقبة التأشيرات | VisaRadar" description="تتبع لحظي لحالة مواقع التأشيرات والفتحات الأخيرة لباقتك" />
      <div className="container py-8 space-y-6">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-start justify-between flex-wrap gap-3"
        >
          <div>
            <h1 className="font-heading text-2xl md:text-3xl font-bold flex items-center gap-2">
              <Radar className="w-7 h-7 text-accent" /> مراقبة التأشيرات
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              {isPrivileged
                ? "عرض جميع الدول (وضع المسؤول)"
                : countries.length
                  ? `يتم تتبع: ${countries.map(cn).join("، ")}`
                  : "لا توجد دول في اشتراكك الحالي"}
            </p>
          </div>
          <button
            onClick={() => refetchLatest()}
            disabled={isFetching}
            className="inline-flex items-center gap-2 text-xs px-3 py-2 rounded-lg border border-border hover:bg-secondary/50 disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isFetching ? "animate-spin" : ""}`} /> تحديث
          </button>
        </motion.div>

        {/* Live status */}
        <section className="bg-card border border-border/50 rounded-2xl p-4">
          <h2 className="font-bold mb-3 flex items-center gap-2">
            <Activity className="w-4 h-4 text-accent" /> الحالة المباشرة لكل مزوّد
          </h2>
          {latestChecks.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">لا توجد بيانات بعد لدولك المختارة.</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {latestChecks.map((c) => {
                const cfg = STATUS_CONFIG[c.status] || STATUS_CONFIG.unknown;
                const Icon = cfg.icon;
                return (
                  <div key={c.id} className={`rounded-xl border p-3 ${cfg.color}`}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-bold text-sm flex items-center gap-1.5">
                        <Globe className="w-3.5 h-3.5" /> {cn(c.country_code)}
                      </span>
                      <Icon className="w-4 h-4" />
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <span className="opacity-80 uppercase">{c.provider}</span>
                      <span className="font-bold">{cfg.label}</span>
                    </div>
                    <div className="text-[10px] opacity-70 mt-1 flex items-center gap-1">
                      <Clock className="w-3 h-3" /> {timeAgo(c.checked_at)}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-card border border-border/50 rounded-xl p-3">
            <div className="text-[10px] text-muted-foreground flex items-center gap-1"><TrendingUp className="w-3 h-3" /> فتحات</div>
            <div className="text-xl font-bold">{stats.total}</div>
          </div>
          <div className="bg-card border border-border/50 rounded-xl p-3">
            <div className="text-[10px] text-muted-foreground flex items-center gap-1"><CheckCircle className="w-3 h-3" /> مفتوحة الآن</div>
            <div className="text-xl font-bold text-green-500">{stats.stillOpen}</div>
          </div>
          <div className="bg-card border border-border/50 rounded-xl p-3">
            <div className="text-[10px] text-muted-foreground flex items-center gap-1"><Timer className="w-3 h-3" /> متوسط المدة</div>
            <div className="text-xl font-bold">{fmtDur(stats.avg)}</div>
          </div>
        </div>

        {/* History */}
        <section className="bg-card border border-border/50 rounded-2xl p-4">
          <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
            <h2 className="font-bold flex items-center gap-2">
              <Clock className="w-4 h-4 text-accent" /> سجل الفتحات الأخيرة
            </h2>
            <div className="flex items-center gap-2">
              <Select value={range} onValueChange={(v) => setRange(v as any)}>
                <SelectTrigger className="w-[140px] h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {RANGES.map((r) => <SelectItem key={r.key} value={r.key}>{r.label}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={filterCountry} onValueChange={setFilterCountry}>
                <SelectTrigger className="w-[140px] h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">كل الدول</SelectItem>
                  {(countries.length ? countries : [...new Set(events.map((e) => e.country_code))]).map((c) => (
                    <SelectItem key={c} value={c}>{cn(c)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <button
                onClick={exportCSV}
                className="inline-flex items-center gap-1.5 text-xs px-3 h-8 rounded-md border border-border hover:bg-secondary/50"
                title="تصدير CSV"
              >
                <FileDown className="w-3.5 h-3.5" /> CSV
              </button>
              <button
                onClick={exportPDF}
                className="inline-flex items-center gap-1.5 text-xs px-3 h-8 rounded-md border border-border hover:bg-secondary/50"
                title="تصدير PDF"
              >
                <FileText className="w-3.5 h-3.5" /> PDF
              </button>
            </div>
          </div>

          {loadingEvents ? (
            <p className="text-sm text-muted-foreground py-6 text-center">جاري التحميل…</p>
          ) : filteredEvents.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">لا توجد فتحات في هذه الفترة.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>الدولة</TableHead>
                    <TableHead>المزوّد</TableHead>
                    <TableHead>فُتحت</TableHead>
                    <TableHead>المدة</TableHead>
                    <TableHead>الحالة</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedEvents.map((e) => (
                    <TableRow key={e.id}>
                      <TableCell className="font-medium">{cn(e.country_code)}</TableCell>
                      <TableCell className="uppercase text-xs">{e.provider}</TableCell>
                      <TableCell className="text-xs">{timeAgo(e.opened_at)}</TableCell>
                      <TableCell className="text-xs">{fmtDur(e.duration_minutes)}</TableCell>
                      <TableCell>
                        {e.closed_at ? (
                          <Badge variant="outline" className="text-[10px]">مغلق</Badge>
                        ) : (
                          <Badge className="text-[10px] bg-green-500/15 text-green-500 border-green-500/30">مفتوح</Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          {/* Pagination */}
          {filteredEvents.length > 0 && (
            <div className="flex items-center justify-between mt-4 pt-3 border-t border-border/40">
              <span className="text-xs text-muted-foreground">
                {filteredEvents.length} نتيجة · صفحة {safePage} من {totalPages}
              </span>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={safePage <= 1}
                  className="inline-flex items-center justify-center h-8 w-8 rounded-md border border-border bg-transparent hover:bg-secondary disabled:opacity-40 disabled:cursor-not-allowed"
                  aria-label="الصفحة السابقة"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
                {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
                  <button
                    key={p}
                    onClick={() => setPage(p)}
                    className={`inline-flex items-center justify-center h-8 w-8 rounded-md text-xs font-medium border transition-colors ${
                      p === safePage
                        ? "bg-primary text-primary-foreground border-primary"
                        : "border-border bg-transparent hover:bg-secondary text-foreground"
                    }`}
                  >
                    {p}
                  </button>
                ))}
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={safePage >= totalPages}
                  className="inline-flex items-center justify-center h-8 w-8 rounded-md border border-border bg-transparent hover:bg-secondary disabled:opacity-40 disabled:cursor-not-allowed"
                  aria-label="الصفحة التالية"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </section>
      </div>
    </Layout>
  );
}
