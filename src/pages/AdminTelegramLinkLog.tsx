import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, XCircle, Search, RefreshCw, Link2, Link2Off, AlertCircle, BellRing, Save } from "lucide-react";
import AdminLayout from "@/components/AdminLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { formatRelativeArabic } from "@/lib/relativeTime";
import { useSiteSettings } from "@/hooks/useSiteSettings";

interface LogEntry {
  id: string;
  user_id: string;
  chat_id: string | null;
  username: string | null;
  action: string;
  status: string;
  error_message: string | null;
  source: string | null;
  created_at: string;
  full_name?: string | null;
  email?: string | null;
}

interface FailureAlertRow {
  id: string;
  user_id: string;
  failure_count: number;
  threshold: number;
  window_minutes: number;
  notified_admin_count: number;
  last_error: string | null;
  alerted_at: string;
  full_name?: string | null;
}

const ACTION_LABELS: Record<string, { label: string; icon: any; tone: string }> = {
  linked: { label: "ربط ناجح", icon: Link2, tone: "bg-green-500/10 text-green-600 border-green-500/30" },
  relinked: { label: "إعادة ربط", icon: RefreshCw, tone: "bg-blue-500/10 text-blue-600 border-blue-500/30" },
  unlinked: { label: "فك ربط", icon: Link2Off, tone: "bg-orange-500/10 text-orange-600 border-orange-500/30" },
  link_failed: { label: "فشل ربط", icon: XCircle, tone: "bg-destructive/10 text-destructive border-destructive/30" },
  verify_failed: { label: "فشل تحقق", icon: AlertCircle, tone: "bg-destructive/10 text-destructive border-destructive/30" },
};

export default function AdminTelegramLinkLog() {
  const [rows, setRows] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "success" | "failed">("all");
  const [alerts, setAlerts] = useState<FailureAlertRow[]>([]);

  const { settings, updateSetting } = useSiteSettings();
  const [enabled, setEnabled] = useState(true);
  const [threshold, setThreshold] = useState("3");
  const [windowMin, setWindowMin] = useState("30");
  const [cooldown, setCooldown] = useState("60");
  const [savingSettings, setSavingSettings] = useState(false);

  useEffect(() => {
    setEnabled((settings.telegram_failure_alert_enabled ?? "true") === "true");
    setThreshold(settings.telegram_failure_alert_threshold ?? "3");
    setWindowMin(settings.telegram_failure_alert_window_minutes ?? "30");
    setCooldown(settings.telegram_failure_alert_cooldown_minutes ?? "60");
  }, [settings]);

  const saveSettings = async () => {
    const t = parseInt(threshold, 10);
    const w = parseInt(windowMin, 10);
    const c = parseInt(cooldown, 10);
    if (!Number.isFinite(t) || t < 2 || t > 50) return toast.error("الحدّ يجب أن يكون بين 2 و 50");
    if (!Number.isFinite(w) || w < 1 || w > 1440) return toast.error("النافذة بالدقائق بين 1 و 1440");
    if (!Number.isFinite(c) || c < 1 || c > 1440) return toast.error("فترة الكتم بالدقائق بين 1 و 1440");
    setSavingSettings(true);
    try {
      await Promise.all([
        updateSetting.mutateAsync({ key: "telegram_failure_alert_enabled", value: enabled ? "true" : "false" }),
        updateSetting.mutateAsync({ key: "telegram_failure_alert_threshold", value: String(t) }),
        updateSetting.mutateAsync({ key: "telegram_failure_alert_window_minutes", value: String(w) }),
        updateSetting.mutateAsync({ key: "telegram_failure_alert_cooldown_minutes", value: String(c) }),
      ]);
      toast.success("تم حفظ إعدادات التنبيه");
    } catch (e: any) {
      toast.error(e?.message || "تعذّر الحفظ");
    } finally {
      setSavingSettings(false);
    }
  };

  const load = async () => {
    setLoading(true);
    try {
      const [{ data, error }, { data: alertsData }] = await Promise.all([
        supabase
          .from("telegram_link_log")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(500),
        supabase
          .from("telegram_failure_alerts" as any)
          .select("*")
          .order("alerted_at", { ascending: false })
          .limit(50),
      ]);
      if (error) throw error;
      const logs = (data || []) as LogEntry[];
      const alertRows = ((alertsData || []) as any[]) as FailureAlertRow[];

      // Hydrate user info
      const userIds = Array.from(new Set([
        ...logs.map((l) => l.user_id),
        ...alertRows.map((a) => a.user_id),
      ])).filter(Boolean);
      if (userIds.length > 0) {
        const { data: profiles } = await supabase
          .from("profiles")
          .select("user_id, full_name")
          .in("user_id", userIds);
        const map = new Map((profiles || []).map((p: any) => [p.user_id, p.full_name]));
        logs.forEach((l) => { l.full_name = map.get(l.user_id) || null; });
        alertRows.forEach((a) => { a.full_name = map.get(a.user_id) || null; });
      }
      setRows(logs);
      setAlerts(alertRows);
    } catch (e: any) {
      toast.error(e.message || "فشل تحميل السجل");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (statusFilter !== "all" && r.status !== statusFilter) return false;
      if (!q) return true;
      return (
        (r.full_name || "").toLowerCase().includes(q) ||
        (r.username || "").toLowerCase().includes(q) ||
        (r.chat_id || "").includes(q) ||
        (r.user_id || "").includes(q) ||
        (r.error_message || "").toLowerCase().includes(q) ||
        (r.action || "").toLowerCase().includes(q)
      );
    });
  }, [rows, search, statusFilter]);

  const stats = useMemo(() => {
    const success = rows.filter((r) => r.status === "success").length;
    const failed = rows.filter((r) => r.status === "failed").length;
    return { success, failed, total: rows.length };
  }, [rows]);

  return (
    <AdminLayout title="سجل ربط Telegram" subtitle="جميع عمليات الربط الناجحة والفاشلة مع سبب الفشل">
      <div className="space-y-4">
        {/* Failure alert settings */}
        <Card>
          <CardContent className="pt-5 space-y-4">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-2">
                <BellRing className="w-5 h-5 text-primary" />
                <div>
                  <h3 className="font-semibold text-sm">تنبيه تكرار فشل الربط</h3>
                  <p className="text-xs text-muted-foreground">
                    أرسل للأدمنز إشعار Telegram عندما تفشل محاولات الربط لنفس المستخدم بشكل متكرر.
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Label htmlFor="alert-enabled" className="text-xs">مفعّل</Label>
                <Switch id="alert-enabled" checked={enabled} onCheckedChange={setEnabled} />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <Label className="text-xs">الحدّ (محاولات فاشلة)</Label>
                <Input type="number" min={2} max={50} value={threshold} onChange={(e) => setThreshold(e.target.value)} />
              </div>
              <div>
                <Label className="text-xs">نافذة الزمن (دقيقة)</Label>
                <Input type="number" min={1} max={1440} value={windowMin} onChange={(e) => setWindowMin(e.target.value)} />
              </div>
              <div>
                <Label className="text-xs">فترة كتم التنبيه (دقيقة)</Label>
                <Input type="number" min={1} max={1440} value={cooldown} onChange={(e) => setCooldown(e.target.value)} />
              </div>
            </div>
            <div className="flex justify-end">
              <Button onClick={saveSettings} disabled={savingSettings} size="sm">
                <Save className="w-4 h-4 ml-2" />
                {savingSettings ? "جارٍ الحفظ..." : "حفظ الإعدادات"}
              </Button>
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-3 gap-3">
          <Card><CardContent className="pt-4">
            <p className="text-xs text-muted-foreground">إجمالي</p>
            <p className="text-2xl font-bold">{stats.total}</p>
          </CardContent></Card>
          <Card><CardContent className="pt-4">
            <p className="text-xs text-muted-foreground">ناجحة</p>
            <p className="text-2xl font-bold text-green-600">{stats.success}</p>
          </CardContent></Card>
          <Card><CardContent className="pt-4">
            <p className="text-xs text-muted-foreground">فاشلة</p>
            <p className="text-2xl font-bold text-destructive">{stats.failed}</p>
          </CardContent></Card>
        </div>

        <Card>
          <CardContent className="pt-4 space-y-4">
            <div className="flex flex-col sm:flex-row gap-2">
              <div className="relative flex-1">
                <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="ابحث بالاسم / chat_id / سبب الفشل..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pr-9"
                />
              </div>
              <Select value={statusFilter} onValueChange={(v: any) => setStatusFilter(v)}>
                <SelectTrigger className="w-full sm:w-[160px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">كل الحالات</SelectItem>
                  <SelectItem value="success">ناجحة فقط</SelectItem>
                  <SelectItem value="failed">فاشلة فقط</SelectItem>
                </SelectContent>
              </Select>
              <Button variant="outline" onClick={load} disabled={loading}>
                <RefreshCw className={`w-4 h-4 ml-2 ${loading ? "animate-spin" : ""}`} />
                تحديث
              </Button>
            </div>

            <div className="rounded-md border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>المستخدم</TableHead>
                    <TableHead>العملية</TableHead>
                    <TableHead>chat_id</TableHead>
                    <TableHead>المصدر</TableHead>
                    <TableHead>سبب الفشل</TableHead>
                    <TableHead>الوقت</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">جارٍ التحميل...</TableCell></TableRow>
                  ) : filtered.length === 0 ? (
                    <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">لا توجد سجلات</TableCell></TableRow>
                  ) : (
                    filtered.map((r) => {
                      const meta = ACTION_LABELS[r.action] || { label: r.action, icon: AlertCircle, tone: "bg-muted" };
                      const Icon = meta.icon;
                      return (
                        <TableRow key={r.id}>
                          <TableCell>
                            <div className="font-medium text-sm">{r.full_name || "—"}</div>
                            {r.username && <div className="text-xs text-muted-foreground" dir="ltr">@{r.username}</div>}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className={`gap-1 ${meta.tone}`}>
                              <Icon className="w-3 h-3" />
                              {meta.label}
                            </Badge>
                          </TableCell>
                          <TableCell className="font-mono text-xs" dir="ltr">{r.chat_id || "—"}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">{r.source || "—"}</TableCell>
                          <TableCell className="max-w-[280px]">
                            {r.status === "failed" ? (
                              <div className="flex items-start gap-1.5 text-xs text-destructive">
                                <XCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                                <span className="break-words">{r.error_message || "—"}</span>
                              </div>
                            ) : (
                              <div className="flex items-center gap-1.5 text-xs text-green-600">
                                <CheckCircle2 className="w-3.5 h-3.5" /> ناجحة
                              </div>
                            )}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground whitespace-nowrap" title={new Date(r.created_at).toLocaleString("ar-DZ")}>
                            {formatRelativeArabic(r.created_at)}
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        {/* Triggered alerts log */}
        <Card>
          <CardContent className="pt-5 space-y-3">
            <div className="flex items-center gap-2">
              <BellRing className="w-4 h-4 text-orange-500" />
              <h3 className="font-semibold text-sm">آخر تنبيهات الفشل المُرسلة ({alerts.length})</h3>
            </div>
            <div className="rounded-md border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>المستخدم</TableHead>
                    <TableHead>عدد الفشل</TableHead>
                    <TableHead>الحد / النافذة</TableHead>
                    <TableHead>تم إخطار</TableHead>
                    <TableHead>آخر خطأ</TableHead>
                    <TableHead>الوقت</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {alerts.length === 0 ? (
                    <TableRow><TableCell colSpan={6} className="text-center py-6 text-muted-foreground text-sm">لا توجد تنبيهات بعد</TableCell></TableRow>
                  ) : alerts.map((a) => (
                    <TableRow key={a.id}>
                      <TableCell className="text-sm font-medium">{a.full_name || "—"}</TableCell>
                      <TableCell className="text-sm font-bold text-destructive">{a.failure_count}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{a.threshold} / {a.window_minutes} د</TableCell>
                      <TableCell className="text-xs">{a.notified_admin_count} أدمن</TableCell>
                      <TableCell className="text-xs text-destructive max-w-[260px] truncate" title={a.last_error || ""}>{a.last_error || "—"}</TableCell>
                      <TableCell className="text-xs text-muted-foreground whitespace-nowrap" title={new Date(a.alerted_at).toLocaleString("ar-DZ")}>
                        {formatRelativeArabic(a.alerted_at)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
}