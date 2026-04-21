import { useEffect, useState } from "react";
import { Bell, BellOff, X, ExternalLink } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

const DISMISSED_KEY = "notif_perm_banner_dismissed";
const PROMPTED_KEY = "notif_perm_prompted";

type PermissionState = "default" | "granted" | "denied" | "unsupported";

function getPermission(): PermissionState {
  if (typeof window === "undefined" || !("Notification" in window)) return "unsupported";
  return Notification.permission as PermissionState;
}

export default function NotificationPermissionBanner() {
  const { user } = useAuth();
  const [permission, setPermission] = useState<PermissionState>(() => getPermission());
  const [dismissed, setDismissed] = useState<boolean>(() => {
    try {
      return localStorage.getItem(DISMISSED_KEY) === "true";
    } catch {
      return false;
    }
  });
  const [showHelp, setShowHelp] = useState(false);

  // Auto-prompt once per browser when user is logged in and status is "default"
  useEffect(() => {
    if (!user) return;
    if (permission !== "default") return;
    let prompted = false;
    try {
      prompted = localStorage.getItem(PROMPTED_KEY) === "true";
    } catch {}
    if (prompted) return;

    const t = setTimeout(async () => {
      try {
        localStorage.setItem(PROMPTED_KEY, "true");
        const result = await Notification.requestPermission();
        setPermission(result as PermissionState);
        if (result === "granted") {
          toast.success("تم تفعيل إشعارات المتصفح ✅");
        }
      } catch {}
    }, 1500);
    return () => clearTimeout(t);
  }, [user, permission]);

  const handleEnable = async () => {
    try {
      const result = await Notification.requestPermission();
      setPermission(result as PermissionState);
      if (result === "granted") {
        toast.success("تم تفعيل الإشعارات بنجاح ✅");
      } else if (result === "denied") {
        setShowHelp(true);
      }
    } catch {
      setShowHelp(true);
    }
  };

  const handleDismiss = () => {
    setDismissed(true);
    try {
      localStorage.setItem(DISMISSED_KEY, "true");
    } catch {}
  };

  if (!user) return null;
  if (permission === "granted" || permission === "unsupported") return null;
  if (dismissed && permission !== "denied") return null;

  const isDenied = permission === "denied";

  return (
    <>
      <div
        className={`fixed bottom-4 left-1/2 -translate-x-1/2 z-50 w-[92%] max-w-md rounded-xl border shadow-lg backdrop-blur-md ${
          isDenied
            ? "bg-destructive/10 border-destructive/30"
            : "bg-background/95 border-border"
        }`}
        role="dialog"
        aria-live="polite"
      >
        <div className="flex items-start gap-3 p-3 pr-2">
          <div
            className={`shrink-0 w-9 h-9 rounded-full flex items-center justify-center ${
              isDenied ? "bg-destructive/20 text-destructive" : "bg-primary/15 text-primary"
            }`}
          >
            {isDenied ? <BellOff className="w-4 h-4" /> : <Bell className="w-4 h-4" />}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-foreground">
              {isDenied ? "إشعارات المتصفح معطّلة" : "فعّل إشعارات المتصفح"}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
              {isDenied
                ? "لن تصلك تنبيهات فتح مواعيد التأشيرة. يجب تفعيلها يدوياً من إعدادات المتصفح."
                : "اسمح بالإشعارات حتى تصلك تنبيهات فتح مواعيد التأشيرة فوراً."}
            </p>
            <div className="flex items-center gap-2 mt-2">
              {isDenied ? (
                <button
                  type="button"
                  onClick={() => setShowHelp(true)}
                  className="inline-flex items-center gap-1 text-xs px-3 py-1.5 rounded-md bg-destructive text-destructive-foreground hover:bg-destructive/90 transition-colors"
                >
                  <ExternalLink className="w-3 h-3" />
                  كيف أفعّل الإشعارات؟
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleEnable}
                  className="text-xs px-3 py-1.5 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
                >
                  تفعيل الآن
                </button>
              )}
              <button
                type="button"
                onClick={handleDismiss}
                className="text-xs px-2 py-1.5 rounded-md text-muted-foreground hover:text-foreground transition-colors"
              >
                لاحقاً
              </button>
            </div>
          </div>
          <button
            type="button"
            onClick={handleDismiss}
            className="shrink-0 p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
            aria-label="إغلاق"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {showHelp && (
        <div
          className="fixed inset-0 z-[60] bg-background/80 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setShowHelp(false)}
        >
          <div
            className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-md p-5 animate-in fade-in zoom-in-95"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between mb-3">
              <h3 className="text-base font-bold text-foreground flex items-center gap-2">
                <BellOff className="w-5 h-5 text-destructive" />
                تفعيل الإشعارات يدوياً
              </h3>
              <button
                type="button"
                onClick={() => setShowHelp(false)}
                className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                aria-label="إغلاق"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-sm text-muted-foreground mb-4 leading-relaxed">
              تم رفض إذن الإشعارات سابقاً. لإعادة تفعيلها، اتبع الخطوات التالية حسب متصفحك:
            </p>
            <div className="space-y-3">
              <div className="bg-secondary/50 rounded-lg p-3">
                <p className="text-xs font-semibold text-foreground mb-1.5">🌐 Chrome / Edge / Brave</p>
                <ol className="text-xs text-muted-foreground space-y-0.5 list-decimal pr-4">
                  <li>اضغط على أيقونة القفل 🔒 بجانب رابط الموقع</li>
                  <li>اختر "إعدادات الموقع" (Site settings)</li>
                  <li>غيّر "الإشعارات" إلى "السماح" (Allow)</li>
                  <li>أعد تحميل الصفحة</li>
                </ol>
              </div>
              <div className="bg-secondary/50 rounded-lg p-3">
                <p className="text-xs font-semibold text-foreground mb-1.5">🦊 Firefox</p>
                <ol className="text-xs text-muted-foreground space-y-0.5 list-decimal pr-4">
                  <li>اضغط على القفل 🔒 ثم على السهم بجانب الموقع</li>
                  <li>اختر "مزيد من المعلومات" → "أذونات"</li>
                  <li>أزل الإعداد بجانب "إرسال إشعارات"</li>
                  <li>أعد تحميل الصفحة وامنح الإذن</li>
                </ol>
              </div>
              <div className="bg-secondary/50 rounded-lg p-3">
                <p className="text-xs font-semibold text-foreground mb-1.5">🧭 Safari (iOS / Mac)</p>
                <ol className="text-xs text-muted-foreground space-y-0.5 list-decimal pr-4">
                  <li>افتح الإعدادات → Safari → الإشعارات</li>
                  <li>ابحث عن هذا الموقع وفعّل "السماح"</li>
                </ol>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setShowHelp(false)}
              className="w-full mt-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
            >
              فهمت
            </button>
          </div>
        </div>
      )}
    </>
  );
}