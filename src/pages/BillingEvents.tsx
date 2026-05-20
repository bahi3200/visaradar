import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Filter,
  Info,
  RefreshCw,
  Search,
  XCircle,
  ArrowLeft,
} from "lucide-react";
import Layout from "@/components/Layout";
import SEO from "@/components/SEO";
import BackButton from "@/components/BackButton";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";

type PaymentEvent = {
  id: string;
  event_type: string;
  status: string;
  provider: string | null;
  amount: number | null;
  currency: string | null;
  reference: string | null;
  message: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
};

const STATUS_META: Record<string, { label: string; cls: string; icon: typeof Info }> = {
  info: {
    label: "معلومة",
    cls: "bg-primary/15 text-primary border-primary/30",
    icon: Info,
  },
  warning: {
    label: "تحذير",
    cls: "bg-yellow-500/15 text-yellow-500 border-yellow-500/30",
    icon: AlertTriangle,
  },
  failed: {
    label: "فشل",
    cls: "bg-destructive/15 text-destructive border-destructive/30",
    icon: XCircle,
  },
  success: {
    label: "نجاح",
    cls: "bg-emerald-500/15 text-emerald-500 border-emerald-500/30",
    icon: CheckCircle2,
  },
};

const TIME_RANGES: { value: string; label: string; hours: number | null }[] = [
  { value: "all", label: "كل الفترات", hours: null },
  { value: "1h", label: "آخر ساعة", hours: 1 },
  { value: "24h", label: "آخر 24 ساعة", hours: 24 },
  { value: "7d", label: "آخر 7 أيام", hours: 24 * 7 },
  { value: "30d", label: "آخر 30 يومًا", hours: 24 * 30 },
];

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString("ar-DZ", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function BillingEvents() {
  const { user } = useAuth();
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [eventTypeFilter, setEventTypeFilter] = useState<string>("all");
  const [rangeFilter, setRangeFilter] = useState<string>("all");
  const [search, setSearch] = useState<string>("");

  const {
    data: events = [],
    isLoading,
    isFetching,
    refetch,
  } = useQuery<PaymentEvent[]>({
    queryKey: ["billing-events-all", user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data } = await (supabase as any)
        .from("payment_events")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(500);
      return (data as PaymentEvent[]) ?? [];
    },
    enabled: !!user,
    refetchOnWindowFocus: true,
  });

  const eventTypes = useMemo(() => {
    const set = new Set<string>();
    events.forEach((e) => set.add(e.event_type));
    return Array.from(set).sort();
  }, [events]);

  const filtered = useMemo(() => {
    const range = TIME_RANGES.find((r) => r.value === rangeFilter);
    const cutoff =
      range?.hours != null ? Date.now() - range.hours * 60 * 60 * 1000 : null;
    const q = search.trim().toLowerCase();
    return events.filter((e) => {
      if (statusFilter !== "all" && e.status !== statusFilter) return false;
      if (eventTypeFilter !== "all" && e.event_type !== eventTypeFilter) return false;
      if (cutoff != null && new Date(e.created_at).getTime() < cutoff) return false;
      if (q) {
        const hay = [
          e.event_type,
          e.message ?? "",
          e.provider ?? "",
          e.reference ?? "",
          JSON.stringify(e.metadata ?? {}),
        ]
          .join(" ")
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [events, statusFilter, eventTypeFilter, rangeFilter, search]);

  const counts = useMemo(() => {
    return {
      total: events.length,
      shown: filtered.length,
      failed: events.filter((e) => e.status === "failed").length,
      info: events.filter((e) => e.status === "info").length,
    };
  }, [events, filtered]);

  const resetFilters = () => {
    setStatusFilter("all");
    setEventTypeFilter("all");
    setRangeFilter("all");
    setSearch("");
  };

  return (
    <Layout>
      <SEO
        title="سجل أحداث الفوترة | VisaRadar"
        description="عرض جميع أحداث الفوترة مع فلترة حسب الحالة ونوع الحدث ووقت التنفيذ"
      />
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        <BackButton />

        <div className="mb-6 flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-foreground mb-2">
              سجل أحداث الفوترة
            </h1>
            <p className="text-sm text-muted-foreground">
              جميع الأحداث المتعلقة بمدفوعاتك وعمليات الاشتراك (حتى 500 سجل).
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Link
              to="/billing"
              className="text-xs text-primary hover:underline inline-flex items-center gap-1"
            >
              العودة إلى الفوترة
              <ArrowLeft className="w-3.5 h-3.5" />
            </Link>
            <button
              type="button"
              onClick={() => refetch()}
              disabled={isFetching}
              className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-full bg-muted text-foreground hover:bg-muted/80 disabled:opacity-60"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isFetching ? "animate-spin" : ""}`} />
              تحديث
            </button>
          </div>
        </div>

        {/* Summary */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
          {[
            { label: "إجمالي السجلات", value: counts.total },
            { label: "ظاهر بعد الفلترة", value: counts.shown },
            { label: "فشل", value: counts.failed },
            { label: "معلومات", value: counts.info },
          ].map((s) => (
            <div
              key={s.label}
              className="gradient-card rounded-xl border border-border/30 p-3 text-center"
            >
              <p className="text-xl font-bold text-foreground">{s.value}</p>
              <p className="text-[11px] text-muted-foreground mt-1">{s.label}</p>
            </div>
          ))}
        </div>

        {/* Filters */}
        <div className="gradient-card rounded-xl border border-border/30 p-4 mb-4">
          <div className="flex items-center gap-2 mb-3">
            <Filter className="w-4 h-4 text-primary" />
            <h2 className="text-sm font-bold text-foreground">الفلاتر</h2>
            <button
              type="button"
              onClick={resetFilters}
              className="mr-auto text-[11px] text-primary hover:underline"
            >
              إعادة تعيين
            </button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <div>
              <Label className="text-[11px] mb-1 block">الحالة</Label>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">الكل</SelectItem>
                  {Object.entries(STATUS_META).map(([key, meta]) => (
                    <SelectItem key={key} value={key}>
                      {meta.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-[11px] mb-1 block">نوع الحدث</Label>
              <Select value={eventTypeFilter} onValueChange={setEventTypeFilter}>
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">كل الأنواع</SelectItem>
                  {eventTypes.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-[11px] mb-1 block">وقت التنفيذ</Label>
              <Select value={rangeFilter} onValueChange={setRangeFilter}>
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TIME_RANGES.map((r) => (
                    <SelectItem key={r.value} value={r.value}>
                      {r.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-[11px] mb-1 block">بحث</Label>
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-muted-foreground absolute right-2.5 top-1/2 -translate-y-1/2" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="رسالة، مزوّد، مرجع..."
                  className="h-9 text-xs pr-8"
                />
              </div>
            </div>
          </div>
        </div>

        {/* List */}
        {isLoading ? (
          <div className="gradient-card rounded-xl border border-border/30 p-8 text-center text-sm text-muted-foreground">
            <Clock className="w-5 h-5 mx-auto mb-2 animate-spin text-primary" />
            جاري تحميل السجلات...
          </div>
        ) : filtered.length === 0 ? (
          <div className="gradient-card rounded-xl border border-border/30 p-8 text-center text-sm text-muted-foreground">
            <Info className="w-5 h-5 mx-auto mb-2 text-muted-foreground" />
            لا توجد أحداث مطابقة للفلاتر الحالية.
          </div>
        ) : (
          <ul className="space-y-2">
            {filtered.map((e) => {
              const meta = STATUS_META[e.status] ?? {
                label: e.status,
                cls: "bg-muted/40 text-muted-foreground border-border/40",
                icon: Info,
              };
              const Icon = meta.icon;
              const reason = (e.metadata as any)?.reason as string | undefined;
              const attempt = (e.metadata as any)?.attempt as number | undefined;
              const maxAttempts = (e.metadata as any)?.max_attempts as number | undefined;
              return (
                <li
                  key={e.id}
                  className="gradient-card rounded-xl border border-border/30 p-3 hover:border-primary/30 transition-colors"
                >
                  <div className="flex items-start gap-3">
                    <span
                      className={`mt-0.5 inline-flex items-center justify-center w-7 h-7 rounded-lg border ${meta.cls}`}
                    >
                      <Icon className="w-3.5 h-3.5" />
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <code className="text-[11px] font-mono font-bold text-foreground break-all">
                          {e.event_type}
                        </code>
                        <Badge variant="outline" className={`text-[10px] ${meta.cls}`}>
                          {meta.label}
                        </Badge>
                        {reason && (
                          <Badge variant="outline" className="text-[10px]">
                            {reason}
                          </Badge>
                        )}
                        {attempt != null && (
                          <Badge variant="outline" className="text-[10px]">
                            محاولة {attempt}
                            {maxAttempts ? `/${maxAttempts}` : ""}
                          </Badge>
                        )}
                        {e.provider && (
                          <Badge variant="outline" className="text-[10px]">
                            {e.provider}
                          </Badge>
                        )}
                      </div>
                      {e.message && (
                        <p className="text-xs text-muted-foreground leading-relaxed">
                          {e.message}
                        </p>
                      )}
                      <div className="mt-1.5 flex items-center gap-3 text-[10px] text-muted-foreground flex-wrap">
                        <span>{formatDateTime(e.created_at)}</span>
                        {e.reference && <span>مرجع: {e.reference}</span>}
                        {e.amount != null && (
                          <span>
                            {e.amount} {e.currency ?? ""}
                          </span>
                        )}
                      </div>
                      {e.metadata && Object.keys(e.metadata).length > 0 && (
                        <details className="mt-2">
                          <summary className="text-[11px] text-primary cursor-pointer hover:underline">
                            عرض metadata
                          </summary>
                          <pre className="mt-1 text-[10px] bg-muted/30 border border-border/40 rounded-lg p-2 overflow-x-auto whitespace-pre-wrap break-all">
                            {JSON.stringify(e.metadata, null, 2)}
                          </pre>
                        </details>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </Layout>
  );
}