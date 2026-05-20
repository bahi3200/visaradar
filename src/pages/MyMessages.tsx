import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { format } from "date-fns";
import { ar } from "date-fns/locale";
import { MessageCircle, Send, ArrowRight, Clock, CheckCircle, Eye } from "lucide-react";
import Layout from "@/components/Layout";
import SEO from "@/components/SEO";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/useAuth";
import { Link } from "react-router-dom";

const statusMap: Record<string, { label: string; variant: "default" | "secondary" | "outline" | "destructive"; icon: any }> = {
  new: { label: "جديدة", variant: "default", icon: Clock },
  read: { label: "مقروءة", variant: "secondary", icon: Eye },
  replied: { label: "تم الرد", variant: "outline", icon: CheckCircle },
  closed: { label: "مغلقة", variant: "destructive", icon: CheckCircle },
};

export default function MyMessages() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [replyText, setReplyText] = useState("");

  const { data: messages = [], isLoading } = useQuery({
    queryKey: ["my-contact-messages", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await (supabase.from as any)("contact_messages")
        .select("*")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as any[];
    },
  });

  const selected = messages.find((m: any) => m.id === selectedId) || null;

  const { data: thread = [] } = useQuery({
    queryKey: ["my-thread", selectedId],
    enabled: !!selectedId,
    queryFn: async () => {
      const { data, error } = await (supabase.from as any)("contact_message_replies")
        .select("*")
        .eq("message_id", selectedId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data as any[];
    },
  });

  // Realtime: new replies on the selected thread
  useEffect(() => {
    if (!selectedId) return;
    const channel = supabase
      .channel(`thread-${selectedId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "contact_message_replies", filter: `message_id=eq.${selectedId}` },
        () => {
          queryClient.invalidateQueries({ queryKey: ["my-thread", selectedId] });
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [selectedId, queryClient]);

  const sendReply = useMutation({
    mutationFn: async (body: string) => {
      if (!user || !selected) throw new Error("غير متاح");
      const { error } = await (supabase.from as any)("contact_message_replies").insert({
        message_id: selected.id,
        sender_role: "user",
        sender_id: user.id,
        body,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setReplyText("");
      queryClient.invalidateQueries({ queryKey: ["my-thread", selectedId] });
      toast.success("تم إرسال الرد");
    },
    onError: (e: any) => toast.error(e?.message || "فشل إرسال الرد"),
  });

  return (
    <Layout>
      <SEO title="رسائلي — VisaRadar" description="عرض رسائل التواصل والردود من الإدارة" path="/my-messages" />
      <div className="container max-w-3xl py-10" dir="rtl">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-heading font-bold flex items-center gap-2">
              <MessageCircle className="w-6 h-6 text-primary" /> رسائلي
            </h1>
            <p className="text-sm text-muted-foreground mt-1">رسائلك مع فريق الدعم وردودهم.</p>
          </div>
          <Button asChild variant="outline" size="sm">
            <Link to="/contact" className="gap-1">
              رسالة جديدة <ArrowRight className="w-4 h-4 rotate-180" />
            </Link>
          </Button>
        </div>

        {!selected ? (
          <Card className="border-border/40">
            <CardContent className="p-0">
              {isLoading ? (
                <div className="p-8 text-center text-muted-foreground">جارٍ التحميل...</div>
              ) : messages.length === 0 ? (
                <div className="p-8 text-center text-muted-foreground">
                  لا توجد رسائل بعد.{" "}
                  <Link to="/contact" className="text-primary underline">أرسل أول رسالة</Link>
                </div>
              ) : (
                <ul className="divide-y divide-border/40">
                  {messages.map((m: any) => {
                    const st = statusMap[m.status] || statusMap.new;
                    return (
                      <li key={m.id}>
                        <button
                          onClick={() => setSelectedId(m.id)}
                          className="w-full text-right p-4 hover:bg-muted/40 transition flex items-start justify-between gap-3"
                        >
                          <div className="min-w-0 flex-1">
                            <p className="font-medium text-sm truncate">{m.subject}</p>
                            <p className="text-xs text-muted-foreground truncate mt-0.5">{m.message}</p>
                          </div>
                          <div className="flex flex-col items-end gap-1 shrink-0">
                            <Badge variant={st.variant} className="gap-1 text-[10px]">
                              <st.icon className="w-3 h-3" />
                              {st.label}
                            </Badge>
                            <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                              {format(new Date(m.created_at), "d MMM", { locale: ar })}
                            </span>
                          </div>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardContent>
          </Card>
        ) : (
          <Card className="border-border/40">
            <CardHeader className="flex flex-row items-center justify-between gap-2">
              <div className="min-w-0">
                <CardTitle className="text-base truncate">{selected.subject}</CardTitle>
                <p className="text-xs text-muted-foreground mt-1">
                  {format(new Date(selected.created_at), "d MMMM yyyy - HH:mm", { locale: ar })}
                </p>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setSelectedId(null)}>
                رجوع
              </Button>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="rounded-lg p-3 text-sm whitespace-pre-wrap leading-relaxed bg-muted/50 border border-border/40">
                <div className="text-[10px] font-semibold text-muted-foreground mb-1">رسالتك الأصلية</div>
                {selected.message}
              </div>

              {thread.map((r: any) => (
                <div
                  key={r.id}
                  className={`rounded-lg p-3 text-sm whitespace-pre-wrap leading-relaxed border ${
                    r.sender_role === "admin"
                      ? "bg-primary/10 border-primary/30"
                      : "bg-muted/50 border-border/40"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <span className="text-[10px] font-semibold text-muted-foreground">
                      {r.sender_role === "admin" ? "الإدارة" : "أنت"}
                    </span>
                    <span className="text-[10px] text-muted-foreground">
                      {format(new Date(r.created_at), "d MMM - HH:mm", { locale: ar })}
                    </span>
                  </div>
                  {r.body}
                </div>
              ))}

              {selected.status !== "closed" && (
                <div className="pt-3 border-t border-border/40 space-y-2">
                  <Textarea
                    placeholder="اكتب ردك على الإدارة..."
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    rows={3}
                    className="resize-none"
                  />
                  <div className="flex justify-end">
                    <Button
                      onClick={() => sendReply.mutate(replyText.trim())}
                      disabled={!replyText.trim() || sendReply.isPending}
                      className="gap-2"
                    >
                      <Send className="w-4 h-4" />
                      {sendReply.isPending ? "جارٍ الإرسال..." : "إرسال الرد"}
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </Layout>
  );
}