import { useEffect, useMemo, useState } from "react";
import {
  Send, Megaphone, Users, CheckCircle2, XCircle, Loader2, Clock, ShieldOff,
  AlertTriangle, Eye, Link2, ExternalLink,
} from "lucide-react";
import AdminLayout from "@/components/AdminLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { TELEGRAM_TEMPLATES, TELEGRAM_TEMPLATES_MAP } from "@/lib/telegramTemplates";
import { Link } from "react-router-dom";

type SubStatus = "active" | "expired" | "none";
type AudienceFilter = "all" | "active" | "expired" | "none";

interface AudienceUser {
  user_id: string;
  full_name: string | null;
  telegram_id: string;
  sub_status: SubStatus;
}

const AUDIENCE_OPTIONS: { value: AudienceFilter; label: string; icon: typeof Users }[] = [
  { value: "all", label: "كل المرتبطين بـ Telegram", icon: Users },
  { value: "active", label: "أصحاب اشتراك نشط فقط", icon: CheckCircle2 },
  { value: "expired", label: "أصحاب اشتراك منتهٍ فقط", icon: Clock },
  { value: "none", label: "بلا اشتراك فقط", icon: ShieldOff },
];

const AdminTelegramBroadcast = () => {
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState<AudienceUser[]>([]);
  const [audience, setAudience] = useState<AudienceFilter>("all");
  const [templateId, setTemplateId] = useState<string>("custom");
  const [message, setMessage] = useState("");
  const [previewOpen, setPreviewOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [lastResult, setLastResult] = useState<{ sent: number; failed: number; total: number } | null>(null);
  // Total profiles in DB (independent of telegram_id filter) — used to
  // diagnose "no Telegram-linked accounts" vs "no audience match".
  const [totalProfilesCount, setTotalProfilesCount] = useState<number | null>(null);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const [profilesRes, subsRes] = await Promise.all([
        supabase
          .from("profiles")
          .select("user_id, full_name, telegram_id")
          .not("telegram_id", "is", null),
        supabase.from("subscriptions").select("user_id, status, expires_at"),
      ]);

      if (profilesRes.error) {
        toast.error(profilesRes.error.message);
        setLoading(false);
        return;
      }
      if (subsRes.error) {
        toast.error(subsRes.error.message);
        setLoading(false);
        return;
      }

      // Side query: total profile count (regardless of telegram link state).
      const { count: totalCount } = await supabase
        .from("profiles")
        .select("user_id", { count: "exact", head: true });
      setTotalProfilesCount(totalCount ?? 0);

      const latestByUser = new Map<string, { status: string; expires_at: string }>();
      for (const s of subsRes.data || []) {
        if (!s.user_id || !s.expires_at) continue;
        const prev = latestByUser.get(s.user_id);
        if (!prev || new Date(s.expires_at) > new Date(prev.expires_at)) {
          latestByUser.set(s.user_id, { status: s.status, expires_at: s.expires_at });
        }
      }

      const now = Date.now();
      const merged: AudienceUser[] = (profilesRes.data || []).map((p) => {
        const sub = latestByUser.get(p.user_id);
        let sub_status: SubStatus = "none";
        if (sub) {
          sub_status = sub.status === "active" && new Date(sub.expires_at).getTime() > now
            ? "active" : "expired";
        }
        return {
          user_id: p.user_id,
          full_name: p.full_name,
          telegram_id: p.telegram_id as string,
          sub_status,
        };
      });

      setUsers(merged);
      setLoading(false);
    };
    load();
  }, []);

  const counts = useMemo(() => {
    let active = 0, expired = 0, none = 0;
    for (const u of users) {
      if (u.sub_status === "active") active++;
      else if (u.sub_status === "expired") expired++;
      else none++;
    }
    return { active, expired, none, total: users.length };
  }, [users]);

  const targets = useMemo(() => {
    if (audience === "all") return users;
    return users.filter((u) => u.sub_status === audience);
  }, [users, audience]);

  const applyTemplate = (id: string) => {
    setTemplateId(id);
    if (id === "custom") return;
    const tpl = TELEGRAM_TEMPLATES_MAP[id];
    if (tpl) setMessage(tpl.body);
  };

  const handleBroadcast = async () => {
    const text = message.trim();
    if (!text) {
      toast.error("اكتب نص الإعلان أولاً");
      return;
    }

    // Guard 1: zero Telegram-linked users in the system at all.
    if (counts.total === 0) {
      toast.error("لا يمكن البث: لا يوجد أي مستخدم مرتبط بـ Telegram", {
        description:
          totalProfilesCount && totalProfilesCount > 0
            ? `يوجد ${totalProfilesCount} مستخدم مسجّل لكن لم يربط أحد منهم حسابه بالبوت بعد. اطلب منهم فتح /telegram-link وضغط Start في البوت.`
            : "لا يوجد مستخدمون مسجّلون بعد. عند تسجيلهم وربطهم بالبوت ستتمكن من البث.",
        duration: 8000,
      });
      return;
    }

    // Guard 2: filter matched zero recipients even though linked users exist.
    if (targets.length === 0) {
      toast.error(`لا يوجد مستلمون مطابقون لفلتر «${audienceLabel}»`, {
        description: `يوجد ${counts.total} مستخدم مرتبط بـ Telegram إجمالاً. جرّب اختيار «كل المرتبطين بـ Telegram» من قائمة الفئة المستهدفة.`,
        duration: 7000,
      });
      return;
    }

    // Guard 3: defensive — drop any target without a valid telegram_id.
    const validTargets = targets.filter(
      (u) => typeof u.telegram_id === "string" && /^-?\d{5,20}$/.test(u.telegram_id),
    );
    if (validTargets.length === 0) {
      toast.error("لا يمكن البث: جميع المستلمين لديهم chat_id غير صالح", {
        description: "افتح صفحة سجل الربط لتشخيص الحسابات المعطوبة.",
        duration: 7000,
      });
      return;
    }

    setSending(true);
    setLastResult(null);
    try {
      const chat_ids = validTargets.map((u) => u.telegram_id);
      const { data, error } = await supabase.functions.invoke("telegram-send-message", {
        body: {
          chat_ids,
          message: text,
          template_id: templateId === "custom" ? null : templateId,
        },
      });
      if (error || data?.error) {
        toast.error(data?.error || error?.message || "فشل البث");
        return;
      }
      const sent = data?.sent ?? 0;
      const failed = data?.failed ?? 0;
      setLastResult({ sent, failed, total: chat_ids.length });
      if (failed === 0) {
        toast.success(`تم إرسال البث إلى ${sent} مستخدم`);
      } else {
        toast.warning(`نجح: ${sent} • فشل: ${failed}`);
      }
      setConfirmOpen(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "فشل البث");
    } finally {
      setSending(false);
    }
  };

  const audienceLabel = AUDIENCE_OPTIONS.find((o) => o.value === audience)?.label || "";

  // Computed once per render — both the inline banner and the broadcast
  // button rely on the same canonical conditions to stay in sync.
  const noLinkedAccounts = !loading && counts.total === 0;
  const noAudienceMatch = !loading && counts.total > 0 && targets.length === 0;
  const blockedReason = noLinkedAccounts
    ? "no_linked"
    : noAudienceMatch
    ? "no_match"
    : null;

  return (
    <AdminLayout
      title="بث جماعي عبر Telegram"
      subtitle="أرسل إعلاناً واحداً لكل المستخدمين المرتبطين دفعة واحدة"
    >
      <div className="space-y-6" dir="rtl">
        {/* Pre-flight blocker: no Telegram-linked accounts at all */}
        {noLinkedAccounts && (
          <Card className="border-destructive/50 bg-destructive/5">
            <CardContent className="pt-6 space-y-3">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-lg bg-destructive/15 flex items-center justify-center shrink-0">
                  <Link2 className="w-5 h-5 text-destructive" />
                </div>
                <div className="flex-1 space-y-2">
                  <p className="font-bold text-destructive">
                    لا يمكن البث — لا يوجد أي حساب مرتبط بـ Telegram
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {totalProfilesCount && totalProfilesCount > 0
                      ? `يوجد ${totalProfilesCount} مستخدم مسجّل في النظام، لكن لم يربط أحد منهم حسابه بالبوت بعد. لن تصل أي رسالة حتى يكمل المستخدمون عملية الربط.`
                      : "لا يوجد مستخدمون مسجّلون في النظام بعد."}
                  </p>
                  <div className="rounded-md bg-background/60 border border-border/50 p-3 text-xs space-y-1.5">
                    <p className="font-bold text-foreground">كيف تُصلح هذا؟</p>
                    <ol className="list-decimal pr-5 space-y-1 text-muted-foreground">
                      <li>اطلب من المستخدمين فتح صفحة «ربط Telegram» من ملفهم الشخصي.</li>
                      <li>عليهم فتح البوت <code className="font-mono" dir="ltr">@VisaRadar16_bot</code> وضغط <code>/start</code>.</li>
                      <li>راجع «سجل عمليات الربط» لرؤية المحاولات الفاشلة وأسبابها.</li>
                    </ol>
                  </div>
                  <div className="flex flex-wrap gap-2 pt-1">
                    <Button asChild size="sm" variant="outline">
                      <Link to="/dashboard/telegram-link-log">
                        <ExternalLink className="w-3.5 h-3.5 ml-1.5" />
                        فتح سجل عمليات الربط
                      </Link>
                    </Button>
                    <Button asChild size="sm" variant="ghost">
                      <Link to="/dashboard/telegram-users">
                        <Users className="w-3.5 h-3.5 ml-1.5" />
                        المستخدمون المرتبطون
                      </Link>
                    </Button>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Pre-flight blocker: linked users exist but selected filter has none */}
        {noAudienceMatch && (
          <Card className="border-amber-500/50 bg-amber-500/5">
            <CardContent className="pt-6 flex items-start gap-3">
              <div className="w-10 h-10 rounded-lg bg-amber-500/15 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5 text-amber-600" />
              </div>
              <div className="flex-1 space-y-1">
                <p className="font-bold text-amber-700 dark:text-amber-500">
                  لا يوجد مستلمون مطابقون لفلتر «{audienceLabel}»
                </p>
                <p className="text-sm text-muted-foreground">
                  يوجد <strong className="text-foreground">{counts.total}</strong> مستخدم مرتبط بـ Telegram إجمالاً.
                  غيّر «الفئة المستهدفة» أدناه إلى «كل المرتبطين بـ Telegram» لرؤية جميع المستلمين.
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-6 flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <Users className="w-5 h-5 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold">{loading ? "—" : counts.total}</p>
                <p className="text-xs text-muted-foreground">المجموع</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6 flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-emerald-500/10 flex items-center justify-center">
                <CheckCircle2 className="w-5 h-5 text-emerald-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{loading ? "—" : counts.active}</p>
                <p className="text-xs text-muted-foreground">اشتراك نشط</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6 flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-amber-500/10 flex items-center justify-center">
                <Clock className="w-5 h-5 text-amber-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{loading ? "—" : counts.expired}</p>
                <p className="text-xs text-muted-foreground">منتهٍ</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6 flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center">
                <ShieldOff className="w-5 h-5 text-muted-foreground" />
              </div>
              <div>
                <p className="text-2xl font-bold">{loading ? "—" : counts.none}</p>
                <p className="text-xs text-muted-foreground">بلا اشتراك</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Composer */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Megaphone className="w-5 h-5 text-primary" />
              صياغة الإعلان
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Audience */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium">الفئة المستهدفة</label>
              <Select value={audience} onValueChange={(v) => setAudience(v as AudienceFilter)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {AUDIENCE_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="flex items-center gap-2 pt-1">
                <Badge variant="secondary">
                  <Users className="w-3 h-3 ml-1" />
                  {targets.length} مستلم
                </Badge>
                {targets.length === 0 && !loading && (
                  <span className="text-xs text-muted-foreground">لا يوجد مستلمون لهذا الفلتر</span>
                )}
              </div>
            </div>

            {/* Template */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium">قالب جاهز</label>
              <Select value={templateId} onValueChange={applyTemplate}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="custom">✍️ رسالة مخصّصة (فارغة)</SelectItem>
                  {TELEGRAM_TEMPLATES.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.emoji} {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {templateId !== "custom" && TELEGRAM_TEMPLATES_MAP[templateId] && (
                <p className="text-xs text-muted-foreground">
                  {TELEGRAM_TEMPLATES_MAP[templateId].description}
                </p>
              )}
            </div>

            {/* Message */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium">نص الإعلان</label>
              <Textarea
                value={message}
                onChange={(e) => {
                  setMessage(e.target.value);
                  if (templateId !== "custom") setTemplateId("custom");
                }}
                placeholder="اكتب نص الإعلان هنا... يدعم HTML بسيط (<b>, <i>, <a>)"
                rows={10}
                className="resize-none font-mono text-xs leading-relaxed"
              />
              <p className="text-xs text-muted-foreground">
                {message.length} حرف • سيُرسل لكل مستلم بشكل متتابع
              </p>
            </div>

            {/* Last result */}
            {lastResult && (
              <div className="rounded-lg border bg-muted/30 p-3 text-sm">
                <p className="font-medium mb-1">آخر بث:</p>
                <div className="flex flex-wrap gap-3 text-xs">
                  <span className="text-emerald-600">✅ نجح: {lastResult.sent}</span>
                  {lastResult.failed > 0 && (
                    <span className="text-destructive">❌ فشل: {lastResult.failed}</span>
                  )}
                  <span className="text-muted-foreground">من أصل {lastResult.total}</span>
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="flex flex-wrap gap-2 pt-2">
              <Button
                variant="outline"
                onClick={() => setPreviewOpen(true)}
                disabled={!message.trim()}
              >
                <Eye className="w-4 h-4 ml-2" />
                معاينة
              </Button>
              <Button
                onClick={() => setConfirmOpen(true)}
                disabled={loading || sending || !message.trim() || blockedReason !== null}
                title={
                  blockedReason === "no_linked"
                    ? "لا يمكن البث: لا يوجد أي مستخدم مرتبط بـ Telegram"
                    : blockedReason === "no_match"
                    ? `لا يوجد مستلمون مطابقون لفلتر «${audienceLabel}»`
                    : undefined
                }
              >
                <Send className="w-4 h-4 ml-2" />
                بث إلى {targets.length} مستلم
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Preview Dialog */}
      <AlertDialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Eye className="w-5 h-5" />
              معاينة الإعلان
            </AlertDialogTitle>
            <AlertDialogDescription>
              هكذا ستظهر الرسالة في Telegram (HTML rendered):
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div
            className="rounded-lg border bg-muted/30 p-4 text-sm whitespace-pre-wrap leading-relaxed"
            dangerouslySetInnerHTML={{ __html: message }}
          />
          <AlertDialogFooter>
            <AlertDialogCancel>إغلاق</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Confirm Broadcast */}
      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-600" />
              تأكيد البث الجماعي
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <span className="block">
                سيتم إرسال الرسالة إلى{" "}
                <strong className="text-foreground">{targets.length} مستخدم</strong> ضمن فئة{" "}
                <strong className="text-foreground">«{audienceLabel}»</strong>.
              </span>
              <span className="block text-amber-600 dark:text-amber-500">
                ⚠️ لا يمكن التراجع عن هذا الإجراء بعد التنفيذ.
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={sending}>إلغاء</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); handleBroadcast(); }}
              disabled={sending}
            >
              {sending ? (
                <>
                  <Loader2 className="w-4 h-4 ml-2 animate-spin" />
                  جارٍ البث...
                </>
              ) : (
                <>
                  <Send className="w-4 h-4 ml-2" />
                  تأكيد وإرسال
                </>
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AdminLayout>
  );
};

export default AdminTelegramBroadcast;
