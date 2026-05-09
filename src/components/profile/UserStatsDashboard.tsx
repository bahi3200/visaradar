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

  useEffect(() => {
    if (!user) return;
    (async () => {
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

      const userCountries: string[] = sub?.countries || [];
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
      checks?.forEach((c) => {
        if (!latestMap.has(c.country_code)) {
          latestMap.set(c.country_code, c);
        }
        // Track only meaningful status changes for history
        if (c.previous_status && c.previous_status !== c.status) {
          historyList.push(c);
        }
      });
      setLatestStatuses(Array.from(latestMap.values()));
      setHistory(historyList.slice(0, 10));

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

      // 4) Last open events per subscribed country (last 90 days) using new tracking table
      const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
      const { data: opens } = await supabase
        .from("visa_open_events" as any)
        .select("country_code, opened_at")
        .in("country_code", userCountries)
        .gte("opened_at", ninetyDaysAgo)
        .order("opened_at", { ascending: false })
        .limit(500);

      const lastMap: Record<string, string> = {};
      const countMap: Record<string, number> = {};
      (opens as any as { country_code: string; opened_at: string }[] | null)?.forEach((o) => {
        countMap[o.country_code] = (countMap[o.country_code] || 0) + 1;
        if (!lastMap[o.country_code]) lastMap[o.country_code] = o.opened_at;
      });
      setLastOpenByCountry(lastMap);
      setOpenCountByCountry(countMap);

      setLoading(false);
    })();
  }, [user]);

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

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6"
    >
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
            return (
              <div
                key={code}
                className="rounded-lg bg-muted/30 px-3 py-2.5 space-y-1.5"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {isOpen ? (
                      <CheckCircle2 className="w-4 h-4 text-green-500" />
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
