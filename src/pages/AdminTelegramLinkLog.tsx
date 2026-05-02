import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, XCircle, Search, RefreshCw, Link2, Link2Off, AlertCircle } from "lucide-react";
import AdminLayout from "@/components/AdminLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { formatRelativeArabic } from "@/lib/relativeTime";

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

  const load = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("telegram_link_log")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      const logs = (data || []) as LogEntry[];

      // Hydrate user info
      const userIds = Array.from(new Set(logs.map((l) => l.user_id))).filter(Boolean);
      if (userIds.length > 0) {
        const { data: profiles } = await supabase
          .from("profiles")
          .select("user_id, full_name")
          .in("user_id", userIds);
        const map = new Map((profiles || []).map((p: any) => [p.user_id, p.full_name]));
        logs.forEach((l) => { l.full_name = map.get(l.user_id) || null; });
      }
      setRows(logs);
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
      </div>
    </AdminLayout>
  );
}