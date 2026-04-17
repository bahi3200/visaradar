import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { MessageCircle, Trash2, Loader2, ArrowLeft, Sparkles, Clock } from "lucide-react";
import { toast } from "sonner";
import Layout from "@/components/Layout";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
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

type Conversation = {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
  message_count: number;
  preview: string;
};

const formatDate = (iso: string) => {
  const d = new Date(iso);
  return d.toLocaleString("ar-DZ", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

export default function ChatHistory() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = async () => {
    if (!user) return;
    setLoading(true);
    const { data: convs, error } = await supabase
      .from("chat_conversations")
      .select("id, title, created_at, updated_at")
      .eq("user_id", user.id)
      .order("updated_at", { ascending: false });

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

    // Fetch counts and previews in parallel
    const enriched = await Promise.all(
      convs.map(async (c) => {
        const [{ count }, { data: lastMsg }] = await Promise.all([
          supabase
            .from("chat_messages")
            .select("*", { count: "exact", head: true })
            .eq("conversation_id", c.id),
          supabase
            .from("chat_messages")
            .select("content")
            .eq("conversation_id", c.id)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle(),
        ]);
        return {
          ...c,
          message_count: count ?? 0,
          preview: (lastMsg?.content || "").slice(0, 120),
        } as Conversation;
      })
    );

    setConversations(enriched);
    setLoading(false);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const openConversation = (id: string) => {
    // Notify chatbot to load this conversation, then navigate home and open it
    window.dispatchEvent(new CustomEvent("visa-chat:open-conversation", { detail: { id } }));
    toast.success("جارٍ فتح المحادثة...");
    navigate("/");
  };

  const confirmDelete = async () => {
    if (!deleteId) return;
    setDeleting(true);
    // Delete messages first, then conversation
    await supabase.from("chat_messages").delete().eq("conversation_id", deleteId);
    const { error } = await supabase.from("chat_conversations").delete().eq("id", deleteId);
    setDeleting(false);
    setDeleteId(null);
    if (error) {
      toast.error("فشل حذف المحادثة");
      return;
    }
    toast.success("تم حذف المحادثة");
    setConversations((prev) => prev.filter((c) => c.id !== deleteId));
  };

  return (
    <Layout>
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate("/profile")} aria-label="رجوع">
              <ArrowLeft className="w-5 h-5 rotate-180" />
            </Button>
            <div>
              <h1 className="text-2xl font-heading font-black text-foreground flex items-center gap-2">
                <Sparkles className="w-6 h-6 text-accent" />
                سجل محادثات المساعد
              </h1>
              <p className="text-sm text-muted-foreground mt-0.5">
                {loading ? "جارٍ التحميل..." : `${conversations.length} محادثة محفوظة`}
              </p>
            </div>
          </div>
        </div>

        {/* Body */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-accent" />
          </div>
        ) : conversations.length === 0 ? (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center py-20 bg-card border border-border rounded-2xl"
          >
            <div className="w-16 h-16 rounded-2xl gradient-accent mx-auto mb-4 flex items-center justify-center">
              <MessageCircle className="w-8 h-8 text-accent-foreground" />
            </div>
            <h3 className="font-heading font-bold text-foreground mb-2">لا توجد محادثات بعد</h3>
            <p className="text-sm text-muted-foreground mb-6">
              ابدأ محادثة مع مساعد التأشيرات لتظهر هنا
            </p>
            <Button onClick={() => navigate("/")} className="gradient-accent text-accent-foreground">
              فتح المساعد
            </Button>
          </motion.div>
        ) : (
          <div className="space-y-3">
            {conversations.map((c, idx) => (
              <motion.div
                key={c.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.03 }}
                className="bg-card border border-border rounded-xl p-4 hover:border-accent/40 transition-colors group"
              >
                <div className="flex items-start justify-between gap-3">
                  <button
                    onClick={() => openConversation(c.id)}
                    className="flex-1 text-right min-w-0"
                  >
                    <h3 className="font-bold text-foreground text-sm mb-1 truncate group-hover:text-accent transition-colors">
                      {c.title}
                    </h3>
                    {c.preview && (
                      <p className="text-xs text-muted-foreground line-clamp-2 mb-2 leading-relaxed">
                        {c.preview}
                      </p>
                    )}
                    <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <MessageCircle className="w-3 h-3" />
                        {c.message_count} رسالة
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {formatDate(c.updated_at)}
                      </span>
                    </div>
                  </button>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => openConversation(c.id)}
                    >
                      فتح
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => setDeleteId(c.id)}
                      aria-label="حذف"
                      className="text-destructive hover:text-destructive hover:bg-destructive/10"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </div>

      <AlertDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>حذف المحادثة؟</AlertDialogTitle>
            <AlertDialogDescription>
              سيتم حذف هذه المحادثة وكل رسائلها نهائياً. لا يمكن التراجع.
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
    </Layout>
  );
}
