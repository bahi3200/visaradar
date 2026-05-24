import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Shield, ShieldAlert, RefreshCw, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { ar } from "date-fns/locale";

type BanEvent = {
  id: string;
  country_code: string;
  provider: string;
  reason: string;
  severity: string;
  http_status: number | null;
  retry_after_seconds: number | null;
  snippet: string | null;
  detected_at: string;
};

type Throttle = {
  provider: string;
  consecutive_blocks: number;
  current_backoff_minutes: number;
  cooldown_until: string | null;
  last_reason: string | null;
  last_block_at: string | null;
  last_success_at: string | null;
};

const REASON_COLORS: Record<string, string> = {
  captcha: "bg-red-500/10 text-red-500 border-red-500/30",
  cloudflare: "bg-orange-500/10 text-orange-500 border-orange-500/30",
  rate_limit: "bg-yellow-500/10 text-yellow-500 border-yellow-500/30",
  temp_ban: "bg-purple-500/10 text-purple-500 border-purple-500/30",
  forbidden: "bg-blue-500/10 text-blue-500 border-blue-500/30",
  unknown: "bg-muted text-muted-foreground border-border",
};

export default function AdminSmartBan() {
  const [events, setEvents] = useState<BanEvent[]>([]);
  const [throttles, setThrottles] = useState<Throttle[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const [{ data: ev }, { data: th }] = await Promise.all([
      supabase.from("ban_events").select("*").order("detected_at", { ascending: false }).limit(100),
      supabase.from("provider_throttle").select("*").order("updated_at", { ascending: false }),
    ]);
    setEvents((ev || []) as BanEvent[]);
    setThrottles((th || []) as Throttle[]);
    setLoading(false);
  };

  useEffect(() => {
    load();
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
  }, []);

  const resetThrottle = async (provider: string) => {
    const { error } = await supabase
      .from("provider_throttle")
      .update({ consecutive_blocks: 0, current_backoff_minutes: 0, cooldown_until: null })
      .eq("provider", provider);
    if (error) toast.error("فشل إعادة التعيين: " + error.message);
    else { toast.success("تم إلغاء الحظر يدوياً لـ " + provider); load(); }
  };

  const stats = {
    last24h: events.filter(e => new Date(e.detected_at).getTime() > Date.now() - 86400000).length,
    active: throttles.filter(t => t.cooldown_until && new Date(t.cooldown_until).getTime() > Date.now()).length,
    high: events.filter(e => e.severity === "high").length,
  };

  return (
    <div className="container mx-auto p-6 space-y-6" dir="rtl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Shield className="h-7 w-7 text-primary" />
            Smart Ban & Captcha Detection
          </h1>
          <p className="text-muted-foreground mt-1">رصد آلي للحظر، التحديات، ومحدودية الطلبات + خنق المزودين تلقائياً</p>
        </div>
        <Button onClick={load} variant="outline" size="sm">
          <RefreshCw className={`h-4 w-4 ml-2 ${loading ? "animate-spin" : ""}`} /> تحديث
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">حظر آخر 24س</CardTitle></CardHeader>
          <CardContent><div className="text-3xl font-bold">{stats.last24h}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">مزودون معلّقون الآن</CardTitle></CardHeader>
          <CardContent><div className="text-3xl font-bold text-orange-500">{stats.active}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">حظر شديد</CardTitle></CardHeader>
          <CardContent><div className="text-3xl font-bold text-red-500">{stats.high}</div></CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><ShieldAlert className="h-5 w-5" /> حالة خنق المزودين</CardTitle>
        </CardHeader>
        <CardContent>
          {throttles.length === 0 ? (
            <p className="text-muted-foreground text-sm py-6 text-center">لا يوجد أي مزود محظور حالياً ✅</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>المزود</TableHead>
                  <TableHead>عمليات الحظر المتتالية</TableHead>
                  <TableHead>Backoff الحالي</TableHead>
                  <TableHead>ينتهي خلال</TableHead>
                  <TableHead>آخر سبب</TableHead>
                  <TableHead>إجراءات</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {throttles.map(t => {
                  const active = t.cooldown_until && new Date(t.cooldown_until).getTime() > Date.now();
                  return (
                    <TableRow key={t.provider}>
                      <TableCell className="font-mono">{t.provider}</TableCell>
                      <TableCell>{t.consecutive_blocks}</TableCell>
                      <TableCell>{t.current_backoff_minutes} د</TableCell>
                      <TableCell>
                        {active ? (
                          <Badge variant="destructive">
                            {formatDistanceToNow(new Date(t.cooldown_until!), { locale: ar, addSuffix: true })}
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-green-500">نشط</Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        {t.last_reason && (
                          <Badge className={REASON_COLORS[t.last_reason] || REASON_COLORS.unknown}>{t.last_reason}</Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        {active && (
                          <Button size="sm" variant="outline" onClick={() => resetThrottle(t.provider)}>إلغاء يدوياً</Button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><AlertTriangle className="h-5 w-5" /> آخر 100 حدث حظر</CardTitle>
        </CardHeader>
        <CardContent>
          {events.length === 0 ? (
            <p className="text-muted-foreground text-sm py-6 text-center">لا يوجد سجل حظر</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>الوقت</TableHead>
                  <TableHead>الدولة</TableHead>
                  <TableHead>المزود</TableHead>
                  <TableHead>السبب</TableHead>
                  <TableHead>شدة</TableHead>
                  <TableHead>HTTP</TableHead>
                  <TableHead>Retry-After</TableHead>
                  <TableHead>المقتطف</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {events.map(e => (
                  <TableRow key={e.id}>
                    <TableCell className="text-xs whitespace-nowrap">
                      {formatDistanceToNow(new Date(e.detected_at), { locale: ar, addSuffix: true })}
                    </TableCell>
                    <TableCell className="font-mono">{e.country_code}</TableCell>
                    <TableCell className="font-mono text-xs">{e.provider}</TableCell>
                    <TableCell>
                      <Badge className={REASON_COLORS[e.reason] || REASON_COLORS.unknown}>{e.reason}</Badge>
                    </TableCell>
                    <TableCell><Badge variant="outline">{e.severity}</Badge></TableCell>
                    <TableCell className="font-mono text-xs">{e.http_status ?? "-"}</TableCell>
                    <TableCell className="text-xs">{e.retry_after_seconds ? `${e.retry_after_seconds}s` : "-"}</TableCell>
                    <TableCell className="text-xs max-w-xs truncate text-muted-foreground" title={e.snippet || ""}>
                      {e.snippet || "-"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}