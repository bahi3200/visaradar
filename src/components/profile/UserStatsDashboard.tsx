import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { motion } from "framer-motion";
import { formatRelativeArabic, formatFullDateAr } from "@/lib/relativeTime";
import {
  Bell,
  CheckCircle2,
  XCircle,
  Calendar,
  Globe,
  Loader2,
  TrendingUp,
  Clock,
  Crown,
  Radar,
  Activity,
  Timer,
  Flame,
  ArrowUpRight,
  ArrowDownRight,
  Minus,
  ExternalLink,
  Zap,
} from "lucide-react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Cell,
} from "recharts";

interface CountryStatus {
  country_code: string;
  status: string;
  checked_at: string;
  previous_status: string | null;
}

interface SubscriptionInfo {
  expires_at: string;
  countries: string[];
  package_name: string | null;
}

const COUNTRY_NAMES_AR: Record<string, string> = {
  IT: "إيطاليا",
  FR: "فرنسا",
  ES: "إسبانيا",
  DE: "ألمانيا",
  GR: "اليونان",
  PT: "البرتغال",
  NL: "هولندا",
  BE: "بلجيكا",
  AT: "النمسا",
  CH: "سويسرا",
  GB: "بريطانيا",
  US: "أمريكا",
  CA: "كندا",
};

const getCountryName = (code: string) => COUNTRY_NAMES_AR[code] || code;

export default function UserStatsDashboard() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [subscription, setSubscription] = useState<SubscriptionInfo | null>(null);
  const [latestStatuses, setLatestStatuses] = useState<CountryStatus[]>([]);
  const [history, setHistory] = useState<CountryStatus[]>([]);
  const [notificationsCount, setNotificationsCount] = useState(0);
  const [perCountryAlerts, setPerCountryAlerts] = useState<Record<string, number>>({});
  const [lastOpenByCountry, setLastOpenByCountry] = useState<Record<string, string>>({});
  const [openCountByCountry, setOpenCountByCountry] = useState<Record<string, number>>({});
  const [lastCheckByCountry, setLastCheckByCountry] = useState<Record<string, string>>({});
  const [avgDurationByCountry, setAvgDurationByCountry] = useState<Record<string, number>>({});
  const [peakHourByCountry, setPeakHourByCountry] = useState<Record<string, number | null>>({});
  const [totalOpenMinutes, setTotalOpenMinutes] = useState(0);
  const [thisWeekOpens, setThisWeekOpens] = useState(0);
  const [lastWeekOpens, setLastWeekOpens] = useState(0);
  const [dailyActivity, setDailyActivity] = useState<{ day: string; opens: number }[]>([]);
  const [bookingUrlByCountry, setBookingUrlByCountry] = useState<Record<string, string>>({});
  const [liveTick, setLiveTick] = useState(0);

  const fetchAll = async (userCountriesArg?: string[]) => {
    if (!user) return;
      // 1) Fetch active subscription
      const { data: sub } = await supabase
        .from("subscriptions")
        .select("expires_at, countries, packages(name_ar)")
        .eq("user_id", user.id)
        .eq("status", "active")
        .gt("expires_at", new Date().toISOString())
        .order("expires_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      const userCountries: string[] = userCountriesArg ?? sub?.countries ?? [];
      setSubscription(
        sub
          ? {
              expires_at: sub.expires_at,
              countries: userCountries,
              package_name: (sub.packages as { name_ar: string } | null)?.name_ar || null,
            }
          : null
      );

      if (userCountries.length === 0) {
        setLoading(false);
        return;
      }

      // 2) Latest status for each subscribed country
      const { data: checks } = await supabase
        .from("visa_monitor_checks")
        .select("country_code, status, checked_at, previous_status")
        .in("country_code", userCountries)
        .order("checked_at", { ascending: false })
        .limit(500);

      const latestMap = new Map<string, CountryStatus>();
      const historyList: CountryStatus[] = [];
      const lastCheckMap: Record<string, string> = {};
      checks?.forEach((c) => {
        if (!latestMap.has(c.country_code)) {
          latestMap.set(c.country_code, c);
          lastCheckMap[c.country_code] = c.checked_at;
        }
        // Track only meaningful status changes for history
        if (c.previous_status && c.previous_status !== c.status) {
          historyList.push(c);
        }
      });
      setLatestStatuses(Array.from(latestMap.values()));
      setHistory(historyList.slice(0, 10));
      setLastCheckByCountry(lastCheckMap);

      // 3) Notifications count (last 30 days) for subscribed countries
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      const { data: notifs } = await supabase
        .from("visa_notifications")
        .select("country_code, sent_count, created_at")
        .in("country_code", userCountries)
        .gte("created_at", thirtyDaysAgo);

      const perCountry: Record<string, number> = {};
      let total = 0;
      notifs?.forEach((n) => {
        perCountry[n.country_code] = (perCountry[n.country_code] || 0) + 1;
        total += 1;
      });
      setNotificationsCount(total);
      setPerCountryAlerts(perCountry);

      // 4) Open events analytics (last 90 days)
      const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
      const { data: opens } = await supabase
        .from("visa_open_events" as any)
        .select("country_code, opened_at, duration_minutes")
        .in("country_code", userCountries)
        .gte("opened_at", ninetyDaysAgo)
        .order("opened_at", { ascending: false })
        .limit(500);

      const lastMap: Record<string, string> = {};
      const countMap: Record<string, number> = {};
      const durations: Record<string, number[]> = {};
      const hours: Record<string, number[]> = {};
      let openMinutes = 0;
      let weekNow = 0;
      let weekPrev = 0;
      const dailyMap: Record<string, number> = {};
      const nowMs = Date.now();
      const weekMs = 7 * 24 * 60 * 60 * 1000;
      type OpenEv = { country_code: string; opened_at: string; duration_minutes: number | null };
      (opens as unknown as OpenEv[] | null)?.forEach((o) => {
        countMap[o.country_code] = (countMap[o.country_code] || 0) + 1;
        if (!lastMap[o.country_code]) lastMap[o.country_code] = o.opened_at;
        const d = new Date(o.opened_at);
        const hr = d.getHours();
        (hours[o.country_code] ||= []).push(hr);
        if (typeof o.duration_minutes === "number") {
          (durations[o.country_code] ||= []).push(o.duration_minutes);
          openMinutes += o.duration_minutes;
        }
        const age = nowMs - d.getTime();
        if (age < weekMs) weekNow += 1;
        else if (age < 2 * weekMs) weekPrev += 1;
        if (age < 14 * 24 * 60 * 60 * 1000) {
          const key = d.toISOString().slice(0, 10);
          dailyMap[key] = (dailyMap[key] || 0) + 1;
        }
      });
      setLastOpenByCountry(lastMap);
      setOpenCountByCountry(countMap);
      setTotalOpenMinutes(openMinutes);
      setThisWeekOpens(weekNow);
      setLastWeekOpens(weekPrev);

      // Averages & peak hour
      const avgMap: Record<string, number> = {};
      Object.entries(durations).forEach(([c, arr]) => {
        avgMap[c] = Math.round(arr.reduce((a, b) => a + b, 0) / arr.length);
      });
      setAvgDurationByCountry(avgMap);

      const peakMap: Record<string, number | null> = {};
      Object.entries(hours).forEach(([c, arr]) => {
        const counts: Record<number, number> = {};
        arr.forEach((h) => (counts[h] = (counts[h] || 0) + 1));
        let best: number | null = null;
        let bestCount = 0;
        Object.entries(counts).forEach(([h, n]) => {
          if (n > bestCount) {
            best = Number(h);
            bestCount = n;
          }
        });
        peakMap[c] = best;
      });
      setPeakHourByCountry(peakMap);

      // Daily activity last 14 days (zero-fill)
      const activity: { day: string; opens: number }[] = [];
      for (let i = 13; i >= 0; i--) {
        const d = new Date(nowMs - i * 24 * 60 * 60 * 1000);
        const key = d.toISOString().slice(0, 10);
        activity.push({
          day: d.toLocaleDateString("ar-DZ", { day: "numeric", month: "short" }),
          opens: dailyMap[key] || 0,
        });
      }
      setDailyActivity(activity);

      // 5) Booking URLs from active appointments (for currently-open countries)
      const { data: appts } = await supabase
        .from("visa_appointments")
        .select("country_code, booking_url")
        .in("country_code", userCountries)
        .eq("is_active", true)
        .not("booking_url", "is", null)
        .order("created_at", { ascending: false })
        .limit(200);
      const urlMap: Record<string, string> = {};
      appts?.forEach((a) => {
        if (a.booking_url && !urlMap[a.country_code]) urlMap[a.country_code] = a.booking_url;
      });
      setBookingUrlByCountry(urlMap);

      setLoading(false);
      return userCountries;
  };

  useEffect(() => {
    if (!user) return;
    let channel: ReturnType<typeof supabase.channel> | null = null;
    (async () => {
      const countries = await fetchAll();
      if (!countries || countries.length === 0) return;
      // Realtime: refresh on any new monitor check or open event for our countries
      channel = supabase
        .channel(`user-monitor-${user.id}`)
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "visa_monitor_checks" },
          (payload: any) => {
            if (countries.includes(payload.new?.country_code)) {
              fetchAll(countries);
            }
          }
        )
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "visa_open_events" },
          (payload: any) => {
            const code = payload.new?.country_code || payload.old?.country_code;
            if (countries.includes(code)) fetchAll(countries);
          }
        )
        .subscribe();
    })();
    return () => {
      if (channel) supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  // Tick every 30s to refresh relative time labels even without DB events
  useEffect(() => {
    const id = setInterval(() => setLiveTick((t) => t + 1), 30_000);
    return () => clearInterval(id);
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  if (!subscription) {
    return (
      <div className="rounded-xl border border-border/60 bg-card p-6 text-center">
        <Globe className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
        <p className="text-sm text-muted-foreground">
          لا يوجد اشتراك نشط حالياً. اشترك لرؤية إحصائياتك الشخصية.
        </p>
      </div>
    );
  }

  const openCount = latestStatuses.filter((s) => s.status === "open").length;
  const closedCount = latestStatuses.filter((s) => s.status === "closed").length;
  const daysLeft = Math.max(
    0,
    Math.ceil((new Date(subscription.expires_at).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
  );

  const chartData = subscription.countries.map((code) => ({
    name: getCountryName(code),
    code,
    alerts: perCountryAlerts[code] || 0,
  }));

  const weekDelta = thisWeekOpens - lastWeekOpens;
  const weekDeltaPct =
    lastWeekOpens > 0
      ? Math.round((weekDelta / lastWeekOpens) * 100)
      : thisWeekOpens > 0
      ? 100
      : 0;
  const maxDaily = Math.max(1, ...dailyActivity.map((d) => d.opens));
  const formatHour = (h: number | null) =>
    h === null ? "—" : `${String(h).padStart(2, "0")}:00`;
  const formatDuration = (mins: number) => {
    if (mins < 60) return `${mins} د`;
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return m ? `${h}س ${m}د` : `${h}س`;
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6"
    >
      {/* Live monitoring banner */}
      <div className="rounded-xl border border-green-500/30 bg-gradient-to-l from-green-500/10 via-card to-card p-3 flex items-center gap-3">
        <div className="relative shrink-0">
          <Activity className="w-5 h-5 text-green-500" />
          <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-green-500 animate-ping" />
          <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-green-500" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-bold text-foreground">المراقبة نشطة الآن</p>
          <p className="text-[11px] text-muted-foreground">
            تحديث مباشر فور تغيّر حالة أي دولة من باقتك
            <span className="hidden">{liveTick}</span>
          </p>
        </div>
        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-green-500/15 text-green-500 border border-green-500/30">
          LIVE
        </span>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 gap-3">
        <KpiCard
          icon={<Bell className="w-5 h-5" />}
          label="تنبيهات مستلمة"
          value={notificationsCount}
          hint="آخر 30 يوماً"
          tone="primary"
        />
        <KpiCard
          icon={<CheckCircle2 className="w-5 h-5" />}
          label="مواعيد مفتوحة"
          value={openCount}
          hint={`من ${subscription.countries.length} دولة`}
          tone="success"
        />
        <KpiCard
          icon={<Globe className="w-5 h-5" />}
          label="دول مُتابَعة"
          value={subscription.countries.length}
          hint="ضمن باقتك"
          tone="accent"
        />
        <KpiCard
          icon={<Clock className="w-5 h-5" />}
          label="أيام متبقية"
          value={daysLeft}
          hint={subscription.package_name || "اشتراكك"}
          tone={daysLeft <= 7 ? "warning" : "muted"}
        />
      </div>

      {/* Power stats */}
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-xl border border-border/60 bg-card p-3">
          <div className="flex items-center gap-1.5 mb-1.5 text-muted-foreground">
            <Timer className="w-4 h-4 text-primary" />
            <span className="text-[11px] font-bold">إجمالي وقت الفتح</span>
          </div>
          <p className="text-xl font-heading font-black text-foreground leading-none">
            {formatDuration(totalOpenMinutes)}
          </p>
          <p className="text-[10px] text-muted-foreground mt-1">آخر 90 يوماً</p>
        </div>
        <div className="rounded-xl border border-border/60 bg-card p-3">
          <div className="flex items-center gap-1.5 mb-1.5 text-muted-foreground">
            <TrendingUp className="w-4 h-4 text-accent" />
            <span className="text-[11px] font-bold">هذا الأسبوع</span>
          </div>
          <div className="flex items-baseline gap-2">
            <p className="text-xl font-heading font-black text-foreground leading-none">
              {thisWeekOpens}
            </p>
            <span
              className={`inline-flex items-center gap-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                weekDelta > 0
                  ? "bg-green-500/15 text-green-500"
                  : weekDelta < 0
                  ? "bg-red-500/15 text-red-500"
                  : "bg-muted text-muted-foreground"
              }`}
            >
              {weekDelta > 0 ? (
                <ArrowUpRight className="w-3 h-3" />
              ) : weekDelta < 0 ? (
                <ArrowDownRight className="w-3 h-3" />
              ) : (
                <Minus className="w-3 h-3" />
              )}
              {weekDeltaPct > 0 && weekDelta > 0 ? "+" : ""}
              {weekDeltaPct}%
            </span>
          </div>
          <p className="text-[10px] text-muted-foreground mt-1">
            مقابل {lastWeekOpens} الأسبوع الماضي
          </p>
        </div>
      </div>

      {/* 14-day activity sparkline */}
      {dailyActivity.some((d) => d.opens > 0) && (
        <div className="rounded-xl border border-border/60 bg-card p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-heading font-bold text-sm text-foreground flex items-center gap-2">
              <Activity className="w-4 h-4 text-primary" />
              نشاط آخر 14 يوماً
            </h3>
            <span className="text-[10px] text-muted-foreground">عدد الفتحات اليومية</span>
          </div>
          <div className="flex items-end gap-1 h-20" dir="ltr">
            {dailyActivity.map((d, i) => {
              const h = (d.opens / maxDaily) * 100;
              return (
                <div
                  key={i}
                  className="flex-1 flex flex-col justify-end items-center group relative"
                  title={`${d.day}: ${d.opens}`}
                >
                  <div
                    className={`w-full rounded-t transition-all ${
                      d.opens > 0 ? "bg-primary" : "bg-muted"
                    }`}
                    style={{ height: d.opens > 0 ? `${Math.max(8, h)}%` : "4px" }}
                  />
                </div>
              );
            })}
          </div>
          <div className="flex justify-between text-[9px] text-muted-foreground mt-1" dir="ltr">
            <span>{dailyActivity[0]?.day}</span>
            <span>{dailyActivity[dailyActivity.length - 1]?.day}</span>
          </div>
        </div>
      )}

      {/* Subscription summary */}
      <div className="rounded-xl border border-primary/20 bg-card p-4">
        <div className="flex items-center gap-2 mb-3">
          <Crown className="w-4 h-4 text-accent" />
          <h3 className="font-heading font-bold text-sm text-foreground">معلومات الاشتراك</h3>
        </div>
        <div className="grid grid-cols-2 gap-3 text-xs">
          <InfoRow label="الباقة" value={subscription.package_name || "—"} />
          <InfoRow
            label="تنتهي في"
            value={new Date(subscription.expires_at).toLocaleDateString("ar-DZ")}
          />
          <div className="col-span-2">
            <p className="text-muted-foreground mb-1.5">الدول:</p>
            <div className="flex flex-wrap gap-1.5">
              {subscription.countries.map((c) => (
                <span
                  key={c}
                  className="px-2 py-0.5 rounded-full bg-primary/10 text-primary text-[11px] font-medium"
                >
                  {getCountryName(c)}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Chart */}
      {notificationsCount > 0 && (
        <div className="rounded-xl border border-border/60 bg-card p-4">
          <div className="flex items-center gap-2 mb-3">
            <TrendingUp className="w-4 h-4 text-primary" />
            <h3 className="font-heading font-bold text-sm text-foreground">
              التنبيهات حسب الدولة
            </h3>
          </div>
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
                <XAxis
                  dataKey="name"
                  tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
                  axisLine={{ stroke: "hsl(var(--border))" }}
                />
                <YAxis
                  tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
                  axisLine={{ stroke: "hsl(var(--border))" }}
                  allowDecimals={false}
                />
                <Tooltip
                  contentStyle={{
                    background: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                  cursor={{ fill: "hsl(var(--primary) / 0.05)" }}
                />
                <Bar dataKey="alerts" radius={[6, 6, 0, 0]}>
                  {chartData.map((_, i) => (
                    <Cell key={i} fill="hsl(var(--primary))" />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Per-country status */}
      <div className="rounded-xl border border-border/60 bg-card p-4">
        <h3 className="font-heading font-bold text-sm text-foreground mb-3 flex items-center gap-2">
          <Globe className="w-4 h-4 text-primary" />
          الحالة الحالية لكل دولة
        </h3>
        <div className="space-y-2">
          {subscription.countries.map((code) => {
            const status = latestStatuses.find((s) => s.country_code === code);
            const isOpen = status?.status === "open";
            const lastOpen = lastOpenByCountry[code];
            const opens = openCountByCountry[code] || 0;
            const lastCheck = lastCheckByCountry[code];
            const avgDur = avgDurationByCountry[code];
            const peak = peakHourByCountry[code];
            const bookingUrl = bookingUrlByCountry[code];
            return (
              <div
                key={code}
                className={`rounded-lg px-3 py-2.5 space-y-1.5 ${
                  isOpen
                    ? "bg-green-500/10 border border-green-500/30"
                    : "bg-muted/30"
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {isOpen ? (
                      <div className="relative">
                        <CheckCircle2 className="w-4 h-4 text-green-500" />
                        <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full bg-green-500 animate-ping" />
                      </div>
                    ) : (
                      <XCircle className="w-4 h-4 text-muted-foreground" />
                    )}
                    <span className="text-sm font-medium text-foreground">
                      {getCountryName(code)}
                    </span>
                  </div>
                  <span
                    className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${
                      isOpen
                        ? "bg-green-500/15 text-green-500"
                        : status?.status === "closed"
                        ? "bg-muted text-muted-foreground"
                        : "bg-yellow-500/15 text-yellow-500"
                    }`}
                  >
                    {isOpen ? "مفتوح" : status?.status === "closed" ? "مغلق" : "غير معروف"}
                  </span>
                </div>

                {isOpen && bookingUrl && (
                  <a
                    href={bookingUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-[11px] font-bold bg-green-500 text-white px-3 py-1.5 rounded-full hover:bg-green-600 transition-colors"
                  >
                    <Zap className="w-3 h-3" />
                    احجز الآن
                    <ExternalLink className="w-3 h-3" />
                  </a>
                )}

                <div className="flex items-center justify-between text-[11px] pt-1 border-t border-border/30">
                  <div className="flex items-center gap-1.5 text-muted-foreground">
                    <Radar className="w-3 h-3" />
                    {lastOpen ? (
                      <span>
                        آخر فتح:{" "}
                        <span className="text-foreground font-bold">
                          {formatFullDateAr(lastOpen)}
                        </span>{" "}
                        <span className="text-muted-foreground">({formatRelativeArabic(lastOpen)})</span>
                      </span>
                    ) : (
                      <span>لا توجد فتحات مسجلة آخر 90 يوماً</span>
                    )}
                  </div>
                  {opens > 0 && (
                    <span className="text-accent font-bold">{opens} فتحة</span>
                  )}
                </div>

                {/* Extended per-country analytics */}
                <div className="grid grid-cols-3 gap-2 text-[10px] pt-1">
                  <MiniStat
                    icon={<Activity className="w-3 h-3" />}
                    label="آخر فحص"
                    value={lastCheck ? formatRelativeArabic(lastCheck) : "—"}
                  />
                  <MiniStat
                    icon={<Timer className="w-3 h-3" />}
                    label="متوسط الفتح"
                    value={avgDur ? formatDuration(avgDur) : "—"}
                  />
                  <MiniStat
                    icon={<Flame className="w-3 h-3" />}
                    label="أكثر ساعة"
                    value={formatHour(peak ?? null)}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* History timeline */}
      {history.length > 0 && (
        <div className="rounded-xl border border-border/60 bg-card p-4">
          <h3 className="font-heading font-bold text-sm text-foreground mb-3 flex items-center gap-2">
            <Calendar className="w-4 h-4 text-primary" />
            تاريخ تغيرات الدول
          </h3>
          <div className="space-y-2.5">
            {history.map((h, i) => (
              <div key={i} className="flex items-start gap-3 text-xs">
                <div
                  className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${
                    h.status === "open" ? "bg-green-500" : "bg-muted-foreground"
                  }`}
                />
                <div className="flex-1 min-w-0">
                  <p className="text-foreground font-medium">
                    {getCountryName(h.country_code)}{" "}
                    <span className="text-muted-foreground font-normal">
                      أصبح {h.status === "open" ? "مفتوحاً" : "مغلقاً"}
                    </span>
                  </p>
                  <p className="text-muted-foreground text-[11px]">
                    {new Date(h.checked_at).toLocaleString("ar-DZ", {
                      day: "numeric",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </motion.div>
  );
}

function KpiCard({
  icon,
  label,
  value,
  hint,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  hint: string;
  tone: "primary" | "success" | "accent" | "warning" | "muted";
}) {
  const tones: Record<string, string> = {
    primary: "border-primary/30 bg-primary/5 text-primary",
    success: "border-green-500/30 bg-green-500/5 text-green-500",
    accent: "border-accent/30 bg-accent/5 text-accent",
    warning: "border-yellow-500/40 bg-yellow-500/5 text-yellow-500",
    muted: "border-border bg-muted/20 text-muted-foreground",
  };
  return (
    <div className={`rounded-xl border p-3 ${tones[tone]}`}>
      <div className="flex items-center justify-between mb-1.5">
        {icon}
      </div>
      <p className="text-2xl font-heading font-black text-foreground leading-none">{value}</p>
      <p className="text-[11px] font-bold text-foreground/80 mt-1">{label}</p>
      <p className="text-[10px] text-muted-foreground mt-0.5">{hint}</p>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-muted-foreground">{label}</p>
      <p className="text-foreground font-bold mt-0.5">{value}</p>
    </div>
  );
}

function MiniStat({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded bg-card/60 border border-border/40 px-1.5 py-1">
      <div className="flex items-center gap-1 text-muted-foreground mb-0.5">
        {icon}
        <span className="text-[9px]">{label}</span>
      </div>
      <p className="text-[10px] font-bold text-foreground truncate">{value}</p>
    </div>
  );
}
