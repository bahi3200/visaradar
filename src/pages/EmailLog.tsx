import { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import AdminLayout from "@/components/AdminLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Mail, Search, Clock, CheckCircle, AlertCircle, Send, Plus, Eye } from "lucide-react";
import { format } from "date-fns";
import { ar } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { toast } from "sonner";

const EMAIL_TEMPLATES: Array<{ id: string; label: string; subject: string; body: string }> = [
  {
    id: "welcome",
    label: "ترحيب بالمستخدم",
    subject: "مرحبًا بك في VisaRadar",
    body: "مرحبًا،\n\nنرحب بك في منصة VisaRadar. نحن سعداء بانضمامك إلينا، وفريقنا جاهز لمساعدتك في كل ما تحتاجه.\n\nبالتوفيق،\nفريق VisaRadar",
  },
  {
    id: "subscription_approved",
    label: "تأكيد تفعيل الاشتراك",
    subject: "تم تفعيل اشتراكك بنجاح",
    body: "مرحبًا،\n\nيسرّنا إعلامك بأنه تم تفعيل اشتراكك بنجاح. يمكنك الآن الاستفادة من جميع خدمات المتابعة والإشعارات.\n\nشكرًا لثقتك،\nفريق VisaRadar",
  },
  {
    id: "payment_received",
    label: "إشعار استلام الدفعة",
    subject: "تم استلام دفعتك",
    body: "مرحبًا،\n\nنؤكد استلام دفعتك بنجاح. سيتم تفعيل اشتراكك خلال وقت قصير بعد المراجعة.\n\nشكرًا لك،\nفريق VisaRadar",
  },
  {
    id: "payment_rejected",
    label: "رفض إيصال الدفع",
    subject: "تعذّر التحقق من إيصال الدفع",
    body: "مرحبًا،\n\nنأسف لإبلاغك بأنه تعذّر التحقق من إيصال الدفع المرفق. يرجى إعادة إرسال إيصال واضح يتضمن المبلغ والمرجع والتاريخ.\n\nنحن في الخدمة،\nفريق VisaRadar",
  },
  {
    id: "expiry_reminder",
    label: "تذكير بانتهاء الاشتراك",
    subject: "اشتراكك على وشك الانتهاء",
    body: "مرحبًا،\n\nنود تذكيرك بأن اشتراكك سينتهي قريبًا. يمكنك تجديده الآن لضمان استمرار حصولك على الإشعارات دون انقطاع.\n\nمع تحياتنا،\nفريق VisaRadar",
  },
  {
    id: "support_followup",
    label: "متابعة طلب الدعم",
    subject: "متابعة بشأن طلبك",
    body: "مرحبًا،\n\nنتابع معك بخصوص طلبك الأخير. يرجى الرد على هذه الرسالة بأي معلومات إضافية تساعدنا على خدمتك بشكل أفضل.\n\nشكرًا لتعاونك،\nفريق VisaRadar",
  },
];

export default function EmailLog() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [composeOpen, setComposeOpen] = useState(false);
  const [userPickerOpen, setUserPickerOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<{ id: string; email: string; full_name: string } | null>(null);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewHtml, setPreviewHtml] = useState("");
  const [templateId, setTemplateId] = useState<string>("");
  const qc = useQueryClient();

  const { data: users } = useQuery({
    queryKey: ["admin-users-list"],
    queryFn: async () => {
      const res = await supabase.functions.invoke("list-users");
      if (res.error) throw res.error;
      return (res.data || []) as Array<{ id: string; email: string; full_name?: string }>;
    },
    enabled: composeOpen,
  });

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

  const resetCompose = () => {
    setSelectedUser(null);
    setSubject("");
    setBody("");
    setPreviewHtml("");
    setTemplateId("");
  };

  const applyTemplate = (id: string) => {
    const t = EMAIL_TEMPLATES.find((x) => x.id === id);
    if (!t) return;
    setTemplateId(id);
    setSubject(t.subject);
    setBody(t.body);
    setPreviewHtml("");
  };

  const buildHtml = (text: string) => {
    return `<div style="font-family:Cairo,Arial,sans-serif;direction:rtl;line-height:1.7;color:#111">${text
      .split("\n")
      .map((l) => `<p>${l.replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[c]!))}</p>`)
      .join("")}</div>`;
  };

  const handleSend = async () => {
    if (!selectedUser) {
      toast.error("اختر مستخدمًا");
      return;
    }
    if (!subject.trim() || !body.trim()) {
      toast.error("يرجى تعبئة العنوان والمحتوى");
      return;
    }
    setSending(true);
    try {
      const html = buildHtml(body);
      const { error } = await supabase.from("email_notifications").insert({
        recipient_email: selectedUser.email,
        recipient_name: selectedUser.full_name || "",
        subject: subject.trim(),
        html_body: html,
        status: "pending",
      });
      if (error) throw error;
      toast.success("تمت إضافة الرسالة إلى قائمة الإرسال");
      qc.invalidateQueries({ queryKey: ["email-notifications"] });
      resetCompose();
      setComposeOpen(false);
    } catch (err: any) {
      toast.error(err.message || "فشل الإرسال");
    } finally {
      setSending(false);
    }
  };

  const handlePreview = () => {
    if (!body.trim()) {
      toast.error("اكتب محتوى الرسالة أولاً");
      return;
    }
    setPreviewHtml(buildHtml(body));
    setPreviewOpen(true);
  };

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
      <div className="flex justify-end mb-4">
        <Button onClick={() => setComposeOpen(true)} className="gap-2">
          <Plus className="w-4 h-4" />
          رسالة جديدة
        </Button>
      </div>

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

      <Dialog open={composeOpen} onOpenChange={(o) => { setComposeOpen(o); if (!o) resetCompose(); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>إرسال رسالة بريدية</DialogTitle>
            <DialogDescription>اختر المستخدم واكتب الرسالة. ستُضاف إلى قائمة الإرسال.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">قالب جاهز (اختياري)</label>
              <Select value={templateId} onValueChange={applyTemplate}>
                <SelectTrigger>
                  <SelectValue placeholder="اختر قالبًا لتعبئة الحقول تلقائيًا..." />
                </SelectTrigger>
                <SelectContent>
                  {EMAIL_TEMPLATES.map((t) => (
                    <SelectItem key={t.id} value={t.id}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">المستخدم</label>
              <Popover open={userPickerOpen} onOpenChange={setUserPickerOpen}>
                <PopoverTrigger asChild>
                  <Button variant="outline" role="combobox" className="w-full justify-between font-normal">
                    {selectedUser ? `${selectedUser.full_name || selectedUser.email} — ${selectedUser.email}` : "اختر مستخدمًا..."}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                  <Command>
                    <CommandInput placeholder="بحث بالاسم أو البريد..." />
                    <CommandList>
                      <CommandEmpty>لا نتائج</CommandEmpty>
                      <CommandGroup>
                        {(users || []).map((u) => (
                          <CommandItem
                            key={u.id}
                            value={`${u.full_name || ""} ${u.email}`}
                            onSelect={() => {
                              setSelectedUser({ id: u.id, email: u.email, full_name: u.full_name || "" });
                              setUserPickerOpen(false);
                            }}
                          >
                            <div className="flex flex-col">
                              <span className="text-sm">{u.full_name || "—"}</span>
                              <span className="text-xs text-muted-foreground">{u.email}</span>
                            </div>
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">العنوان</label>
              <Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="عنوان الرسالة" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">المحتوى</label>
              <Textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder="نص الرسالة..." rows={6} />
            </div>
            <div className="flex gap-2 justify-end pt-2">
              <Button variant="outline" onClick={() => setComposeOpen(false)} disabled={sending}>إلغاء</Button>
              <Button variant="secondary" onClick={handlePreview} disabled={sending} className="gap-2">
                <Eye className="w-4 h-4" />
                معاينة
              </Button>
              <Button onClick={handleSend} disabled={sending} className="gap-2">
                <Send className="w-4 h-4" />
                {sending ? "جارٍ الإرسال..." : "إرسال"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>معاينة الرسالة</DialogTitle>
            <DialogDescription>هكذا ستظهر الرسالة للمستلم.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="border rounded-md p-3 bg-muted/40">
              <p className="text-xs text-muted-foreground mb-1">العنوان</p>
              <p className="text-sm font-medium text-foreground">{subject || "(بدون عنوان)"}</p>
            </div>
            <div className="border rounded-md p-0 overflow-hidden bg-white">
              <iframe
                title="معاينة الرسالة"
                srcDoc={`<!DOCTYPE html><html dir="rtl" lang="ar"><head><meta charset="UTF-8"><style>body{margin:0;padding:16px;font-family:Cairo,Arial,sans-serif;}</style></head><body>${previewHtml}</body></html>`}
                className="w-full h-64 bg-white"
                sandbox=""
              />
            </div>
            <div className="flex justify-end">
              <Button variant="outline" onClick={() => setPreviewOpen(false)}>إغلاق</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}
