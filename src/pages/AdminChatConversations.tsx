import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  Loader2,
  Search,
  MessageCircle,
  User as UserIcon,
  Calendar,
  Eye,
  Sparkles,
  Bot,
  Download,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import ReactMarkdown from "react-markdown";
import AdminLayout from "@/components/AdminLayout";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

type ConvRow = {
  id: string;
  user_id: string;
  title: string;
  created_at: string;
  updated_at: string;
};

type ProfileLite = { user_id: string; full_name: string | null };

type EnrichedConv = ConvRow & {
  full_name: string;
  email_hint: string;
  message_count: number;
  last_user_msg: string;
};

type Msg = { role: string; content: string; created_at: string };

const formatDate = (iso: string) =>
  new Date(iso).toLocaleString("ar-DZ", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

export default function AdminChatConversations() {
  const [loading, setLoading] = useState(true);
  const [conversations, setConversations] = useState<EnrichedConv[]>([]);
  const [search, setSearch] = useState("");
  const [openConv, setOpenConv] = useState<EnrichedConv | null>(null);
  const [openMsgs, setOpenMsgs] = useState<Msg[]>([]);
  const [loadingMsgs, setLoadingMsgs] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data: convs, error } = await supabase
      .from("chat_conversations")
      .select("id, user_id, title, created_at, updated_at")
      .order("updated_at", { ascending: false })
      .limit(500);

    if (error) {
      console.error(error);
      toast.error("تعذر تحميل المحادثات");
      setLoading(false);
      return;
    }

    if (!convs || convs.length === 0) {
      setConversations([]);
      setLoading(false);
      return;
    }

    const userIds = Array.from(new Set(convs.map((c) => c.user_id)));
    const [{ data: profiles }, ...countResults] = await Promise.all([
      supabase.from("profiles").select("user_id, full_name").in("user_id", userIds),
      ...convs.map((c) =>
        supabase
          .from("chat_messages")
          .select("*", { count: "exact", head: true })
          .eq("conversation_id", c.id)
      ),
    ]);

    // Last user message per conversation (parallel)
    const lastMsgs = await Promise.all(
      convs.map((c) =>
        supabase
          .from("chat_messages")
          .select("content")
          .eq("conversation_id", c.id)
          .eq("role", "user")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle()
      )
    );

    const profileMap = new Map<string, ProfileLite>(
      (profiles || []).map((p) => [p.user_id, p as ProfileLite])
    );

    const enriched: EnrichedConv[] = convs.map((c, idx) => {
      const prof = profileMap.get(c.user_id);
      return {
        ...c,
        full_name: prof?.full_name?.trim() || "مستخدم",
        email_hint: c.user_id.slice(0, 8),
        message_count: (countResults[idx] as { count: number | null }).count ?? 0,
        last_user_msg: (lastMsgs[idx]?.data?.content || "").slice(0, 140),
      };
    });

    setConversations(enriched);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return conversations;
    return conversations.filter(
      (c) =>
        c.title.toLowerCase().includes(q) ||
        c.full_name.toLowerCase().includes(q) ||
        c.last_user_msg.toLowerCase().includes(q) ||
        c.user_id.toLowerCase().includes(q)
    );
  }, [conversations, search]);

  const stats = useMemo(() => {
    const totalMsgs = conversations.reduce((s, c) => s + c.message_count, 0);
    const uniqueUsers = new Set(conversations.map((c) => c.user_id)).size;
    return {
      total: conversations.length,
      totalMsgs,
      uniqueUsers,
    };
  }, [conversations]);

  const openConversation = async (conv: EnrichedConv) => {
    setOpenConv(conv);
    setOpenMsgs([]);
    setLoadingMsgs(true);
    const { data } = await supabase
      .from("chat_messages")
      .select("role, content, created_at")
      .eq("conversation_id", conv.id)
      .order("created_at", { ascending: true });
    setOpenMsgs((data as Msg[]) || []);
    setLoadingMsgs(false);
  };

  const exportConversation = (conv: EnrichedConv, msgs: Msg[]) => {
    const lines = [
      `محادثة: ${conv.title}`,
      `المستخدم: ${conv.full_name} (${conv.user_id})`,
      `بدأت: ${formatDate(conv.created_at)}`,
      `آخر تحديث: ${formatDate(conv.updated_at)}`,
      `عدد الرسائل: ${msgs.length}`,
      "",
      "─────────────────────────────",
      "",
      ...msgs.map(
        (m) =>
          `[${m.role === "user" ? "المستخدم" : "المساعد"}] ${formatDate(m.created_at)}\n${m.content}\n`
      ),
    ];
    const blob = new Blob(["\uFEFF" + lines.join("\n")], {
      type: "text/plain;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `chat-${conv.id.slice(0, 8)}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("تم تصدير المحادثة");
  };

  const confirmDelete = async () => {
    if (!deleteId) return;
    setDeleting(true);
    await supabase.from("chat_messages").delete().eq("conversation_id", deleteId);
    const { error } = await supabase.from("chat_conversations").delete().eq("id", deleteId);
    setDeleting(false);
    if (error) {
      toast.error("فشل الحذف");
      return;
    }
    toast.success("تم حذف المحادثة");
    setConversations((prev) => prev.filter((c) => c.id !== deleteId));
    if (openConv?.id === deleteId) setOpenConv(null);
    setDeleteId(null);
  };

  return (
    <AdminLayout
      title="محادثات المساعد"
      subtitle="تصفح كل محادثات المستخدمين مع المساعد لتحليل الاستخدام وتحسين الردود"
    >
      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 mb-6">
        {[
          { label: "إجمالي المحادثات", value: stats.total, icon: MessageCircle, color: "text-primary" },
          { label: "إجمالي الرسائل", value: stats.totalMsgs, icon: Sparkles, color: "text-accent" },
          { label: "مستخدمين فريدين", value: stats.uniqueUsers, icon: UserIcon, color: "text-foreground" },
        ].map((s) => (
          <div key={s.label} className="rounded-xl border border-border bg-card p-4">
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">{s.label}</p>
              <s.icon className={`w-4 h-4 ${s.color}`} />
            </div>
            <p className="text-2xl font-heading font-black text-foreground mt-1">
              {s.value.toLocaleString("ar")}
            </p>
          </div>
        ))}
      </div>

      {/* Search */}
      <div className="relative mb-4">
        <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="ابحث في العناوين، الرسائل، أو الاسم..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pr-10 text-right"
        />
      </div>

      {/* List */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-accent" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20 bg-card border border-border rounded-2xl">
          <MessageCircle className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">
            {conversations.length === 0 ? "لا توجد محادثات بعد" : "لا توجد نتائج للبحث"}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((c, idx) => (
            <motion.div
              key={c.id}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: Math.min(idx * 0.02, 0.4) }}
              className="bg-card border border-border rounded-xl p-4 hover:border-accent/40 transition-colors"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1.5">
                    <h3 className="font-bold text-foreground text-sm truncate">{c.title}</h3>
                    <Badge variant="secondary" className="text-[10px]">
                      {c.message_count} رسالة
                    </Badge>
                  </div>
                  <div className="flex items-center gap-3 text-[11px] text-muted-foreground flex-wrap mb-1.5">
                    <span className="flex items-center gap-1">
                      <UserIcon className="w-3 h-3" />
                      {c.full_name}
                    </span>
                    <span className="flex items-center gap-1 font-mono opacity-70">
                      {c.email_hint}
                    </span>
                    <span className="flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      {formatDate(c.updated_at)}
                    </span>
                  </div>
                  {c.last_user_msg && (
                    <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed bg-muted/30 rounded-md px-2.5 py-1.5">
                      <span className="font-bold opacity-70">آخر سؤال: </span>
                      {c.last_user_msg}
                    </p>
                  )}
                </div>
                <div className="flex flex-col gap-1.5 shrink-0">
                  <Button size="sm" variant="outline" onClick={() => openConversation(c)}>
                    <Eye className="w-3.5 h-3.5 ml-1" />
                    عرض
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setDeleteId(c.id)}
                    className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      )}

      {/* Transcript dialog */}
      <Dialog open={!!openConv} onOpenChange={(o) => !o && setOpenConv(null)}>
        <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="text-right">{openConv?.title}</DialogTitle>
            <DialogDescription className="text-right text-xs">
              {openConv?.full_name} · {openConv && formatDate(openConv.updated_at)} ·{" "}
              {openMsgs.length} رسالة
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto space-y-3 pr-1">
            {loadingMsgs ? (
              <div className="flex items-center justify-center py-10">
                <Loader2 className="w-6 h-6 animate-spin text-accent" />
              </div>
            ) : (
              openMsgs.map((m, i) => (
                <div
                  key={i}
                  className={`flex ${m.role === "user" ? "justify-start" : "justify-end"}`}
                >
                  <div
                    className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm ${
                      m.role === "user"
                        ? "gradient-primary text-primary-foreground rounded-bl-sm"
                        : "bg-muted text-foreground rounded-br-sm"
                    }`}
                  >
                    <div className="flex items-center gap-1.5 text-[10px] opacity-70 mb-1">
                      {m.role === "user" ? (
                        <UserIcon className="w-3 h-3" />
                      ) : (
                        <Bot className="w-3 h-3" />
                      )}
                      <span>{formatDate(m.created_at)}</span>
                    </div>
                    {m.role === "assistant" ? (
                      <div className="prose prose-sm prose-invert max-w-none [&_*]:!my-1">
                        <ReactMarkdown>{m.content}</ReactMarkdown>
                      </div>
                    ) : (
                      <p className="whitespace-pre-wrap leading-relaxed">{m.content}</p>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="flex items-center justify-between gap-2 border-t border-border pt-3">
            <Button
              variant="outline"
              size="sm"
              onClick={() => openConv && exportConversation(openConv, openMsgs)}
              disabled={loadingMsgs || openMsgs.length === 0}
            >
              <Download className="w-3.5 h-3.5 ml-1" />
              تصدير نصي
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setOpenConv(null)}>
              إغلاق
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <AlertDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>حذف المحادثة؟</AlertDialogTitle>
            <AlertDialogDescription>
              سيتم حذف المحادثة وكل رسائلها نهائياً.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>إلغاء</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                confirmDelete();
              }}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : "حذف"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AdminLayout>
  );
}
