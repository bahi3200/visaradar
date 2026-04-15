import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import AdminLayout from "@/components/AdminLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { AlertTriangle, Search, XCircle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { format } from "date-fns";
import { ar } from "date-fns/locale";

export default function ErrorLog() {
  const [search, setSearch] = useState("");

  const { data: errors, isLoading, refetch } = useQuery({
    queryKey: ["error-log"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("email_notifications")
        .select("*")
        .eq("status", "error")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const filtered = errors?.filter((e) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      e.subject.toLowerCase().includes(q) ||
      e.recipient_email.toLowerCase().includes(q) ||
      (e.recipient_name || "").toLowerCase().includes(q) ||
      e.html_body.toLowerCase().includes(q)
    );
  });

  return (
    <AdminLayout title="سجل الأخطاء" subtitle="العمليات الفاشلة وأخطاء النظام">
      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 mb-6">
        <Card className="gradient-card border-border/30">
          <CardContent className="p-4 flex items-center gap-3">
            <XCircle className="w-5 h-5 text-destructive" />
            <div>
              <p className="text-lg font-bold text-foreground">{errors?.length || 0}</p>
              <p className="text-[11px] text-muted-foreground">إجمالي الأخطاء</p>
            </div>
          </CardContent>
        </Card>
        <Card className="gradient-card border-border/30">
          <CardContent className="p-4 flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-500" />
            <div>
              <p className="text-lg font-bold text-foreground">
                {errors?.filter((e) => {
                  const d = new Date(e.created_at);
                  const now = new Date();
                  return now.getTime() - d.getTime() < 24 * 60 * 60 * 1000;
                }).length || 0}
              </p>
              <p className="text-[11px] text-muted-foreground">آخر 24 ساعة</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex gap-3 mb-4">
        <div className="flex-1 relative">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="بحث في سجل الأخطاء..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pr-9"
          />
        </div>
        <Button variant="outline" size="icon" onClick={() => refetch()}>
          <RefreshCw className="w-4 h-4" />
        </Button>
      </div>

      {/* Table */}
      <Card className="gradient-card border-border/30">
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-8 text-center text-muted-foreground">جاري التحميل...</div>
          ) : !filtered?.length ? (
            <div className="p-8 text-center text-muted-foreground flex flex-col items-center gap-2">
              <AlertTriangle className="w-8 h-8 text-muted-foreground/50" />
              <p>لا توجد أخطاء مسجلة</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-right">العملية</TableHead>
                  <TableHead className="text-right">التفاصيل</TableHead>
                  <TableHead className="text-right">التاريخ</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((err) => (
                  <TableRow key={err.id}>
                    <TableCell>
                      <div className="flex items-start gap-2">
                        <Badge variant="destructive" className="mt-0.5 shrink-0">خطأ</Badge>
                        <p className="text-sm font-medium text-foreground line-clamp-2">{err.subject}</p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <p className="text-xs text-muted-foreground line-clamp-3 max-w-[200px]" dir="ltr">
                        {err.html_body}
                      </p>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                      {format(new Date(err.created_at), "dd MMM yyyy HH:mm", { locale: ar })}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </AdminLayout>
  );
}
