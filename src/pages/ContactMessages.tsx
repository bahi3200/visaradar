import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { format } from "date-fns";
import { ar } from "date-fns/locale";
import { MessageCircle, Eye, Clock, CheckCircle, XCircle, Search, RefreshCw, Send, Reply, Sparkles, Loader2 } from "lucide-react";
import AdminLayout from "@/components/AdminLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

const statusMap: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline"; icon: typeof Clock }> = {
  new: { label: "جديدة", variant: "default", icon: Clock },
  read: { label: "مقروءة", variant: "secondary", icon: Eye },
  replied: { label: "تم الرد", variant: "outline", icon: CheckCircle },
  closed: { label: "مغلقة", variant: "destructive", icon: XCircle },
};

export default function ContactMessages() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [selectedMessage, setSelectedMessage] = useState<any>(null);
  const [replyText, setReplyText] = useState("");
  const [showReplyForm, setShowReplyForm] = useState(false);
  const [aiTone, setAiTone] = useState<"professional" | "friendly" | "apologetic">("professional");
  const [isGenerating, setIsGenerating] = useState(false);

  const { data: messages = [], isLoading, refetch } = useQuery({
    queryKey: ["contact_messages"],
    queryFn: async () => {
      const { data, error } = await (supabase.from as any)("contact_messages")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as any[];
    },
  });

  const updateStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await (supabase.from as any)("contact_messages")
        .update({ status })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["contact_messages"] });
      toast.success("تم تحديث الحالة");
    },
    onError: () => toast.error("فشل تحديث الحالة"),
  });

  const sendReply = useMutation({
    mutationFn: async ({ message, reply }: { message: any; reply: string }) => {
      const htmlBody = `
        <div dir="rtl" style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
            <h2 style="color: #333; margin: 0 0 10px;">رد على استفسارك - VisaRadar</h2>
            <p style="color: #666; margin: 0;">مرحباً ${message.full_name}،</p>
          </div>
          <div style="padding: 20px;">
            <p style="color: #333; line-height: 1.8; white-space: pre-wrap;">${reply}</p>
          </div>
          <div style="background: #f8f9fa; padding: 15px; border-radius: 8px; margin-top: 20px;">
            <p style="color: #999; font-size: 12px; margin: 0;">رسالتك الأصلية:</p>
            <p style="color: #666; font-size: 13px; margin: 5px 0 0;">${message.message}</p>
          </div>
          <div style="text-align: center; padding: 20px; color: #999; font-size: 12px;">
            فريق VisaRadar
          </div>
        </div>
      `;

      // Save reply to email_notifications
      const { error: emailError } = await (supabase.from as any)("email_notifications")
        .insert({
          recipient_email: message.email,
          recipient_name: message.full_name,
          subject: `رد: ${message.subject}`,
          html_body: htmlBody,
          status: "pending",
        });
      if (emailError) throw emailError;

      // Update message status to replied
      const { error: statusError } = await (supabase.from as any)("contact_messages")
        .update({ status: "replied" })
        .eq("id", message.id);
      if (statusError) throw statusError;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["contact_messages"] });
      toast.success("تم حفظ الرد بنجاح");
      setReplyText("");
      setShowReplyForm(false);
      if (selectedMessage) {
        setSelectedMessage({ ...selectedMessage, status: "replied" });
      }
    },
    onError: () => toast.error("فشل إرسال الرد"),
  });

  const handleSendReply = () => {
    if (!replyText.trim() || !selectedMessage) return;
    sendReply.mutate({ message: selectedMessage, reply: replyText.trim() });
  };

  const handleSuggestReply = async () => {
    if (!selectedMessage) return;
    setIsGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke("suggest-support-reply", {
        body: {
          full_name: selectedMessage.full_name,
          subject: selectedMessage.subject,
          message: selectedMessage.message,
          tone: aiTone,
        },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      const suggestion = (data as any)?.suggestion?.toString().trim();
      if (!suggestion) throw new Error("لم يتم توليد رد");
      setReplyText(suggestion);
      setShowReplyForm(true);
      toast.success("تم اقتراح الرد. عدّله قبل الإرسال إن أحببت.");
    } catch (e: any) {
      toast.error(e?.message || "تعذّر توليد الرد");
    } finally {
      setIsGenerating(false);
    }
  };

  const filtered = messages.filter((m: any) => {
    const matchesSearch =
      !search ||
      m.full_name?.toLowerCase().includes(search.toLowerCase()) ||
      m.email?.toLowerCase().includes(search.toLowerCase()) ||
      m.subject?.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === "all" || m.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const stats = {
    total: messages.length,
    new: messages.filter((m: any) => m.status === "new").length,
    read: messages.filter((m: any) => m.status === "read").length,
    replied: messages.filter((m: any) => m.status === "replied").length,
  };

  return (
    <AdminLayout title="رسائل التواصل" subtitle="عرض وإدارة رسائل المستخدمين">
      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        {[
          { label: "الإجمالي", value: stats.total, icon: MessageCircle, color: "text-primary" },
          { label: "جديدة", value: stats.new, icon: Clock, color: "text-yellow-500" },
          { label: "مقروءة", value: stats.read, icon: Eye, color: "text-blue-500" },
          { label: "تم الرد", value: stats.replied, icon: CheckCircle, color: "text-green-500" },
        ].map((s) => (
          <Card key={s.label} className="border-border/40">
            <CardContent className="p-4 flex items-center gap-3">
              <s.icon className={`w-5 h-5 ${s.color}`} />
              <div>
                <p className="text-2xl font-bold">{s.value}</p>
                <p className="text-xs text-muted-foreground">{s.label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="relative flex-1">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="بحث بالاسم أو البريد أو الموضوع..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pr-9"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-full sm:w-40">
            <SelectValue placeholder="الحالة" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">الكل</SelectItem>
            <SelectItem value="new">جديدة</SelectItem>
            <SelectItem value="read">مقروءة</SelectItem>
            <SelectItem value="replied">تم الرد</SelectItem>
            <SelectItem value="closed">مغلقة</SelectItem>
          </SelectContent>
        </Select>
        <Button variant="outline" size="icon" onClick={() => refetch()}>
          <RefreshCw className="w-4 h-4" />
        </Button>
      </div>

      {/* Table */}
      <Card className="border-border/40">
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-8 text-center text-muted-foreground">جارٍ التحميل...</div>
          ) : filtered.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">لا توجد رسائل</div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right">الاسم</TableHead>
                    <TableHead className="text-right">الموضوع</TableHead>
                    <TableHead className="text-right">الحالة</TableHead>
                    <TableHead className="text-right">التاريخ</TableHead>
                    <TableHead className="text-right">إجراء</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((msg: any) => {
                    const st = statusMap[msg.status] || statusMap.new;
                    return (
                      <TableRow key={msg.id} className={msg.status === "new" ? "bg-primary/5" : ""}>
                        <TableCell>
                          <div>
                            <p className="font-medium text-sm">{msg.full_name}</p>
                            <p className="text-xs text-muted-foreground">{msg.email}</p>
                          </div>
                        </TableCell>
                        <TableCell className="text-sm max-w-[200px] truncate">{msg.subject}</TableCell>
                        <TableCell>
                          <Badge variant={st.variant} className="gap-1 text-xs">
                            <st.icon className="w-3 h-3" />
                            {st.label}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                          {format(new Date(msg.created_at), "d MMM yyyy - HH:mm", { locale: ar })}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => {
                                setSelectedMessage(msg);
                                setShowReplyForm(false);
                                setReplyText("");
                                if (msg.status === "new") {
                                  updateStatus.mutate({ id: msg.id, status: "read" });
                                }
                              }}
                            >
                              <Eye className="w-4 h-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Detail Dialog */}
      <Dialog open={!!selectedMessage} onOpenChange={() => { setSelectedMessage(null); setShowReplyForm(false); setReplyText(""); }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto" dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MessageCircle className="w-5 h-5 text-primary" />
              تفاصيل الرسالة
            </DialogTitle>
            <DialogDescription>
              عرض تفاصيل رسالة التواصل مع إمكانية تغيير الحالة والرد على المرسل
            </DialogDescription>
          </DialogHeader>
          {selectedMessage && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-muted-foreground text-xs">الاسم</p>
                  <p className="font-medium">{selectedMessage.full_name}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">البريد</p>
                  <p className="font-medium" dir="ltr">{selectedMessage.email}</p>
                </div>
                <div className="col-span-2">
                  <p className="text-muted-foreground text-xs">الموضوع</p>
                  <p className="font-medium">{selectedMessage.subject}</p>
                </div>
                <div className="col-span-2">
                  <p className="text-muted-foreground text-xs">التاريخ</p>
                  <p className="font-medium">{format(new Date(selectedMessage.created_at), "d MMMM yyyy - HH:mm", { locale: ar })}</p>
                </div>
              </div>
              <div>
                <p className="text-muted-foreground text-xs mb-1">الرسالة</p>
                <div className="bg-muted/50 rounded-lg p-4 text-sm whitespace-pre-wrap leading-relaxed">
                  {selectedMessage.message}
                </div>
              </div>

              {/* Status buttons */}
              <div className="flex items-center gap-2 pt-2">
                <p className="text-xs text-muted-foreground ml-2">تغيير الحالة:</p>
                {Object.entries(statusMap).map(([key, val]) => (
                  <Button
                    key={key}
                    size="sm"
                    variant={selectedMessage.status === key ? "default" : "outline"}
                    className="text-xs gap-1"
                    onClick={() => {
                      updateStatus.mutate({ id: selectedMessage.id, status: key });
                      setSelectedMessage({ ...selectedMessage, status: key });
                    }}
                  >
                    <val.icon className="w-3 h-3" />
                    {val.label}
                  </Button>
                ))}
              </div>

              {/* Reply Section */}
              <div className="border-t border-border/40 pt-4">
                {!showReplyForm ? (
                  <div className="space-y-2">
                    <Button
                      onClick={() => setShowReplyForm(true)}
                      className="w-full gap-2"
                      variant="default"
                    >
                      <Reply className="w-4 h-4" />
                      الرد على الرسالة
                    </Button>
                    <div className="flex gap-2">
                      <Select value={aiTone} onValueChange={(v: any) => setAiTone(v)}>
                        <SelectTrigger className="w-32 h-9 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="professional">احترافي</SelectItem>
                          <SelectItem value="friendly">ودّي</SelectItem>
                          <SelectItem value="apologetic">اعتذاري</SelectItem>
                        </SelectContent>
                      </Select>
                      <Button
                        onClick={handleSuggestReply}
                        disabled={isGenerating}
                        variant="outline"
                        className="flex-1 gap-2"
                      >
                        {isGenerating ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Sparkles className="w-4 h-4 text-primary" />
                        )}
                        {isGenerating ? "جارٍ التوليد…" : "اقتراح رد بالـ AI"}
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Reply className="w-4 h-4" />
                      <span>الرد إلى: <strong className="text-foreground">{selectedMessage.email}</strong></span>
                    </div>
                    <Button
                      type="button"
                      onClick={handleSuggestReply}
                      disabled={isGenerating}
                      variant="outline"
                      size="sm"
                      className="gap-2"
                    >
                      {isGenerating ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Sparkles className="w-3.5 h-3.5 text-primary" />
                      )}
                      إعادة الاقتراح ({aiTone === "professional" ? "احترافي" : aiTone === "friendly" ? "ودّي" : "اعتذاري"})
                    </Button>
                    <Textarea
                      placeholder="اكتب ردك هنا..."
                      value={replyText}
                      onChange={(e) => setReplyText(e.target.value)}
                      rows={5}
                      className="resize-none"
                    />
                    <div className="flex gap-2">
                      <Button
                        onClick={handleSendReply}
                        disabled={!replyText.trim() || sendReply.isPending}
                        className="flex-1 gap-2"
                      >
                        <Send className="w-4 h-4" />
                        {sendReply.isPending ? "جارٍ الإرسال..." : "إرسال الرد"}
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => { setShowReplyForm(false); setReplyText(""); }}
                      >
                        إلغاء
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}