import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import {
  Volume2,
  Vibrate,
  BellOff,
  Settings2,
  Play,
  Send,
  Loader2,
  Bell,
  Lock,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Clock,
} from "lucide-react";
import { Slider } from "@/components/ui/slider";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import {
  type AlertMode,
  getAlertMode,
  getVolume,
  setAlertMode,
  setVolume,
  triggerAlert,
  type NotifAttempt,
  type NotifBlockReason,
  getLastNotifAttempt,
  recordNotifAttempt,
  NOTIF_ATTEMPT_EVENT,
} from "@/lib/notificationPrefs";
import {
  getPermissionContextIssue,
  getDevContextMode,
  setDevContextMode,
  type DevContextMode,
  showContextBlockedToast,
} from "@/components/NotificationPermissionBanner";
import { FlaskConical, ShieldAlert } from "lucide-react";

// Keep this in sync with NotificationPermissionBanner — these are the routes
// where we never request browser permission (public/auth/legal flows).
const PUBLIC_BLOCKED_PREFIXES = [
  "/auth/",
  "/reset-password",
  "/privacy",
  "/terms",
  "/install",
  "/help",
];

type PermissionState = "default" | "granted" | "denied" | "unsupported";
function getPermission(): PermissionState {
  if (typeof window === "undefined" || !("Notification" in window)) return "unsupported";
  return Notification.permission as PermissionState;
}

const OPTIONS: { value: AlertMode; label: string; icon: typeof Volume2 }[] = [
  { value: "sound", label: "صوت", icon: Volume2 },
  { value: "vibrate", label: "اهتزاز", icon: Vibrate },
  { value: "silent", label: "بدون", icon: BellOff },
];

const STATUS_META: Record<
  NotifAttempt["status"],
  { label: string; icon: typeof CheckCircle2; classes: string }
> = {
  success: {
    label: "نجح",
    icon: CheckCircle2,
    classes: "bg-primary/15 text-primary border-primary/30",
  },
  denied: {
    label: "مرفوض",
    icon: XCircle,
    classes: "bg-destructive/15 text-destructive border-destructive/30",
  },
  dismissed: {
    label: "أُغلق دون منح الإذن",
    icon: AlertCircle,
    classes: "bg-muted text-muted-foreground border-border",
  },
  unsupported: {
    label: "غير مدعوم",
    icon: AlertCircle,
    classes: "bg-muted text-muted-foreground border-border",
  },
  error: {
    label: "فشل",
    icon: XCircle,
    classes: "bg-destructive/15 text-destructive border-destructive/30",
  },
};

// Human-readable label for the structured block reason.
const REASON_LABEL: Record<NotifBlockReason, string> = {
  insecure_context: "اتصال غير آمن (HTTPS مطلوب)",
  iframe: "معاينة داخل إطار (iframe)",
  no_service_worker: "Service Worker غير مسجَّل",
  api_missing: "API الإشعارات غير متاح في هذا المتصفح",
  permission_denied: "إذن المتصفح مرفوض",
  user_dismissed: "تم إغلاق نافذة الطلب دون منح الإذن",
  delivery_failed: "تعذّر عرض الإشعار بعد منح الإذن",
  server_error: "فشل من جهة الخادم",
  other: "سبب غير مصنَّف",
};

function formatRelative(ts: number): string {
  const diff = Math.max(0, Date.now() - ts);
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return "قبل لحظات";
  const min = Math.floor(sec / 60);
  if (min < 60) return `قبل ${min} د`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `قبل ${hr} س`;
  const day = Math.floor(hr / 24);
  return `قبل ${day} يوم`;
}

function LastAttemptCard({ attempt }: { attempt: NotifAttempt | null }) {
  // Re-render the relative time every 30s while panel is open.
  const [, force] = useState(0);
  useEffect(() => {
    if (!attempt) return;
    const id = setInterval(() => force((n) => n + 1), 30_000);
    return () => clearInterval(id);
  }, [attempt]);

  if (!attempt) {
    return (
      <div className="rounded-md border border-border/60 bg-background/60 p-2.5">
        <div className="flex items-center gap-1.5 text-[11px] font-medium text-foreground">
          <Clock className="w-3 h-3 text-muted-foreground" />
          آخر محاولة إرسال
        </div>
        <p className="text-[10px] text-muted-foreground mt-1">
          لا توجد محاولات بعد. أرسل إشعاراً تجريبياً لمعرفة الحالة.
        </p>
      </div>
    );
  }

  const meta = STATUS_META[attempt.status];
  const Icon = meta.icon;
  const exact = new Date(attempt.at).toLocaleString("ar", {
    hour: "2-digit",
    minute: "2-digit",
    day: "2-digit",
    month: "2-digit",
  });

  return (
    <div className="rounded-md border border-border/60 bg-background/60 p-2.5 space-y-1.5">
      <div className="flex items-center gap-1.5 text-[11px] font-medium text-foreground">
        <Clock className="w-3 h-3 text-muted-foreground" />
        آخر محاولة إرسال
        <span className="ms-auto text-[9px] text-muted-foreground">
          {attempt.source === "server" ? "خادم" : "متصفح"}
        </span>
      </div>
      <div
        className={`flex items-center gap-1.5 rounded-md border px-2 py-1 text-[10px] ${meta.classes}`}
      >
        <Icon className="w-3 h-3 shrink-0" />
        <span className="font-medium">{meta.label}</span>
        <span className="ms-auto opacity-80 tabular-nums" title={exact}>
          {formatRelative(attempt.at)}
        </span>
      </div>
      {attempt.reason && (
        <div className="flex items-start gap-1.5 rounded-md bg-secondary/40 border border-border/40 px-2 py-1">
          <span className="text-[9px] font-semibold text-foreground shrink-0 mt-0.5">
            السبب:
          </span>
          <span className="text-[10px] text-muted-foreground leading-relaxed">
            {REASON_LABEL[attempt.reason] ?? attempt.reason}
          </span>
        </div>
      )}
      {attempt.message && (
        <p
          className="text-[10px] text-muted-foreground leading-relaxed line-clamp-2"
          title={attempt.message}
        >
          {attempt.message}
        </p>
      )}
    </div>
  );
}

export default function NotificationPrefsPanel({ isAdmin = false }: { isAdmin?: boolean }) {
  const [mode, setMode] = useState<AlertMode>(() => getAlertMode());
  const [volume, setVolumeState] = useState<number>(() => getVolume());
  const [open, setOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const { user, loading: authLoading } = useAuth();
  const location = useLocation();
  const [permission, setPermission] = useState<PermissionState>(() => getPermission());
  const [enabling, setEnabling] = useState(false);
  const [lastAttempt, setLastAttempt] = useState<NotifAttempt | null>(() => getLastNotifAttempt());
  const [devMode, setDevModeState] = useState<DevContextMode>(() => getDevContextMode());
  const [ctxIssue, setCtxIssue] = useState<string | null>(() => getPermissionContextIssue());

  // Re-evaluate context issue whenever the dev override changes (or the component mounts).
  useEffect(() => {
    const sync = () => {
      setDevModeState(getDevContextMode());
      setCtxIssue(getPermissionContextIssue());
    };
    window.addEventListener("notif-dev-context-changed", sync);
    return () => window.removeEventListener("notif-dev-context-changed", sync);
  }, []);

  const cycleDevMode = () => {
    const next: DevContextMode =
      devMode === "real" ? "insecure" : devMode === "insecure" ? "iframe" : "real";
    setDevContextMode(next);
    setDevModeState(next);
    setCtxIssue(getPermissionContextIssue());
    if (next === "real") toast.success("تم استرجاع السياق الحقيقي");
    else
      toast.message(`محاكاة سياق: ${next === "insecure" ? "غير آمن (HTTP)" : "iframe"}`, {
        description: "سيتم منع طلب الإذن أثناء تفعيل المحاكاة.",
      });
  };

  const isPublicRoute = PUBLIC_BLOCKED_PREFIXES.some((p) => location.pathname.startsWith(p));
  const isAuthenticated = !authLoading && !!user;
  const canPrompt = isAuthenticated && !isPublicRoute;

  // Keep permission state fresh if the user grants/revokes from browser settings.
  useEffect(() => {
    if (permission === "unsupported") return;
    const sync = () => setPermission(getPermission());
    let permStatus: PermissionStatus | null = null;
    if ("permissions" in navigator) {
      navigator.permissions
        .query({ name: "notifications" as PermissionName })
        .then((status) => {
          permStatus = status;
          status.onchange = sync;
        })
        .catch(() => {});
    }
    window.addEventListener("focus", sync);
    return () => {
      if (permStatus) permStatus.onchange = null;
      window.removeEventListener("focus", sync);
    };
  }, [permission]);

  // Stay in sync with attempts recorded from the banner / other tabs.
  useEffect(() => {
    const onLocal = (e: Event) => {
      const detail = (e as CustomEvent<NotifAttempt>).detail;
      if (detail) setLastAttempt(detail);
    };
    const onStorage = (e: StorageEvent) => {
      if (e.key === "notif_last_attempt") setLastAttempt(getLastNotifAttempt());
    };
    window.addEventListener(NOTIF_ATTEMPT_EVENT, onLocal as EventListener);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(NOTIF_ATTEMPT_EVENT, onLocal as EventListener);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  const handleEnable = async () => {
    // Hard guards mirror the banner — never call requestPermission outside an authenticated private context.
    if (authLoading) return;
    if (!isAuthenticated) {
      toast.error("سجّل الدخول أولاً لتفعيل الإشعارات");
      return;
    }
    if (isPublicRoute) {
      toast.message("لا يمكن تفعيل الإشعارات من هذه الصفحة", {
        description: "انتقل إلى لوحة التحكم أو الملف الشخصي ثم حاول مجدداً.",
      });
      return;
    }
    if (permission === "unsupported") return;
    const ctxIssue = getPermissionContextIssue();
    if (ctxIssue) {
      showContextBlockedToast(ctxIssue);
      return;
    }
    setEnabling(true);
    try {
      const result = (await Notification.requestPermission()) as PermissionState;
      setPermission(result);
      if (result === "granted") toast.success("تم تفعيل الإشعارات ✅");
      else if (result === "denied") toast.error("تم رفض الإذن — فعّله من إعدادات المتصفح");
    } catch {
      toast.error("تعذّر طلب الإذن");
    } finally {
      setEnabling(false);
    }
  };

  const sendTest = async () => {
    setSending(true);
    try {
      const { error } = await supabase.functions.invoke("send-test-visa-notification", {
        body: { countryCode: "IT" },
      });
      if (error) throw error;
      toast.success("تم إرسال الإشعار التجريبي ✅");
      recordNotifAttempt({ status: "success", at: Date.now(), source: "server" });
    } catch (e: any) {
      toast.error("فشل إرسال الإشعار", { description: e?.message });
      recordNotifAttempt({
        status: "error",
        at: Date.now(),
        source: "server",
        message: e?.message ?? "server error",
        reason: "server_error",
      });
    } finally {
      setSending(false);
    }
  };

  const handleMode = (m: AlertMode) => {
    setMode(m);
    setAlertMode(m);
  };

  const handleVolume = (vals: number[]) => {
    const v = (vals[0] ?? 60) / 100;
    setVolumeState(v);
    setVolume(v);
  };

  return (
    <div className="border-b border-border/50">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-4 py-2 text-[11px] text-muted-foreground hover:bg-secondary/50 transition-colors"
      >
        <span className="flex items-center gap-1.5">
          <Settings2 className="w-3 h-3" />
          إعدادات التنبيه
        </span>
        <span className="opacity-60">{open ? "▲" : "▼"}</span>
      </button>
      {open && (
        <div className="px-4 py-3 space-y-3 bg-secondary/20">
          {/* Last attempt status — helps users diagnose if a test actually went through */}
          <LastAttemptCard attempt={lastAttempt} />

          {/* Context diagnosis — explains why permission requests would be blocked */}
          {(ctxIssue || devMode !== "real" || import.meta.env.DEV) && (
            <div
              className={`rounded-md border p-2.5 space-y-2 ${
                ctxIssue
                  ? "border-destructive/30 bg-destructive/5"
                  : "border-border/60 bg-background/60"
              }`}
            >
              <div className="flex items-center gap-1.5 text-[11px] font-medium text-foreground">
                <ShieldAlert
                  className={`w-3 h-3 ${ctxIssue ? "text-destructive" : "text-muted-foreground"}`}
                />
                سياق الإذن
                <span
                  className={`ms-auto text-[9px] px-1.5 py-0.5 rounded-full ${
                    devMode === "real"
                      ? "bg-muted text-muted-foreground"
                      : "bg-amber-500/15 text-amber-600 dark:text-amber-400"
                  }`}
                >
                  {devMode === "real"
                    ? "حقيقي"
                    : devMode === "insecure"
                    ? "محاكاة: HTTP"
                    : "محاكاة: iframe"}
                </span>
              </div>
              <p
                className={`text-[10px] leading-relaxed ${
                  ctxIssue ? "text-destructive/90" : "text-muted-foreground"
                }`}
              >
                {ctxIssue ?? "السياق الحالي يسمح بطلب إذن الإشعارات."}
              </p>
              {import.meta.env.DEV && (
                <button
                  type="button"
                  onClick={cycleDevMode}
                  className="w-full py-1.5 rounded-md bg-background hover:bg-secondary text-[10px] text-foreground border border-border transition-colors flex items-center justify-center gap-1.5"
                  title="تبديل وضع محاكاة السياق (DEV فقط)"
                >
                  <FlaskConical className="w-3 h-3" />
                  تبديل وضع المحاكاة (
                  {devMode === "real"
                    ? "→ HTTP"
                    : devMode === "insecure"
                    ? "→ iframe"
                    : "→ حقيقي"}
                  )
                </button>
              )}
            </div>
          )}

          {/* Manual enable section — only meaningful when permission isn't already granted */}
          {permission !== "granted" && permission !== "unsupported" && (
            <div className="rounded-md border border-border/60 bg-background/60 p-2.5 space-y-1.5">
              <div className="flex items-center gap-1.5 text-[11px] font-medium text-foreground">
                <Bell className="w-3 h-3 text-primary" />
                إشعارات المتصفح
                <span
                  className={`ms-auto text-[9px] px-1.5 py-0.5 rounded-full ${
                    permission === "denied"
                      ? "bg-destructive/15 text-destructive"
                      : "bg-muted text-muted-foreground"
                  }`}
                >
                  {permission === "denied" ? "مرفوض" : "غير مفعّل"}
                </span>
              </div>
              {!isAuthenticated ? (
                <p className="flex items-start gap-1 text-[10px] text-muted-foreground leading-relaxed">
                  <Lock className="w-3 h-3 mt-0.5 shrink-0" />
                  سجّل الدخول لتفعيل الإشعارات.
                </p>
              ) : isPublicRoute ? (
                <p className="flex items-start gap-1 text-[10px] text-destructive/80 leading-relaxed">
                  <Lock className="w-3 h-3 mt-0.5 shrink-0" />
                  لا يمكن تفعيل الإشعارات من هذه الصفحة. انتقل إلى لوحة التحكم.
                </p>
              ) : (
                <p className="text-[10px] text-muted-foreground leading-relaxed">
                  فعّل الإشعارات لتصلك تنبيهات فتح المواعيد فوراً.
                </p>
              )}
              <button
                type="button"
                onClick={handleEnable}
                disabled={!canPrompt || enabling || permission === "denied"}
                className="w-full py-1.5 rounded-md bg-primary text-primary-foreground text-[11px] font-medium transition-colors flex items-center justify-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-primary/90"
              >
                {enabling ? <Loader2 className="w-3 h-3 animate-spin" /> : <Bell className="w-3 h-3" />}
                {permission === "denied" ? "مرفوض — افتح إعدادات المتصفح" : "تفعيل إشعارات المتصفح"}
              </button>
            </div>
          )}
          <div>
            <p className="text-[10px] text-muted-foreground mb-1.5">نوع التنبيه</p>
            <div className="grid grid-cols-3 gap-1">
              {OPTIONS.map(({ value, label, icon: Icon }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => handleMode(value)}
                  className={`flex flex-col items-center gap-1 py-2 rounded-md text-[10px] transition-colors ${
                    mode === value
                      ? "bg-primary text-primary-foreground"
                      : "bg-background hover:bg-secondary text-muted-foreground"
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  <span>{label}</span>
                </button>
              ))}
            </div>
          </div>
          {mode === "sound" && (
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <p className="text-[10px] text-muted-foreground">مستوى الصوت</p>
                <span className="text-[10px] text-muted-foreground tabular-nums">
                  {Math.round(volume * 100)}%
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Slider
                  value={[Math.round(volume * 100)]}
                  onValueChange={handleVolume}
                  min={0}
                  max={100}
                  step={5}
                  className="flex-1"
                />
                <button
                  type="button"
                  onClick={() => triggerAlert(mode, volume)}
                  className="p-1.5 rounded-md bg-background hover:bg-secondary text-muted-foreground transition-colors"
                  aria-label="تجربة"
                >
                  <Play className="w-3 h-3" />
                </button>
              </div>
            </div>
          )}
          {mode === "vibrate" && (
            <button
              type="button"
              onClick={() => triggerAlert(mode, volume)}
              className="w-full py-1.5 rounded-md bg-background hover:bg-secondary text-[10px] text-muted-foreground transition-colors flex items-center justify-center gap-1.5"
            >
              <Play className="w-3 h-3" />
              تجربة الاهتزاز
            </button>
          )}
          {isAdmin && (
            <button
              type="button"
              onClick={sendTest}
              disabled={sending}
              className="w-full py-2 rounded-md bg-primary/10 hover:bg-primary/20 text-primary text-[11px] font-medium transition-colors flex items-center justify-center gap-1.5 disabled:opacity-50"
            >
              {sending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
              إرسال إشعار تجريبي
            </button>
          )}
        </div>
      )}
    </div>
  );
}