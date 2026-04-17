import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { MessageCircle, X, Send, Loader2, Sparkles, RotateCcw } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { toast } from "sonner";

type Msg = { role: "user" | "assistant"; content: string };

const STORAGE_KEY = "visa-chat-history";
const SUGGESTED_QUESTIONS = [
  "ما هي الوثائق المطلوبة لتأشيرة شنغن؟",
  "كيف أحجز موعداً في VFS؟",
  "ما هي مدة معالجة تأشيرة فرنسا؟",
  "نصائح لتجنب رفض التأشيرة",
];

export default function VisaChatBot() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Load history from localStorage
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) setMessages(JSON.parse(stored));
    } catch {
      // ignore
    }
  }, []);

  // Persist history
  useEffect(() => {
    if (messages.length > 0) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(messages.slice(-30)));
    }
  }, [messages]);

  // Auto-scroll to bottom
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, isLoading]);

  // Focus input when opening
  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 200);
  }, [open]);

  const sendMessage = async (text: string) => {
    if (!text.trim() || isLoading) return;
    const userMsg: Msg = { role: "user", content: text.trim() };
    const newHistory = [...messages, userMsg];
    setMessages(newHistory);
    setInput("");
    setIsLoading(true);

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
      const CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/visa-chat`;
      const resp = await fetch(CHAT_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
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
    } catch (err) {
      console.error("Chat error:", err);
      toast.error("حدث خطأ، حاول مجدداً");
      setMessages((prev) => prev.slice(0, -1));
    } finally {
      setIsLoading(false);
    }
  };

  const clearChat = () => {
    setMessages([]);
    localStorage.removeItem(STORAGE_KEY);
    toast.success("تم مسح المحادثة");
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
                      متصل الآن
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  {messages.length > 0 && (
                    <button
                      onClick={clearChat}
                      aria-label="مسح المحادثة"
                      className="w-8 h-8 rounded-full hover:bg-accent-foreground/15 flex items-center justify-center transition-colors"
                    >
                      <RotateCcw className="w-4 h-4 text-accent-foreground" />
                    </button>
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
                        <div className="prose prose-sm prose-invert max-w-none [&_*]:!my-1 [&_p]:!my-1 [&_ul]:!my-1.5 [&_ol]:!my-1.5 [&_h1]:!text-base [&_h2]:!text-sm [&_h3]:!text-sm [&_strong]:text-accent">
                          <ReactMarkdown>{msg.content}</ReactMarkdown>
                        </div>
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
