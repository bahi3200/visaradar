import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Send, Copy, ExternalLink, CheckCircle2, MessageCircle, ArrowRight, RefreshCw, AlertCircle, XCircle, Info, RotateCw, Zap, ChevronDown, Settings2 } from "lucide-react";
import Layout from "@/components/Layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
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
  lastLinkedAt?: string | null;
  lastLogAction?: string | null;
  lastLogStatus?: string | null;
  lastLogError?: string | null;
  lastLogAt?: string | null;
  fixSteps?: string[];
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
  const [advancedOpen, setAdvancedOpen] = useState(false);

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

  // Realtime: react instantly to any change on this user's profile row
  // (link / unlink / re-link from any device) without page reload.
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel(`telegram-link-${user.id}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "profiles", filter: `user_id=eq.${user.id}` },
        (payload) => {
          const next: any = payload.new || {};
          const prev: any = payload.old || {};
          if (next.telegram_id) {
            setCurrentChatId(next.telegram_id);
            setChatId(next.telegram_id);
            setLinkedAt(next.telegram_linked_at || null);
            if (!prev.telegram_id) {
              setPollingActive(false);
              setRestartLink(null);
              setRestartExpiresAt(null);
              toast.success("✅ تم ربط حسابك بـ Telegram بنجاح");
            }
          } else if (prev.telegram_id && !next.telegram_id) {
            setCurrentChatId(null);
            setChatId("");
            setLinkedAt(null);
          }
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
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
        fixSteps: [
          "افتح صفحة تسجيل الدخول وأدخل بياناتك.",
          "ارجع إلى هذه الصفحة وأعد فحص الحالة.",
        ],
      });
      return;
    }
    setDiagnosing(true);
    try {
      const [{ data, error }, { data: logData }] = await Promise.all([
        supabase
          .from("profiles")
          .select("telegram_id, telegram_linked_at, telegram_username")
          .eq("user_id", user.id)
          .maybeSingle(),
        supabase
          .from("telegram_link_log")
          .select("action, status, error_message, created_at, source")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);

      const formVal = chatId.trim();
      const dbVal = data?.telegram_id ?? null;
      const checkedAt = new Date().toISOString();
      const lastLinkedAt = (data as any)?.telegram_linked_at ?? null;
      const lastLogAction = logData?.action ?? null;
      const lastLogStatus = logData?.status ?? null;
      const lastLogError = logData?.error_message ?? null;
      const lastLogAt = logData?.created_at ?? null;

      if (error) {
        setDiagnostic({
          checkedAt,
          dbTelegramId: null,
          formChatId: formVal,
          matches: false,
          reason: `فشل قراءة الملف الشخصي من القاعدة: ${error.message}. تحقق من الاتصال أو الصلاحيات.`,
          severity: "error",
          lastLinkedAt,
          lastLogAction,
          lastLogStatus,
          lastLogError,
          lastLogAt,
          fixSteps: [
            "تأكد أن لديك اتصال إنترنت مستقر.",
            "سجّل خروج ثم دخول مجددًا لتجديد جلستك.",
            "إن استمرت المشكلة، أبلغ الدعم بنص الخطأ المعروض.",
          ],
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
          lastLinkedAt,
          lastLogAction,
          lastLogStatus,
          lastLogError,
          lastLogAt,
          fixSteps: [
            "اضغط زر «إعادة تشغيل الربط الآن» في الأسفل لإنشاء ملف شخصي جديد تلقائيًا.",
            "أو املأ chat_id واضغط «تحقق» وسننشئ الملف فورًا.",
          ],
        });
        return;
      }

      if (!dbVal) {
        setDiagnostic({
          checkedAt,
          dbTelegramId: null,
          formChatId: formVal,
          matches: false,
          reason: lastLogError
            ? `آخر محاولة ربط فشلت: ${lastLogError}`
            : formVal
            ? "أدخلت chat_id لكنه لم يُحفظ بعد. اضغط زر 'تحقق' لإكمال الربط. قد تكون الأسباب: لم تبدأ محادثة /start مع البوت، أو chat_id غير صحيح، أو فشل استدعاء الدالة."
            : "لم يتم حفظ أي chat_id بعد. اتبع الخطوات 1→4 وأدخل الرقم ثم اضغط 'تحقق'.",
          severity: "warning",
          lastLinkedAt,
          lastLogAction,
          lastLogStatus,
          lastLogError,
          lastLogAt,
          fixSteps: [
            "افتح البوت وأرسل /start.",
            "احصل على chat_id من @userinfobot أو من البوت بأمر /myid.",
            "أدخل الرقم في الحقل أعلاه ثم اضغط «تحقق».",
            "أو استخدم «إعادة تشغيل الربط الآن» لتنفيذ كل ذلك تلقائيًا.",
          ],
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
        lastLinkedAt,
        lastLogAction,
        lastLogStatus,
        lastLogError,
        lastLogAt,
        fixSteps: matches
          ? undefined
          : [
              "اضغط «فك الربط» في الأعلى.",
              "أدخل chat_id الجديد ثم اضغط «تحقق».",
            ],
      });
    } catch (e) {
      setDiagnostic({
        checkedAt: new Date().toISOString(),
        dbTelegramId: null,
        formChatId: chatId.trim(),
        matches: false,
        reason: e instanceof Error ? e.message : "خطأ غير متوقع أثناء التشخيص",
        severity: "error",
        fixSteps: [
          "أعد تحميل الصفحة وحاول مجددًا.",
          "تحقق من اتصالك بالإنترنت.",
          "إن تكرر الخطأ، أبلغ الدعم بالنص المعروض.",
        ],
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
            اربط حسابك بنقرة واحدة لتصلك تنبيهات فتح مواعيد التأشيرات لحظياً
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

        {/* One-click linking — primary path */}
        {!currentChatId && (
          <Card className="border-primary/40 bg-gradient-to-br from-primary/10 via-card to-accent/10 shadow-lg">
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-primary/15 flex items-center justify-center">
                  <Zap className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <CardTitle className="text-xl">اربط حسابك بنقرة واحدة</CardTitle>
                  <CardDescription className="mt-1">
                    سنفتح البوت لك ونربط الحساب تلقائياً — لا حاجة لنسخ أي رقم.
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <Button
                type="button"
                onClick={handleRestartLink}
                disabled={restarting || pollingActive}
                className="w-full h-14 text-base font-bold gradient-primary"
                size="lg"
              >
                {restarting ? (
                  <>
                    <RefreshCw className="w-5 h-5 ml-2 animate-spin" />
                    جارٍ إنشاء الرابط...
                  </>
                ) : pollingActive ? (
                  <>
                    <RefreshCw className="w-5 h-5 ml-2 animate-spin" />
                    بانتظار ضغطك Start في البوت...
                  </>
                ) : (
                  <>
                    <Send className="w-5 h-5 ml-2" />
                    اربط Telegram الآن
                  </>
                )}
              </Button>

              {restartLink && (
                <div className="rounded-lg border border-accent/30 bg-background/60 p-3 space-y-2">
                  <p className="text-xs text-muted-foreground">
                    لم يُفتح البوت تلقائياً؟ افتح الرابط يدوياً:
                  </p>
                  <div className="flex items-center gap-2">
                    <a
                      href={restartLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex-1 truncate text-xs font-mono text-primary underline"
                      dir="ltr"
                    >
                      {restartLink}
                    </a>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        navigator.clipboard.writeText(restartLink);
                        toast.success("تم نسخ الرابط");
                      }}
                    >
                      <Copy className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                  {restartExpiresAt && (
                    <p className="text-[11px] text-muted-foreground/70">
                      صالح حتى: {new Date(restartExpiresAt).toLocaleTimeString("ar-DZ")}
                    </p>
                  )}
                  {pollingActive && (
                    <div className="flex items-center gap-2 text-xs text-primary pt-1">
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      نتحقق كل 5 ثوانٍ من اكتمال الربط...
                    </div>
                  )}
                </div>
              )}

              <div className="grid grid-cols-3 gap-2 pt-2">
                {[
                  { n: "1", t: "اضغط الزر" },
                  { n: "2", t: "افتح البوت" },
                  { n: "3", t: "اضغط Start" },
                ].map((s) => (
                  <div key={s.n} className="text-center p-2 rounded-md bg-background/50 border border-border/40">
                    <div className="w-6 h-6 mx-auto rounded-full bg-primary/15 text-primary text-xs font-bold flex items-center justify-center mb-1">
                      {s.n}
                    </div>
                    <p className="text-[11px] text-muted-foreground">{s.t}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Advanced options — manual chat_id + diagnostic */}
        <Collapsible open={advancedOpen} onOpenChange={setAdvancedOpen}>
          <CollapsibleTrigger asChild>
            <Button variant="ghost" className="w-full justify-between text-muted-foreground hover:text-foreground">
              <span className="flex items-center gap-2">
                <Settings2 className="w-4 h-4" />
                خيارات متقدمة (إدخال يدوي وتشخيص)
              </span>
              <ChevronDown className={`w-4 h-4 transition-transform ${advancedOpen ? "rotate-180" : ""}`} />
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="space-y-6 pt-4">

        {/* Open bot manually */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <MessageCircle className="w-4 h-4 text-primary" /> فتح البوت يدوياً
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center gap-2 p-3 rounded-md border bg-muted/30 font-mono text-sm">
              <span className="flex-1 truncate" dir="ltr">@{BOT_USERNAME}</span>
              <Button size="sm" variant="ghost" onClick={copyBotLink}>
                <Copy className="w-4 h-4" />
              </Button>
            </div>
            <Button asChild variant="outline" className="w-full">
              <a href={BOT_LINK} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="w-4 h-4 ml-2" />
                فتح @{BOT_USERNAME}
              </a>
            </Button>
            <div className="text-xs text-muted-foreground space-y-1">
              <p>1) أرسل /start داخل المحادثة.</p>
              <p>2) احصل على chat_id من <a href="https://t.me/userinfobot" target="_blank" rel="noopener noreferrer" className="text-primary underline" dir="ltr">@userinfobot</a> أو من بوتنا بالأمر <code className="font-mono bg-muted px-1.5 rounded">/myid</code>.</p>
            </div>
          </CardContent>
        </Card>

        {/* Manual verify */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">إدخال chat_id يدوياً</CardTitle>
            <CardDescription>سنرسل رسالة اختبار. إذا وصلتك، سيتم حفظ الربط.</CardDescription>
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
            <Button onClick={handleVerify} disabled={verifying} variant="outline" className="w-full">
              <Send className="w-4 h-4 ml-2" />
              {verifying ? "جارٍ التحقق..." : "تحقق وأرسل رسالة اختبار"}
            </Button>
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

                <div className="grid grid-cols-1 gap-2 text-xs">
                  <div className="flex items-center justify-between gap-2 p-2 rounded bg-background/60">
                    <span className="text-muted-foreground">آخر وقت ربط مسجّل:</span>
                    <span
                      className="font-bold"
                      title={diagnostic.lastLinkedAt ? formatFullDateAr(diagnostic.lastLinkedAt) : undefined}
                    >
                      {diagnostic.lastLinkedAt ? formatLinkedSince(diagnostic.lastLinkedAt) : "لا يوجد"}
                    </span>
                  </div>
                  {(diagnostic.lastLogAction || diagnostic.lastLogError) && (
                    <div className="p-2 rounded bg-background/60 space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-muted-foreground">آخر سجل عملية:</span>
                        <span className="font-bold">
                          {diagnostic.lastLogAction || "—"}
                          {diagnostic.lastLogStatus ? ` · ${diagnostic.lastLogStatus}` : ""}
                        </span>
                      </div>
                      {diagnostic.lastLogAt && (
                        <p className="text-[11px] text-muted-foreground/70 text-left" dir="ltr">
                          {new Date(diagnostic.lastLogAt).toLocaleString()}
                        </p>
                      )}
                      {diagnostic.lastLogError && (
                        <p className="text-xs text-destructive leading-relaxed">
                          سبب الفشل: {diagnostic.lastLogError}
                        </p>
                      )}
                    </div>
                  )}
                </div>

                {diagnostic.fixSteps && diagnostic.fixSteps.length > 0 && (
                  <div className="rounded-md border border-primary/30 bg-primary/5 p-3 space-y-2">
                    <p className="text-xs font-bold text-foreground">خطوات الإصلاح:</p>
                    <ol className="text-xs space-y-1 list-decimal pr-5 leading-relaxed">
                      {diagnostic.fixSteps.map((s, i) => (
                        <li key={i}>{s}</li>
                      ))}
                    </ol>
                  </div>
                )}

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

          </CollapsibleContent>
        </Collapsible>

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
