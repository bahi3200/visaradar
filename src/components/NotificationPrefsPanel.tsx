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
  getLastNotifAttempt,
  recordNotifAttempt,
  NOTIF_ATTEMPT_EVENT,
} from "@/lib/notificationPrefs";

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

export default function NotificationPrefsPanel({ isAdmin = false }: { isAdmin?: boolean }) {
  const [mode, setMode] = useState<AlertMode>(() => getAlertMode());
  const [volume, setVolumeState] = useState<number>(() => getVolume());
  const [open, setOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const { user, loading: authLoading } = useAuth();
  const location = useLocation();
  const [permission, setPermission] = useState<PermissionState>(() => getPermission());
  const [enabling, setEnabling] = useState(false);

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
    } catch (e: any) {
      toast.error("فشل إرسال الإشعار", { description: e?.message });
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