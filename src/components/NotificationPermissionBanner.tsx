import { useEffect, useMemo, useState } from "react";
import { Bell, BellOff, X, ExternalLink, Copy, Check } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

const DISMISSED_KEY = "notif_perm_banner_dismissed";
const PROMPTED_KEY = "notif_perm_prompted";

type PermissionState = "default" | "granted" | "denied" | "unsupported";
type BrowserKey =
  | "chrome"
  | "edge"
  | "brave"
  | "firefox"
  | "safari-ios"
  | "safari-mac"
  | "samsung"
  | "opera"
  | "other";

function getPermission(): PermissionState {
  if (typeof window === "undefined" || !("Notification" in window)) return "unsupported";
  return Notification.permission as PermissionState;
}

function detectBrowser(): BrowserKey {
  if (typeof navigator === "undefined") return "other";
  const ua = navigator.userAgent;
  const isIOS =
    /iPad|iPhone|iPod/.test(ua) ||
    (navigator.platform === "MacIntel" && (navigator as { maxTouchPoints?: number }).maxTouchPoints! > 1);
  if (isIOS) return "safari-ios";
  if (/Edg\//.test(ua)) return "edge";
  if (/SamsungBrowser/.test(ua)) return "samsung";
  if (/OPR\/|Opera/.test(ua)) return "opera";
  if (/Firefox\//.test(ua)) return "firefox";
  if (/Chrome\//.test(ua)) return "chrome";
  if (/Safari\//.test(ua) && /Macintosh/.test(ua)) return "safari-mac";
  return "other";
}

const BROWSER_LABEL: Record<BrowserKey, string> = {
  chrome: "🌐 Google Chrome",
  edge: "🔷 Microsoft Edge",
  brave: "🦁 Brave",
  firefox: "🦊 Firefox",
  "safari-ios": "📱 Safari (iOS / iPadOS)",
  "safari-mac": "🧭 Safari (macOS)",
  samsung: "📱 Samsung Internet",
  opera: "🎭 Opera",
  other: "🌍 متصفح آخر",
};

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
  const detected = useMemo(detectBrowser, []);
  const [activeTab, setActiveTab] = useState<BrowserKey>(detected);
  const [copied, setCopied] = useState(false);

  const origin = typeof window !== "undefined" ? window.location.origin : "";

  const copyOrigin = async () => {
    try {
      await navigator.clipboard.writeText(origin);
      setCopied(true);
      toast.success("تم نسخ رابط الموقع");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("تعذّر النسخ");
    }
  };

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
            <p className="text-sm text-muted-foreground mb-3 leading-relaxed">
              تم رفض إذن الإشعارات سابقاً. اختر متصفحك لرؤية الخطوات الدقيقة:
            </p>

            {/* Browser tabs */}
            <div className="flex flex-wrap gap-1.5 mb-3 border-b border-border pb-2">
              {(Object.keys(BROWSER_LABEL) as BrowserKey[]).map((key) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setActiveTab(key)}
                  className={`text-[11px] px-2 py-1 rounded-md transition-colors ${
                    activeTab === key
                      ? "bg-primary text-primary-foreground"
                      : "bg-secondary/60 text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {BROWSER_LABEL[key].split(" ").slice(1).join(" ") || BROWSER_LABEL[key]}
                  {key === detected && <span className="mr-1">•</span>}
                </button>
              ))}
            </div>

            {/* Origin copy helper */}
            <div className="flex items-center gap-2 mb-3 bg-secondary/40 rounded-lg p-2">
              <code className="flex-1 text-[11px] text-foreground truncate" dir="ltr">
                {origin}
              </code>
              <button
                type="button"
                onClick={copyOrigin}
                className="shrink-0 inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded-md bg-background border border-border hover:bg-secondary transition-colors"
              >
                {copied ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
                {copied ? "تم" : "نسخ الرابط"}
              </button>
            </div>

            <BrowserInstructions browser={activeTab} origin={origin} />

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