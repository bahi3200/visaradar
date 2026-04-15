import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import AdminLayout from "@/components/AdminLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Mail, Search, Clock, CheckCircle, AlertCircle } from "lucide-react";
import { format } from "date-fns";
import { ar } from "date-fns/locale";

export default function EmailLog() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const { data: emails, isLoading } = useQuery({
    queryKey: ["email-notifications"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("email_notifications")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const filtered = emails?.filter((e) => {
    const matchesSearch =
      !search ||
      e.recipient_email.toLowerCase().includes(search.toLowerCase()) ||
      e.subject.toLowerCase().includes(search.toLowerCase()) ||
      (e.recipient_name || "").toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === "all" || e.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const statusBadge = (status: string) => {
    switch (status) {
      case "sent":
        return <Badge className="bg-emerald-500/15 text-emerald-600 border-emerald-500/30"><CheckCircle className="w-3 h-3 ml-1" />تم الإرسال</Badge>;
      case "pending":
        return <Badge className="bg-amber-500/15 text-amber-600 border-amber-500/30"><Clock className="w-3 h-3 ml-1" />قيد الانتظار</Badge>;
      default:
        return <Badge className="bg-destructive/15 text-destructive border-destructive/30"><AlertCircle className="w-3 h-3 ml-1" />{status}</Badge>;
    }
  };

  const stats = {
    total: emails?.length || 0,
    sent: emails?.filter((e) => e.status === "sent").length || 0,
    pending: emails?.filter((e) => e.status === "pending").length || 0,
  };

  return (
    <AdminLayout title="سجل الإشعارات البريدية" subtitle="متابعة جميع رسائل البريد الإلكتروني المرسلة">
      {/* Stats */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        {[
          { label: "الإجمالي", value: stats.total, icon: Mail, color: "text-primary" },
          { label: "تم الإرسال", value: stats.sent, icon: CheckCircle, color: "text-emerald-500" },
          { label: "قيد الانتظار", value: stats.pending, icon: Clock, color: "text-amber-500" },
        ].map((s) => (
          <Card key={s.label} className="gradient-card border-border/30">
            <CardContent className="p-4 flex items-center gap-3">
              <s.icon className={`w-5 h-5 ${s.color}`} />
              <div>
                <p className="text-lg font-bold text-foreground">{s.value}</p>
                <p className="text-[11px] text-muted-foreground">{s.label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Filters */}
      <div className="flex gap-3 mb-4">
        <div className="flex-1 relative">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="بحث بالبريد أو العنوان..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pr-9"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[140px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">الكل</SelectItem>
            <SelectItem value="pending">قيد الانتظار</SelectItem>
            <SelectItem value="sent">تم الإرسال</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <Card className="gradient-card border-border/30">
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-8 text-center text-muted-foreground">جاري التحميل...</div>
          ) : !filtered?.length ? (
            <div className="p-8 text-center text-muted-foreground">لا توجد إشعارات بريدية</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-right">المستلم</TableHead>
                  <TableHead className="text-right">العنوان</TableHead>
                  <TableHead className="text-right">الحالة</TableHead>
                  <TableHead className="text-right">التاريخ</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((email) => (
                  <TableRow key={email.id}>
                    <TableCell>
                      <div>
                        <p className="text-sm font-medium text-foreground">{email.recipient_name || "—"}</p>
                        <p className="text-xs text-muted-foreground">{email.recipient_email}</p>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm max-w-[200px] truncate">{email.subject}</TableCell>
                    <TableCell>{statusBadge(email.status)}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {format(new Date(email.created_at), "dd MMM yyyy HH:mm", { locale: ar })}
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
