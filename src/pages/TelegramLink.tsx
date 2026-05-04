import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Send, Copy, ExternalLink, CheckCircle2, MessageCircle, ArrowRight, RefreshCw, AlertCircle, XCircle, Info, RotateCw } from "lucide-react";
import Layout from "@/components/Layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { formatLinkedSince, formatFullDateAr } from "@/lib/relativeTime";
import { useTelegramLinkPolling } from "@/hooks/useTelegramLinkPolling";

const BOT_USERNAME = "VisaRadar16_bot";
const BOT_LINK = `https://t.me/${BOT_USERNAME}`;

interface DiagnosticState {
  checkedAt: string;
  dbTelegramId: string | null;
  formChatId: string;
  matches: boolean;
  reason: string;
  severity: "success" | "warning" | "error" | "info";
}

const TelegramLink = () => {
  const { user } = useAuth();
  const [chatId, setChatId] = useState("");
  const [currentChatId, setCurrentChatId] = useState<string | null>(null);
  const [linkedAt, setLinkedAt] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [unlinking, setUnlinking] = useState(false);
  const [diagnosing, setDiagnosing] = useState(false);
  const [diagnostic, setDiagnostic] = useState<DiagnosticState | null>(null);
  const [restarting, setRestarting] = useState(false);
  const [pollingActive, setPollingActive] = useState(false);
  const [restartLink, setRestartLink] = useState<string | null>(null);
  const [restartExpiresAt, setRestartExpiresAt] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    supabase
      .from("profiles")
      .select("telegram_id, telegram_linked_at")
      .eq("user_id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (data?.telegram_id) {
          setCurrentChatId(data.telegram_id);
          setChatId(data.telegram_id);
          setLinkedAt((data as any).telegram_linked_at || null);
        }
      });
  }, [user]);

  // Auto-detect when /start <token> succeeds in the bot and update UI.
  useTelegramLinkPolling({
    userId: user?.id,
    enabled: pollingActive,
    intervalMs: 5_000,
    onLinked: () => {
      setPollingActive(false);
      setRestartLink(null);
      setRestartExpiresAt(null);
      // Refresh profile from DB so chat_id + linked_at appear.
      if (user) {
        supabase
          .from("profiles")
          .select("telegram_id, telegram_linked_at")
          .eq("user_id", user.id)
          .maybeSingle()
          .then(({ data }) => {
            if (data?.telegram_id) {
              setCurrentChatId(data.telegram_id);
              setChatId(data.telegram_id);
              setLinkedAt((data as any).telegram_linked_at || null);
            }
          });
      }
    },
  });

  const handleRestartLink = async () => {
    if (!user) {
      toast.error("سجّل الدخول أولاً");
      return;
    }
    setRestarting(true);
    try {
      // 1) Unlink current binding (if any) so the new /start flow re-binds cleanly.
      if (currentChatId) {
        const { error: unlinkErr } = await supabase
          .from("profiles")
          .update({ telegram_id: null })
          .eq("user_id", user.id);
        if (unlinkErr) {
          toast.error(`فشل فك الربط القديم: ${unlinkErr.message}`);
          return;
        }
        setCurrentChatId(null);
        setChatId("");
        setLinkedAt(null);
      }

      // 2) Generate a fresh deep-link token.
      const { data, error } = await supabase.functions.invoke("telegram-generate-link");
      if (error || data?.error || !data?.link) {
        toast.error(data?.error || error?.message || "فشل إنشاء رابط جديد");
        return;
      }

      setRestartLink(data.link);
      setRestartExpiresAt(data.expires_at || null);

      // 3) Open the bot deep-link in a new tab so /start <token> is sent automatically.
      window.open(data.link, "_blank", "noopener,noreferrer");

      // 4) Start polling — useTelegramLinkPolling will fire onLinked when
      //    telegram-poll saves telegram_id back to the profile.
      setPollingActive(true);
      toast.success("تم فتح البوت — أكمل بالضغط على Start وسنتحقق تلقائيًا.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "خطأ غير متوقع");
    } finally {
      setRestarting(false);
    }
  };

  const handleVerify = async () => {
    const cleaned = chatId.trim();
    if (!cleaned) {
      toast.error("الرجاء إدخال chat_id");
      return;
    }
    if (!/^-?\d{5,20}$/.test(cleaned)) {
      toast.error("chat_id يجب أن يكون رقماً صالحاً");
      return;
    }

    setVerifying(true);
    try {
      const { data, error } = await supabase.functions.invoke("telegram-verify-chat", {
        body: { chat_id: cleaned },
      });
      if (error || data?.error) {
        toast.error(data?.error || error?.message || "فشل التحقق");
        return;
      }
      setCurrentChatId(cleaned);
      setLinkedAt(new Date().toISOString());
      toast.success("تم الربط بنجاح! تحقق من رسالة Telegram.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "فشل التحقق");
    } finally {
      setVerifying(false);
    }
  };

  const handleUnlink = async () => {
    if (!user) return;
    setUnlinking(true);
    try {
      const { error } = await supabase
        .from("profiles")
        .update({ telegram_id: null })
        .eq("user_id", user.id);
      if (error) {
        toast.error(error.message);
        return;
      }
      setCurrentChatId(null);
      setChatId("");
      setLinkedAt(null);
      toast.success("تم فك الربط");
    } finally {
      setUnlinking(false);
    }
  };

  const copyBotLink = () => {
    navigator.clipboard.writeText(BOT_LINK);
    toast.success("تم نسخ الرابط");
  };

  const runDiagnostic = async () => {
    if (!user) {
      setDiagnostic({
        checkedAt: new Date().toISOString(),
        dbTelegramId: null,
        formChatId: chatId.trim(),
        matches: false,
        reason: "لم يتم تسجيل الدخول. سجّل الدخول أولاً ثم أعد المحاولة.",
        severity: "error",
      });
      return;
    }
    setDiagnosing(true);
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("telegram_id, telegram_linked_at, telegram_username")
        .eq("user_id", user.id)
        .maybeSingle();

      const formVal = chatId.trim();
      const dbVal = data?.telegram_id ?? null;
      const checkedAt = new Date().toISOString();

      if (error) {
        setDiagnostic({
          checkedAt,
          dbTelegramId: null,
          formChatId: formVal,
          matches: false,
          reason: `فشل قراءة الملف الشخصي من القاعدة: ${error.message}. تحقق من الاتصال أو الصلاحيات.`,
          severity: "error",
        });
        return;
      }

      if (!data) {
        setDiagnostic({
          checkedAt,
          dbTelegramId: null,
          formChatId: formVal,
          matches: false,
          reason: "لم يُعثر على ملف شخصي لهذا الحساب. اضغط على 'تحقق' لإنشائه أو راجع الدعم.",
          severity: "error",
        });
        return;
      }

      if (!dbVal) {
        setDiagnostic({
          checkedAt,
          dbTelegramId: null,
          formChatId: formVal,
          matches: false,
          reason: formVal
            ? "أدخلت chat_id لكنه لم يُحفظ بعد. اضغط زر 'تحقق' لإكمال الربط. قد تكون الأسباب: لم تبدأ محادثة /start مع البوت، أو chat_id غير صحيح، أو فشل استدعاء الدالة."
            : "لم يتم حفظ أي chat_id بعد. اتبع الخطوات 1→4 وأدخل الرقم ثم اضغط 'تحقق'.",
          severity: "warning",
        });
        return;
      }

      const matches = formVal ? formVal === dbVal : true;
      setDiagnostic({
        checkedAt,
        dbTelegramId: dbVal,
        formChatId: formVal,
        matches,
        reason: matches
          ? `✅ تم حفظ telegram_id بنجاح في القاعدة${data.telegram_username ? ` (المستخدم: @${data.telegram_username})` : ""}. ستصلك التنبيهات تلقائيًا عند فتح المواعيد.`
          : `chat_id المُدخل (${formVal}) لا يطابق المحفوظ (${dbVal}). إذا أردت تغييره، فك الربط أولاً ثم أعد التحقق.`,
        severity: matches ? "success" : "warning",
      });
    } catch (e) {
      setDiagnostic({
        checkedAt: new Date().toISOString(),
        dbTelegramId: null,
        formChatId: chatId.trim(),
        matches: false,
        reason: e instanceof Error ? e.message : "خطأ غير متوقع أثناء التشخيص",
        severity: "error",
      });
    } finally {
      setDiagnosing(false);
    }
  };

  return (
    <Layout>
      <div className="container max-w-3xl py-8 md:py-12 space-y-6" dir="rtl">
        <div className="text-center space-y-2">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 mb-2">
            <Send className="w-8 h-8 text-primary" />
          </div>
          <h1 className="text-3xl md:text-4xl font-bold">ربط Telegram</h1>
          <p className="text-muted-foreground">
            استلم تنبيهات فتح مواعيد التأشيرات لحظياً عبر بوت Telegram
          </p>
        </div>

        {currentChatId && (
          <Card className="border-primary/40 bg-primary/5">
            <CardContent className="pt-6 flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-3">
                <CheckCircle2 className="w-6 h-6 text-primary" />
                <div>
                  <p className="font-semibold">حسابك مرتبط بـ Telegram</p>
                  <p className="text-sm text-muted-foreground">
                    chat_id: <span className="font-mono">{currentChatId}</span>
                  </p>
                  {linkedAt && (
                    <p
                      className="text-xs text-muted-foreground/80 mt-1"
                      title={formatFullDateAr(linkedAt)}
                    >
                      🕒 {formatLinkedSince(linkedAt)}
                    </p>
                  )}
                </div>
              </div>
              <Button variant="outline" onClick={handleUnlink} disabled={unlinking}>
                {unlinking ? "جارٍ..." : "فك الربط"}
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Step 1: Open bot */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <Badge variant="secondary" className="w-8 h-8 rounded-full flex items-center justify-center text-base">
                1
              </Badge>
              <CardTitle>افتح البوت في Telegram</CardTitle>
            </div>
            <CardDescription>
              اضغط على الرابط أدناه لفتح المحادثة مع البوت الرسمي
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center gap-2 p-3 rounded-md border bg-muted/30 font-mono text-sm">
              <MessageCircle className="w-4 h-4 text-primary shrink-0" />
              <span className="flex-1 truncate" dir="ltr">@{BOT_USERNAME}</span>
              <Button size="sm" variant="ghost" onClick={copyBotLink}>
                <Copy className="w-4 h-4" />
              </Button>
            </div>
            <Button asChild className="w-full" size="lg">
              <a href={BOT_LINK} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="w-4 h-4 ml-2" />
                فتح @{BOT_USERNAME}
              </a>
            </Button>
          </CardContent>
        </Card>

        {/* Step 2: /start */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <Badge variant="secondary" className="w-8 h-8 rounded-full flex items-center justify-center text-base">
                2
              </Badge>
              <CardTitle>أرسل أمر /start للبوت</CardTitle>
            </div>
            <CardDescription>
              داخل المحادثة، أرسل الأمر التالي ليبدأ البوت بالعمل
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="p-4 rounded-md bg-muted/40 border-2 border-dashed text-center">
              <code className="text-lg font-mono font-bold text-primary">/start</code>
            </div>
          </CardContent>
        </Card>

        {/* Step 3: Get chat_id */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <Badge variant="secondary" className="w-8 h-8 rounded-full flex items-center justify-center text-base">
                3
              </Badge>
              <CardTitle>احصل على chat_id الخاص بك</CardTitle>
            </div>
            <CardDescription>
              اطلب من البوت رقم المحادثة، أو استخدم بوت <span dir="ltr" className="font-mono">@userinfobot</span>
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="text-sm text-muted-foreground space-y-2">
              <p className="flex items-start gap-2">
                <ArrowRight className="w-4 h-4 mt-1 shrink-0 text-primary" />
                افتح <a href="https://t.me/userinfobot" target="_blank" rel="noopener noreferrer" className="text-primary underline" dir="ltr">@userinfobot</a> وأرسل /start، سيرد عليك بالرقم.
              </p>
              <p className="flex items-start gap-2">
                <ArrowRight className="w-4 h-4 mt-1 shrink-0 text-primary" />
                أو اطلب من بوتنا الأمر <code className="font-mono bg-muted px-1.5 rounded">/myid</code>
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Step 4: Verify */}
        <Card className="border-primary/30">
          <CardHeader>
            <div className="flex items-center gap-3">
              <Badge variant="secondary" className="w-8 h-8 rounded-full flex items-center justify-center text-base">
                4
              </Badge>
              <CardTitle>أدخل chat_id واضغط تحقق</CardTitle>
            </div>
            <CardDescription>
              سنرسل رسالة اختبار. إذا وصلتك، سيتم حفظ الربط تلقائياً.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="chat_id">Telegram chat_id</Label>
              <Input
                id="chat_id"
                type="text"
                inputMode="numeric"
                placeholder="مثال: 1698382532"
                value={chatId}
                onChange={(e) => setChatId(e.target.value)}
                dir="ltr"
                className="font-mono text-base"
              />
            </div>
            <Button onClick={handleVerify} disabled={verifying} className="w-full" size="lg">
              <Send className="w-4 h-4 ml-2" />
              {verifying ? "جارٍ التحقق..." : "تحقق وأرسل رسالة اختبار"}
            </Button>
            <p className="text-xs text-muted-foreground text-center">
              ⚠️ يجب أن تكون قد بدأت المحادثة مع البوت بأمر /start قبل التحقق
            </p>
          </CardContent>
        </Card>

        {/* Diagnostic panel */}
        <Card className="border-dashed">
          <CardHeader>
            <div className="flex items-center gap-3">
              <Badge variant="outline" className="w-8 h-8 rounded-full flex items-center justify-center">
                <Info className="w-4 h-4" />
              </Badge>
              <CardTitle>تشخيص حالة الربط</CardTitle>
            </div>
            <CardDescription>
              اضغط الزر للتحقق مباشرة من قاعدة البيانات: هل تم حفظ telegram_id فعلاً؟ ولماذا قد تفشل العملية؟
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Button
              type="button"
              variant="outline"
              onClick={runDiagnostic}
              disabled={diagnosing}
              className="w-full"
            >
              <RefreshCw className={`w-4 h-4 ml-2 ${diagnosing ? "animate-spin" : ""}`} />
              {diagnosing ? "جارٍ الفحص..." : "فحص الحالة الآن"}
            </Button>

            {diagnostic && (
              <div
                className={`rounded-lg border p-4 space-y-3 ${
                  diagnostic.severity === "success"
                    ? "border-green-500/40 bg-green-500/5"
                    : diagnostic.severity === "warning"
                    ? "border-yellow-500/40 bg-yellow-500/5"
                    : diagnostic.severity === "error"
                    ? "border-destructive/40 bg-destructive/5"
                    : "border-border bg-muted/30"
                }`}
              >
                <div className="flex items-start gap-2">
                  {diagnostic.severity === "success" ? (
                    <CheckCircle2 className="w-5 h-5 text-green-500 shrink-0 mt-0.5" />
                  ) : diagnostic.severity === "warning" ? (
                    <AlertCircle className="w-5 h-5 text-yellow-500 shrink-0 mt-0.5" />
                  ) : diagnostic.severity === "error" ? (
                    <XCircle className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
                  ) : (
                    <Info className="w-5 h-5 text-muted-foreground shrink-0 mt-0.5" />
                  )}
                  <p className="text-sm leading-relaxed flex-1">{diagnostic.reason}</p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs pt-2 border-t border-border/50">
                  <div className="flex items-center justify-between gap-2 p-2 rounded bg-background/60">
                    <span className="text-muted-foreground">في قاعدة البيانات:</span>
                    <span className="font-mono font-bold" dir="ltr">
                      {diagnostic.dbTelegramId ?? "—"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2 p-2 rounded bg-background/60">
                    <span className="text-muted-foreground">في الحقل أعلاه:</span>
                    <span className="font-mono font-bold" dir="ltr">
                      {diagnostic.formChatId || "—"}
                    </span>
                  </div>
                </div>

                <p className="text-[11px] text-muted-foreground/70 text-left" dir="ltr">
                  Checked at: {new Date(diagnostic.checkedAt).toLocaleString()}
                </p>
              </div>
            )}

            <div className="text-xs text-muted-foreground space-y-1.5 border-t pt-3">
              <p className="font-bold text-foreground">أسباب شائعة لفشل الربط:</p>
              <ul className="space-y-1 list-disc pr-5">
                <li>لم تضغط /start في محادثة البوت قبل التحقق.</li>
                <li>chat_id خاطئ (تأكد أنه رقم بدون مسافات).</li>
                <li>حظرت البوت أو حذفت المحادثة.</li>
                <li>مشكلة مؤقتة في الشبكة أو في دالة <code className="font-mono">telegram-verify-chat</code>.</li>
                <li>غير مسجّل الدخول في الموقع.</li>
              </ul>
            </div>
          </CardContent>
        </Card>

        <div className="text-center">
          <Button variant="link" asChild>
            <Link to="/profile">العودة إلى الملف الشخصي</Link>
          </Button>
        </div>
      </div>
    </Layout>
  );
};

export default TelegramLink;
