import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { MessageCircle, X, Send, Loader2, Sparkles, RotateCcw, Copy, Check, Share2, Lightbulb, Plus } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

type Msg = { role: "user" | "assistant"; content: string };

const STORAGE_KEY = "visa-chat-history";
const SUGGESTED_QUESTIONS = [
  "ما هي الوثائق المطلوبة لتأشيرة شنغن؟",
  "كيف أحجز موعداً في VFS؟",
  "ما هي مدة معالجة تأشيرة فرنسا؟",
  "نصائح لتجنب رفض التأشيرة",
];

export default function VisaChatBot() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Load history: DB for logged-in users, localStorage for guests
  useEffect(() => {
    const load = async () => {
      if (user) {
        // Get most recent conversation for this user
        const { data: convs } = await supabase
          .from("chat_conversations")
          .select("id")
          .eq("user_id", user.id)
          .order("updated_at", { ascending: false })
          .limit(1);

        if (convs && convs.length > 0) {
          const convId = convs[0].id;
          setConversationId(convId);
          const { data: msgs } = await supabase
            .from("chat_messages")
            .select("role, content")
            .eq("conversation_id", convId)
            .order("created_at", { ascending: true });
          if (msgs) setMessages(msgs as Msg[]);
        } else {
          setConversationId(null);
          setMessages([]);
        }
      } else {
        // Guest: localStorage
        try {
          const stored = localStorage.getItem(STORAGE_KEY);
          if (stored) setMessages(JSON.parse(stored));
        } catch {
          // ignore
        }
      }
    };
    load();
  }, [user]);

  // Persist guest history to localStorage
  useEffect(() => {
    if (!user && messages.length > 0) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(messages.slice(-30)));
    }
  }, [messages, user]);

  // Auto-scroll to bottom
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, isLoading]);

  // Focus input when opening
  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 200);
  }, [open]);

  // Listen for external "open conversation" events (from chat history page)
  useEffect(() => {
    const handler = async (e: Event) => {
      const detail = (e as CustomEvent<{ id: string }>).detail;
      if (!detail?.id || !user) return;
      const { data: msgs } = await supabase
        .from("chat_messages")
        .select("role, content")
        .eq("conversation_id", detail.id)
        .order("created_at", { ascending: true });
      setConversationId(detail.id);
      setMessages((msgs as Msg[]) || []);
      setSuggestions([]);
      setOpen(true);
    };
    window.addEventListener("visa-chat:open-conversation", handler);
    return () => window.removeEventListener("visa-chat:open-conversation", handler);
  }, [user]);

  const ensureConversation = async (firstMsg: string): Promise<string | null> => {
    if (!user) return null;
    if (conversationId) return conversationId;
    const title = firstMsg.slice(0, 60);
    const { data, error } = await supabase
      .from("chat_conversations")
      .insert({ user_id: user.id, title })
      .select("id")
      .single();
    if (error || !data) {
      console.error("Failed to create conversation:", error);
      return null;
    }
    setConversationId(data.id);
    return data.id;
  };

  const saveMessage = async (convId: string, role: "user" | "assistant", content: string) => {
    if (!user) return;
    await supabase.from("chat_messages").insert({
      conversation_id: convId,
      user_id: user.id,
      role,
      content,
    });
  };

  const fetchSuggestions = async (history: Msg[]) => {
    setLoadingSuggestions(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;
      if (!accessToken) {
        setLoadingSuggestions(false);
        return;
      }
      const SUG_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/visa-chat-suggestions`;
      const resp = await fetch(SUG_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ messages: history }),
      });
      if (resp.ok) {
        const { suggestions: sug } = await resp.json();
        if (Array.isArray(sug)) setSuggestions(sug);
      }
    } catch (e) {
      console.error("Suggestions error:", e);
    } finally {
      setLoadingSuggestions(false);
    }
  };

  const sendMessage = async (text: string) => {
    if (!text.trim() || isLoading) return;
    if (!user) {
      toast.error("يرجى تسجيل الدخول لاستخدام مساعد التأشيرات");
      return;
    }
    const userMsg: Msg = { role: "user", content: text.trim() };
    const newHistory = [...messages, userMsg];
    setMessages(newHistory);
    setInput("");
    setIsLoading(true);
    setSuggestions([]); // Clear previous suggestions

    // Save user message to DB
    const convId = await ensureConversation(userMsg.content);
    if (convId) await saveMessage(convId, "user", userMsg.content);

    let assistantContent = "";
    const upsertAssistant = (chunk: string) => {
      assistantContent += chunk;
      setMessages((prev) => {
        const last = prev[prev.length - 1];
        if (last?.role === "assistant") {
          return prev.map((m, i) =>
            i === prev.length - 1 ? { ...m, content: assistantContent } : m
          );
        }
        return [...prev, { role: "assistant", content: assistantContent }];
      });
    };

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;
      if (!accessToken) {
        toast.error("انتهت الجلسة، يرجى تسجيل الدخول من جديد");
        setMessages((prev) => prev.slice(0, -1));
        setIsLoading(false);
        return;
      }
      const CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/visa-chat`;
      const resp = await fetch(CHAT_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ messages: newHistory }),
      });

      if (resp.status === 429) {
        toast.error("الحد الأقصى للطلبات تم تجاوزه. حاول بعد دقيقة.");
        setMessages((prev) => prev.slice(0, -1));
        setIsLoading(false);
        return;
      }
      if (resp.status === 402) {
        toast.error("نفد الرصيد. تواصل مع الإدارة.");
        setMessages((prev) => prev.slice(0, -1));
        setIsLoading(false);
        return;
      }
      if (!resp.ok || !resp.body) {
        throw new Error("Stream failed");
      }

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let textBuffer = "";
      let streamDone = false;

      while (!streamDone) {
        const { done, value } = await reader.read();
        if (done) break;
        textBuffer += decoder.decode(value, { stream: true });

        let newlineIndex: number;
        while ((newlineIndex = textBuffer.indexOf("\n")) !== -1) {
          let line = textBuffer.slice(0, newlineIndex);
          textBuffer = textBuffer.slice(newlineIndex + 1);
          if (line.endsWith("\r")) line = line.slice(0, -1);
          if (line.startsWith(":") || line.trim() === "") continue;
          if (!line.startsWith("data: ")) continue;
          const jsonStr = line.slice(6).trim();
          if (jsonStr === "[DONE]") {
            streamDone = true;
            break;
          }
          try {
            const parsed = JSON.parse(jsonStr);
            const content = parsed.choices?.[0]?.delta?.content as string | undefined;
            if (content) upsertAssistant(content);
          } catch {
            textBuffer = line + "\n" + textBuffer;
            break;
          }
        }
      }

      if (textBuffer.trim()) {
        for (let raw of textBuffer.split("\n")) {
          if (!raw) continue;
          if (raw.endsWith("\r")) raw = raw.slice(0, -1);
          if (raw.startsWith(":") || raw.trim() === "") continue;
          if (!raw.startsWith("data: ")) continue;
          const jsonStr = raw.slice(6).trim();
          if (jsonStr === "[DONE]") continue;
          try {
            const parsed = JSON.parse(jsonStr);
            const content = parsed.choices?.[0]?.delta?.content as string | undefined;
            if (content) upsertAssistant(content);
          } catch {
            // ignore
          }
        }
      }

      // Save assistant reply to DB once streaming is complete
      if (convId && assistantContent) {
        await saveMessage(convId, "assistant", assistantContent);
      }

      // Fetch smart follow-up suggestions based on full context
      if (assistantContent) {
        const finalHistory: Msg[] = [...newHistory, { role: "assistant", content: assistantContent }];
        fetchSuggestions(finalHistory);
      }
    } catch (err) {
      console.error("Chat error:", err);
      toast.error("حدث خطأ، حاول مجدداً");
      setMessages((prev) => prev.slice(0, -1));
    } finally {
      setIsLoading(false);
    }
  };

  const clearChat = async () => {
    setMessages([]);
    setSuggestions([]);
    if (user && conversationId) {
      await supabase.from("chat_conversations").delete().eq("id", conversationId);
      setConversationId(null);
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
    toast.success("تم مسح المحادثة");
  };

  const startNewChat = () => {
    if (isLoading) return;
    // Reset local state only — old conversation remains in DB
    setMessages([]);
    setSuggestions([]);
    setConversationId(null);
    setInput("");
    setTimeout(() => inputRef.current?.focus(), 100);
    toast.success("بدأت محادثة جديدة");
  };

  // Strip markdown formatting for cleaner sharing
  const stripMarkdown = (text: string): string =>
    text
      .replace(/\*\*(.*?)\*\*/g, "$1")
      .replace(/\*(.*?)\*/g, "$1")
      .replace(/`(.*?)`/g, "$1")
      .replace(/^#+\s+/gm, "")
      .replace(/^[-*]\s+/gm, "• ")
      .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
      .trim();

  const copyToClipboard = async (text: string, idx: number) => {
    try {
      await navigator.clipboard.writeText(stripMarkdown(text));
      setCopiedIdx(idx);
      toast.success("تم نسخ الإجابة");
      setTimeout(() => setCopiedIdx(null), 2000);
    } catch {
      toast.error("فشل النسخ");
    }
  };

  const shareToWhatsApp = (text: string) => {
    const cleanText = stripMarkdown(text);
    const footer = "\n\n— مساعد التأشيرات";
    const message = encodeURIComponent(cleanText + footer);
    window.open(`https://wa.me/?text=${message}`, "_blank", "noopener,noreferrer");
  };

  return (
    <>
      {/* Floating button */}
      <AnimatePresence>
        {!open && (
          <motion.button
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => setOpen(true)}
            aria-label="افتح مساعد التأشيرات"
            className="fixed bottom-6 left-6 z-50 w-14 h-14 rounded-full gradient-accent shadow-2xl flex items-center justify-center group"
          >
            <MessageCircle className="w-6 h-6 text-accent-foreground" />
            <span className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-green-500 ring-2 ring-background animate-pulse" />
            <span className="absolute right-full mr-3 whitespace-nowrap bg-card text-foreground text-xs font-bold px-3 py-1.5 rounded-full shadow-lg opacity-0 group-hover:opacity-100 transition-opacity border border-border">
              مساعد التأشيرات
            </span>
          </motion.button>
        )}
      </AnimatePresence>

      {/* Chat panel */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            transition={{ type: "spring", stiffness: 300, damping: 25 }}
            className="fixed bottom-6 left-6 right-6 sm:right-auto sm:w-[400px] z-50 h-[80vh] max-h-[600px] bg-card border border-border rounded-2xl shadow-2xl flex flex-col overflow-hidden"
          >
            {/* Header */}
            <div className="relative p-4 gradient-accent">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-accent-foreground/15 flex items-center justify-center backdrop-blur">
                    <Sparkles className="w-5 h-5 text-accent-foreground" />
                  </div>
                  <div>
                    <h3 className="font-heading font-black text-accent-foreground text-sm">
                      مساعد التأشيرات
                    </h3>
                    <p className="text-[11px] text-accent-foreground/80 flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
                      {user ? "محفوظ في حسابك" : "متصل الآن"}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  {messages.length > 0 && (
                    <>
                      <button
                        onClick={startNewChat}
                        disabled={isLoading}
                        aria-label="محادثة جديدة"
                        title="بدء محادثة جديدة"
                        className="w-8 h-8 rounded-full hover:bg-accent-foreground/15 flex items-center justify-center transition-colors disabled:opacity-50"
                      >
                        <Plus className="w-4 h-4 text-accent-foreground" />
                      </button>
                      <button
                        onClick={clearChat}
                        aria-label="مسح المحادثة"
                        title="حذف المحادثة الحالية"
                        className="w-8 h-8 rounded-full hover:bg-accent-foreground/15 flex items-center justify-center transition-colors"
                      >
                        <RotateCcw className="w-4 h-4 text-accent-foreground" />
                      </button>
                    </>
                  )}
                  <button
                    onClick={() => setOpen(false)}
                    aria-label="إغلاق"
                    className="w-8 h-8 rounded-full hover:bg-accent-foreground/15 flex items-center justify-center transition-colors"
                  >
                    <X className="w-4 h-4 text-accent-foreground" />
                  </button>
                </div>
              </div>
            </div>

            {/* Messages */}
            <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3">
              {messages.length === 0 ? (
                <div className="text-center py-6">
                  <div className="w-14 h-14 rounded-2xl gradient-accent mx-auto mb-3 flex items-center justify-center shadow-lg">
                    <Sparkles className="w-7 h-7 text-accent-foreground" />
                  </div>
                  <h4 className="font-heading font-bold text-foreground text-sm mb-1">
                    مرحباً! 👋
                  </h4>
                  <p className="text-xs text-muted-foreground mb-4 leading-relaxed">
                    أنا مساعدك الذكي للإجابة على كل أسئلتك حول التأشيرات الأوروبية
                  </p>
                  <div className="space-y-2">
                    <p className="text-[11px] text-muted-foreground font-bold">أسئلة مقترحة:</p>
                    {SUGGESTED_QUESTIONS.map((q) => (
                      <button
                        key={q}
                        onClick={() => sendMessage(q)}
                        className="block w-full text-right text-xs px-3 py-2 rounded-lg bg-muted/50 hover:bg-muted transition-colors text-foreground border border-border/50"
                      >
                        {q}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                messages.map((msg, i) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={`flex ${
                      msg.role === "user" ? "justify-start" : "justify-end"
                    }`}
                  >
                    <div
                      className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm ${
                        msg.role === "user"
                          ? "gradient-primary text-primary-foreground rounded-bl-sm"
                          : "bg-muted text-foreground rounded-br-sm"
                      }`}
                    >
                      {msg.role === "assistant" ? (
                        <>
                          <div className="prose prose-sm prose-invert max-w-none [&_*]:!my-1 [&_p]:!my-1 [&_ul]:!my-1.5 [&_ol]:!my-1.5 [&_h1]:!text-base [&_h2]:!text-sm [&_h3]:!text-sm [&_strong]:text-accent">
                            <ReactMarkdown>{msg.content}</ReactMarkdown>
                          </div>
                          {msg.content && !(isLoading && i === messages.length - 1) && (
                            <div className="flex items-center gap-1 mt-2 pt-2 border-t border-border/40">
                              <button
                                onClick={() => copyToClipboard(msg.content, i)}
                                aria-label="نسخ الإجابة"
                                className="flex items-center gap-1 text-[10px] font-bold text-muted-foreground hover:text-accent transition-colors px-2 py-1 rounded-md hover:bg-accent/10"
                              >
                                {copiedIdx === i ? (
                                  <>
                                    <Check className="w-3 h-3" />
                                    <span>تم النسخ</span>
                                  </>
                                ) : (
                                  <>
                                    <Copy className="w-3 h-3" />
                                    <span>نسخ</span>
                                  </>
                                )}
                              </button>
                              <button
                                onClick={() => shareToWhatsApp(msg.content)}
                                aria-label="مشاركة عبر واتساب"
                                className="flex items-center gap-1 text-[10px] font-bold text-muted-foreground hover:text-green-500 transition-colors px-2 py-1 rounded-md hover:bg-green-500/10"
                              >
                                <Share2 className="w-3 h-3" />
                                <span>WhatsApp</span>
                              </button>
                            </div>
                          )}
                        </>
                      ) : (
                        <p className="leading-relaxed whitespace-pre-wrap">{msg.content}</p>
                      )}
                    </div>
                  </motion.div>
                ))
              )}
              {isLoading &&
                messages[messages.length - 1]?.role === "user" && (
                  <div className="flex justify-end">
                    <div className="bg-muted rounded-2xl rounded-br-sm px-4 py-3">
                      <div className="flex gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground animate-bounce" />
                        <span
                          className="w-1.5 h-1.5 rounded-full bg-muted-foreground animate-bounce"
                          style={{ animationDelay: "0.15s" }}
                        />
                        <span
                          className="w-1.5 h-1.5 rounded-full bg-muted-foreground animate-bounce"
                          style={{ animationDelay: "0.3s" }}
                        />
                      </div>
                    </div>
                  </div>
                )}

              {/* Smart follow-up suggestions */}
              {!isLoading && messages.length > 0 && messages[messages.length - 1]?.role === "assistant" && (
                <>
                  {loadingSuggestions ? (
                    <div className="flex items-center gap-2 text-[10px] text-muted-foreground pt-2">
                      <Lightbulb className="w-3 h-3 animate-pulse" />
                      <span>جاري توليد اقتراحات...</span>
                    </div>
                  ) : suggestions.length > 0 ? (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="space-y-1.5 pt-2"
                    >
                      <div className="flex items-center gap-1.5 text-[10px] font-bold text-muted-foreground">
                        <Lightbulb className="w-3 h-3 text-accent" />
                        <span>أسئلة مقترحة:</span>
                      </div>
                      {suggestions.map((q, i) => (
                        <motion.button
                          key={`${q}-${i}`}
                          initial={{ opacity: 0, x: -8 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: i * 0.05 }}
                          onClick={() => sendMessage(q)}
                          className="block w-full text-right text-xs px-3 py-2 rounded-lg bg-accent/5 hover:bg-accent/15 transition-colors text-foreground border border-accent/20 hover:border-accent/40"
                        >
                          {q}
                        </motion.button>
                      ))}
                    </motion.div>
                  ) : null}
                </>
              )}
            </div>

            {/* Input */}
            <div className="p-3 border-t border-border bg-background/50">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  sendMessage(input);
                }}
                className="flex items-center gap-2"
              >
                <input
                  ref={inputRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="اكتب سؤالك هنا..."
                  className="flex-1 bg-muted/50 border border-border rounded-full px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent/50 focus:border-accent/50"
                />
                <button
                  type="submit"
                  aria-label="إرسال"
                  className="w-10 h-10 rounded-full gradient-accent flex items-center justify-center shadow-md hover:shadow-lg transition-all hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
                  disabled={!input.trim() || isLoading}
                >
                  {isLoading ? (
                    <Loader2 className="w-4 h-4 text-accent-foreground animate-spin" />
                  ) : (
                    <Send className="w-4 h-4 text-accent-foreground -scale-x-100" />
                  )}
                </button>
              </form>
              <p className="text-[10px] text-muted-foreground text-center mt-2">
                مدعوم بالذكاء الاصطناعي • قد تحدث أخطاء، تحقق من المعلومات الحساسة
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
