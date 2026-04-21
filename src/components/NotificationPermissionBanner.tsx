import { useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import { Bell, BellOff, BellRing, X, ExternalLink, Copy, Check, Send } from "lucide-react";
import { triggerAlert, getAlertMode, getVolume } from "@/lib/notificationPrefs";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

// Routes where we MUST NEVER prompt for notification permission, even if a session exists.
// These are public/auth flows where prompting would be intrusive or premature.
const PUBLIC_BLOCKED_PREFIXES = [
  "/auth/",
  "/reset-password",
  "/privacy",
  "/terms",
  "/install",
  "/help",
];

// Storage key conventions:
// - Per-user keys are namespaced: `${BASE}::${userId}` so different accounts on the same browser
//   keep separate snooze/prompt history.
// - A legacy global key is migrated into the current user's namespace on first read.
const LEGACY_DISMISSED_KEY = "notif_perm_banner_dismissed";
const LEGACY_SNOOZE_KEY = "notif_perm_snooze_until";
const LEGACY_PROMPTED_KEY = "notif_perm_prompted";

const SNOOZE_BASE = "notif_perm_snooze_until";
const PROMPTED_BASE = "notif_perm_prompted";
// Anonymous (logged-out) users get their own bucket so a guest dismiss doesn't follow them after login.
const ANON_BUCKET = "anon";
const SNOOZE_DAYS = 7;

// Session-scoped flag to suppress re-showing during the current tab session
// (e.g. user navigates between public ↔ private pages and we already hid this once).
const SESSION_HIDE_KEY = "notif_perm_session_hidden";

function snoozeKey(userId: string | null) {
  return `${SNOOZE_BASE}::${userId ?? ANON_BUCKET}`;
}
function promptedKey(userId: string | null) {
  return `${PROMPTED_BASE}::${userId ?? ANON_BUCKET}`;
}

function readSnoozeUntil(userId: string | null): number {
  try {
    const key = snoozeKey(userId);

    // Migrate legacy global keys → current user's namespaced key (one-time).
    const legacyDismissed = localStorage.getItem(LEGACY_DISMISSED_KEY);
    const legacySnooze = localStorage.getItem(LEGACY_SNOOZE_KEY);
    if (legacyDismissed === "true" || legacySnooze) {
      const fromLegacy =
        legacySnooze && Number.isFinite(Number(legacySnooze))
          ? Number(legacySnooze)
          : Date.now() + SNOOZE_DAYS * 24 * 60 * 60 * 1000;
      // Only seed the user's key if it doesn't already exist — never overwrite a fresher decision.
      if (!localStorage.getItem(key)) {
        localStorage.setItem(key, String(fromLegacy));
      }
      localStorage.removeItem(LEGACY_DISMISSED_KEY);
      localStorage.removeItem(LEGACY_SNOOZE_KEY);
    }
    // Same migration for the prompted flag, so we don't re-auto-prompt a returning user.
    const legacyPrompted = localStorage.getItem(LEGACY_PROMPTED_KEY);
    if (legacyPrompted === "true") {
      const pKey = promptedKey(userId);
      if (!localStorage.getItem(pKey)) localStorage.setItem(pKey, "true");
      localStorage.removeItem(LEGACY_PROMPTED_KEY);
    }

    const raw = localStorage.getItem(key);
    if (!raw) return 0;
    const n = Number(raw);
    return Number.isFinite(n) ? n : 0;
  } catch {
    return 0;
  }
}

function writeSnoozeUntil(userId: string | null, ts: number) {
  try {
    const key = snoozeKey(userId);
    if (ts > 0) localStorage.setItem(key, String(ts));
    else localStorage.removeItem(key);
  } catch {}
}

function readSessionHidden(): boolean {
  try {
    return sessionStorage.getItem(SESSION_HIDE_KEY) === "true";
  } catch {
    return false;
  }
}
function writeSessionHidden(v: boolean) {
  try {
    if (v) sessionStorage.setItem(SESSION_HIDE_KEY, "true");
    else sessionStorage.removeItem(SESSION_HIDE_KEY);
  } catch {}
}

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

// Fast-path deep links to the right settings page per browser.
// `null` means the browser blocks programmatic navigation to settings (Safari, in-app webviews) —
// we fall back to opening the longer help modal in that case.
function getBrowserSettingsUrl(browser: BrowserKey): string | null {
  switch (browser) {
    case "chrome":
    case "brave":
      return "chrome://settings/content/notifications";
    case "edge":
      return "edge://settings/content/notifications";
    case "opera":
      return "opera://settings/content/notifications";
    case "firefox":
      return "about:preferences#privacy";
    case "samsung":
      return "internet://settings/site_permissions";
    // Safari (iOS & macOS) and unknown browsers can't be deep-linked.
    default:
      return null;
  }
}

// Three short steps shown inline in the denied banner — keeps users in flow
// instead of forcing them through the full troubleshooting modal.
function getQuickDeniedSteps(browser: BrowserKey): string[] {
  switch (browser) {
    case "chrome":
    case "brave":
    case "edge":
    case "opera":
      return [
        "اضغط على أيقونة 🔒 بجانب رابط الموقع",
        "اختر «الإشعارات» ← «السماح»",
        "أعد تحميل الصفحة",
      ];
    case "firefox":
      return [
        "اضغط على 🔒 بجانب الرابط",
        "أزل الحظر بجانب «إرسال الإشعارات»",
        "أعد تحميل الصفحة",
      ];
    case "safari-mac":
      return [
        "Safari ← الإعدادات ← مواقع الويب",
        "اختر «الإشعارات» وفعّل هذا الموقع",
        "أعد تحميل الصفحة",
      ];
    case "safari-ios":
      return [
        "أضِف الموقع إلى الشاشة الرئيسية أولاً",
        "الإعدادات ← الإشعارات ← اسم التطبيق",
        "فعّل «السماح بالإشعارات»",
      ];
    case "samsung":
      return [
        "اضغط ⋮ ← الإعدادات ← المواقع والتنزيلات",
        "اختر «أذونات الموقع» ← الإشعارات",
        "اسمح لهذا الموقع",
      ];
    default:
      return [
        "افتح إعدادات أذونات المتصفح",
        "ابحث عن أذونات الموقع ← الإشعارات",
        "اسمح بالإشعارات لهذا الموقع",
      ];
  }
}

export default function NotificationPermissionBanner() {
  const { user, loading: authLoading } = useAuth();
  const location = useLocation();
  const userId = user?.id ?? null;
  const [permission, setPermission] = useState<PermissionState>(() => getPermission());
  const [snoozeUntil, setSnoozeUntil] = useState<number>(() => readSnoozeUntil(userId));
  const [sessionHidden, setSessionHidden] = useState<boolean>(() => readSessionHidden());

  // When the user identity changes (login/logout), reload the per-user snooze state
  // so the previous user's "لاحقاً" decision doesn't bleed into the next session.
  useEffect(() => {
    setSnoozeUntil(readSnoozeUntil(userId));
  }, [userId]);

  // Re-evaluate snooze expiry every minute so the banner reappears automatically.
  useEffect(() => {
    if (snoozeUntil <= 0) return;
    const tick = () => {
      if (Date.now() >= snoozeUntil) setSnoozeUntil(0);
    };
    const id = setInterval(tick, 60_000);
    return () => clearInterval(id);
  }, [snoozeUntil]);

  const isSnoozed = snoozeUntil > Date.now();
  const [showHelp, setShowHelp] = useState(false);
  const [justGranted, setJustGranted] = useState(false);
  const [sendingTest, setSendingTest] = useState(false);
  const detected = useMemo(detectBrowser, []);
  const [activeTab, setActiveTab] = useState<BrowserKey>(detected);
  const [copied, setCopied] = useState(false);

  // Block any prompting on public/auth routes — even if a stale session exists.
  const isPublicRoute = PUBLIC_BLOCKED_PREFIXES.some((p) => location.pathname.startsWith(p));
  // Authenticated only after auth has finished loading AND user is present.
  const isAuthenticated = !authLoading && !!user;
  const canPrompt = isAuthenticated && !isPublicRoute;

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

  // Auto-prompt once per browser, ONLY when authenticated AND not on a public route.
  useEffect(() => {
    if (!canPrompt) return;
    if (permission !== "default") return;
    let prompted = false;
    try {
      prompted = localStorage.getItem(promptedKey(userId)) === "true";
    } catch {}
    if (prompted) return;

    const t = setTimeout(async () => {
      // Re-check just before firing — route or auth may have changed during the delay.
      if (!canPrompt) return;
      try {
        localStorage.setItem(promptedKey(userId), "true");
        const result = await Notification.requestPermission();
        setPermission(result as PermissionState);
        if (result === "granted") {
          toast.success("تم تفعيل إشعارات المتصفح ✅");
        }
      } catch {}
    }, 1500);
    return () => clearTimeout(t);
  }, [canPrompt, permission]);

  const handleEnable = async () => {
    // Hard guard — never request permission outside an authenticated context.
    if (!canPrompt) {
      toast.error("سجّل الدخول أولاً لتفعيل الإشعارات");
      return;
    }
    try {
      const result = await Notification.requestPermission();
      setPermission(result as PermissionState);
      if (result === "granted") {
        toast.success("تم تفعيل الإشعارات بنجاح ✅");
        setJustGranted(true);
      } else if (result === "denied") {
        setShowHelp(true);
      }
    } catch {
      setShowHelp(true);
    }
  };

  const sendTestNotification = async () => {
    // Pre-flight: confirm the API exists at all (older browsers / some in-app webviews).
    if (typeof window === "undefined" || !("Notification" in window)) {
      toast.error("متصفحك لا يدعم إشعارات الويب. جرّب Chrome / Edge / Firefox أو أضِف التطبيق إلى الشاشة الرئيسية.");
      return;
    }

    // If permission hasn't been decided yet, request it from inside this user gesture
    // (browsers require a direct user activation — calling it from the button is the right place).
    let perm: NotificationPermission = Notification.permission;
    if (perm === "default") {
      try {
        // Some older Safari versions only support the callback form; handle both.
        const reqResult = Notification.requestPermission();
        perm = (reqResult instanceof Promise
          ? await reqResult
          : await new Promise<NotificationPermission>((resolve) =>
              Notification.requestPermission((r) => resolve(r))
            )) as NotificationPermission;
        setPermission(perm as PermissionState);
        if (perm === "granted") {
          toast.success("تم تفعيل الإشعارات ✅");
          setJustGranted(true);
        }
      } catch (reqErr) {
        console.warn("[notif] requestPermission failed", reqErr);
        toast.error("تعذّر طلب إذن الإشعارات. افتح إعدادات الموقع وفعّلها يدوياً.");
        return;
      }
    }

    if (perm === "denied") {
      setPermission("denied");
      setShowHelp(true);
      toast.error("الإشعارات محظورة. اتبع الخطوات لتفعيلها من إعدادات المتصفح.");
      return;
    }

    if (perm !== "granted") {
      // User dismissed the prompt without granting.
      toast.message("لم يتم منح الإذن بعد", {
        description: "اضغط الزر مرة أخرى واختر «السماح» في نافذة المتصفح.",
      });
      return;
    }

    setSendingTest(true);
    try {
      const title = "🔔 إشعار تجريبي";
      const options: NotificationOptions = {
        body: "إذا رأيت هذه الرسالة، فإن إشعارات المتصفح تعمل بشكل صحيح ✅",
        icon: "/icon-192.png",
        badge: "/icon-192.png",
        tag: "test-notification",
      };

      let delivered = false;
      // 1) Prefer the ServiceWorker route — required on Android Chrome and
      //    PWA contexts where `new Notification()` throws "Illegal constructor".
      if ("serviceWorker" in navigator) {
        try {
          const reg = await navigator.serviceWorker.getRegistration();
          if (reg && typeof reg.showNotification === "function") {
            await reg.showNotification(title, options);
            delivered = true;
          }
        } catch (swErr) {
          console.warn("[notif] SW showNotification failed", swErr);
        }
      }

      // 2) Fallback to the constructor on desktop browsers where it's allowed.
      if (!delivered) {
        try {
          const notif = new Notification(title, options);
          notif.onclick = () => {
            window.focus();
            notif.close();
          };
          setTimeout(() => notif.close(), 6000);
          delivered = true;
        } catch (ctorErr) {
          console.warn("[notif] Notification constructor failed", ctorErr);
        }
      }

      // 3) Local sound/vibration fallback so the user always gets feedback.
      try {
        triggerAlert(getAlertMode(), getVolume());
      } catch {}

      if (delivered) {
        toast.success("تم إرسال إشعار تجريبي ✅");
      } else {
        toast.error(
          "تعذّر عرض إشعار المتصفح — تأكد من السماح بالإشعارات من إعدادات المتصفح، أو جرّب من جهاز الكمبيوتر."
        );
      }
    } catch (e) {
      console.error("[notif] sendTestNotification error", e);
      toast.error(
        e instanceof Error && e.message
          ? `فشل الإرسال: ${e.message}`
          : "فشل إرسال الإشعار التجريبي"
      );
    } finally {
      setSendingTest(false);
    }
  };

  const handleDismiss = () => {
    // If the user is just closing the success banner after granting, don't snooze.
    if (justGranted || permission === "granted") {
      setJustGranted(false);
      // Mark this tab session as hidden so we don't pop it again on the next route change.
      writeSessionHidden(true);
      setSessionHidden(true);
      return;
    }
    const until = Date.now() + SNOOZE_DAYS * 24 * 60 * 60 * 1000;
    setSnoozeUntil(until);
    writeSnoozeUntil(userId, until);
    // Also flag this tab session so the banner doesn't briefly reappear during cross-route navigation
    // before the localStorage read settles on slower devices.
    writeSessionHidden(true);
    setSessionHidden(true);
    toast.message(`سنذكّرك بعد ${SNOOZE_DAYS} أيام`, {
      description: "يمكنك دائماً تفعيل الإشعارات من إعدادات حسابك.",
      duration: 4000,
    });
  };

  // Hide banner entirely on public routes or before auth resolves.
  if (!isAuthenticated || isPublicRoute) return null;
  if (permission === "unsupported") return null;
  // Keep visible after granting so the user can test, otherwise hide when granted.
  if (permission === "granted" && !justGranted) return null;
  // "denied" always shows (it's important info); other states respect snooze + session-hide.
  if ((isSnoozed || sessionHidden) && permission !== "denied" && !justGranted) return null;

  const isDenied = permission === "denied";
  const isGranted = permission === "granted";

  return (
    <>
      <div
        className={`fixed bottom-4 left-1/2 -translate-x-1/2 z-50 w-[92%] max-w-md rounded-xl border shadow-lg backdrop-blur-md ${
          isDenied
            ? "bg-destructive/10 border-destructive/30"
            : isGranted
            ? "bg-primary/10 border-primary/30"
            : "bg-background/95 border-border"
        }`}
        role="dialog"
        aria-live="polite"
      >
        <div className="flex items-start gap-3 p-3 pr-2">
          <div
            className={`shrink-0 w-9 h-9 rounded-full flex items-center justify-center ${
              isDenied
                ? "bg-destructive/20 text-destructive"
                : isGranted
                ? "bg-primary/20 text-primary"
                : "bg-primary/15 text-primary"
            }`}
          >
            {isDenied ? (
              <BellOff className="w-4 h-4" />
            ) : isGranted ? (
              <BellRing className="w-4 h-4" />
            ) : (
              <Bell className="w-4 h-4" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-foreground">
              {isDenied
                ? "الإشعارات محظورة في هذا المتصفح"
                : isGranted
                ? "تم تفعيل الإشعارات ✅"
                : "فعّل إشعارات المتصفح"}
            </p>
            {isDenied ? (
              <ol className="text-xs text-muted-foreground mt-1 leading-relaxed list-decimal pr-4 space-y-0.5">
                {getQuickDeniedSteps(detected).map((step, i) => (
                  <li key={i}>{step}</li>
                ))}
              </ol>
            ) : (
              <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                {isGranted
                  ? "أرسل إشعاراً تجريبياً للتأكد أن كل شيء يعمل."
                  : "اسمح بالإشعارات حتى تصلك تنبيهات فتح مواعيد التأشيرة فوراً."}
              </p>
            )}
            <div className="flex items-center gap-2 mt-2">
              {isDenied ? (
                (() => {
                  const settingsUrl = getBrowserSettingsUrl(detected);
                  const onOpenSettings = () => {
                    if (!settingsUrl) {
                      // Browser doesn't allow programmatic settings deep-link → fall back to help modal.
                      setShowHelp(true);
                      return;
                    }
                    try {
                      // Most browsers block scripted navigation to chrome://, edge://, etc.,
                      // so we copy it to clipboard as well and instruct the user.
                      navigator.clipboard?.writeText(settingsUrl).catch(() => {});
                      window.open(settingsUrl, "_blank", "noopener,noreferrer");
                      toast.message("افتح الرابط في شريط العنوان", {
                        description: "بعض المتصفحات تمنع فتح صفحة الإعدادات تلقائياً — تم نسخ الرابط.",
                        duration: 5000,
                      });
                    } catch {
                      setShowHelp(true);
                    }
                  };
                  return (
                    <>
                      <button
                        type="button"
                        onClick={onOpenSettings}
                        className="inline-flex items-center gap-1 text-xs px-3 py-1.5 rounded-md bg-destructive text-destructive-foreground hover:bg-destructive/90 transition-colors"
                      >
                        <ExternalLink className="w-3 h-3" />
                        فتح إعدادات المتصفح
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowHelp(true)}
                        className="text-xs px-2 py-1.5 rounded-md text-muted-foreground hover:text-foreground transition-colors"
                      >
                        مزيد من المساعدة
                      </button>
                    </>
                  );
                })()
              ) : isGranted ? (
                <button
                  type="button"
                  onClick={sendTestNotification}
                  disabled={sendingTest}
                  className="inline-flex items-center gap-1 text-xs px-3 py-1.5 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-60 transition-colors"
                >
                  <Send className="w-3 h-3" />
                  {sendingTest ? "جارٍ الإرسال..." : "إرسال إشعار تجريبي"}
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
              {!isDenied && (
                <button
                  type="button"
                  onClick={handleDismiss}
                  className="text-xs px-2 py-1.5 rounded-md text-muted-foreground hover:text-foreground transition-colors"
                >
                  {isGranted ? "إغلاق" : "لاحقاً"}
                </button>
              )}
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
                {copied ? <Check className="w-3 h-3 text-primary" /> : <Copy className="w-3 h-3" />}
                {copied ? "تم" : "نسخ الرابط"}
              </button>
            </div>

            <BrowserInstructions browser={activeTab} origin={origin} />

            {/* Test notification button — only enabled if permission is granted */}
            <button
              type="button"
              onClick={sendTestNotification}
              disabled={sendingTest || permission !== "granted"}
              className="w-full mt-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors inline-flex items-center justify-center gap-2"
              title={permission !== "granted" ? "فعّل الإشعارات أولاً" : "اختبار"}
            >
              <Send className="w-4 h-4" />
              {sendingTest ? "جارٍ الإرسال..." : "إرسال إشعار تجريبي"}
            </button>
            {permission !== "granted" && (
              <p className="text-[10px] text-muted-foreground text-center mt-1.5">
                يجب تفعيل الإذن من إعدادات المتصفح أولاً ليصبح الزر فعّالاً
              </p>
            )}

            <button
              type="button"
              onClick={() => setShowHelp(false)}
              className="w-full mt-2 py-2 rounded-lg bg-secondary text-foreground text-sm font-medium hover:bg-secondary/80 transition-colors"
            >
              فهمت
            </button>
          </div>
        </div>
      )}
    </>
  );
}

type StepLink = { label: string; url: string; note?: string };

function Step({ children }: { children: React.ReactNode }) {
  return <li className="text-xs text-muted-foreground leading-relaxed">{children}</li>;
}

function LinkRow({ links }: { links: StepLink[] }) {
  if (!links.length) return null;
  return (
    <div className="mt-2 flex flex-col gap-1.5">
      {links.map((l) => (
        <div key={l.url} className="flex items-center gap-2">
          <code className="flex-1 text-[10px] text-foreground bg-background rounded px-2 py-1 truncate" dir="ltr">
            {l.url}
          </code>
          <button
            type="button"
            onClick={() => {
              navigator.clipboard.writeText(l.url).then(() => toast.success("تم نسخ الرابط"));
            }}
            className="shrink-0 inline-flex items-center gap-1 text-[10px] px-2 py-1 rounded-md bg-secondary hover:bg-secondary/70 transition-colors"
          >
            <Copy className="w-3 h-3" />
            نسخ
          </button>
        </div>
      ))}
    </div>
  );
}

function BrowserInstructions({ browser, origin }: { browser: BrowserKey; origin: string }) {
  const encoded = encodeURIComponent(origin);

  switch (browser) {
    case "chrome":
      return (
        <div className="bg-secondary/40 rounded-lg p-3 space-y-2">
          <p className="text-xs font-semibold text-foreground">خطوات Google Chrome</p>
          <ol className="space-y-1 list-decimal pr-4">
            <Step>افتح الرابط التالي في تبويب جديد للوصول مباشرة لإعدادات الإشعارات للموقع:</Step>
          </ol>
          <LinkRow links={[
            { label: "إعدادات إشعارات الموقع", url: `chrome://settings/content/siteDetails?site=${encoded}` },
            { label: "كل أذونات الإشعارات", url: "chrome://settings/content/notifications" },
          ]} />
          <ol className="space-y-1 list-decimal pr-4 mt-2" start={2}>
            <Step>غيّر "Notifications" إلى <b>Allow</b>.</Step>
            <Step>أعد تحميل الصفحة (Ctrl+R أو Cmd+R).</Step>
          </ol>
          <p className="text-[10px] text-muted-foreground/70 mt-1">
            ملاحظة: روابط <code>chrome://</code> لا تفتح بالنقر — انسخها والصقها في شريط العنوان.
          </p>
        </div>
      );

    case "edge":
      return (
        <div className="bg-secondary/40 rounded-lg p-3 space-y-2">
          <p className="text-xs font-semibold text-foreground">خطوات Microsoft Edge</p>
          <ol className="space-y-1 list-decimal pr-4">
            <Step>افتح أحد الروابط التالية في تبويب جديد (انسخه إلى شريط العنوان):</Step>
          </ol>
          <LinkRow links={[
            { label: "إعدادات الموقع مباشرة", url: `edge://settings/content/siteDetails?site=${encoded}` },
            { label: "كل أذونات الإشعارات", url: "edge://settings/content/notifications" },
          ]} />
          <ol className="space-y-1 list-decimal pr-4 mt-2" start={2}>
            <Step>ابحث عن هذا الموقع في قائمة "Block" واضغط على القائمة (⋯) → <b>Allow</b>.</Step>
            <Step>أو اضغط على أيقونة القفل 🔒 بجانب الرابط → "Permissions for this site" → فعّل <b>Notifications</b>.</Step>
            <Step>أعد تحميل الصفحة.</Step>
          </ol>
          <p className="text-[10px] text-muted-foreground/70">
            في Edge على Windows تأكد أيضاً من تفعيل الإشعارات على مستوى النظام:
            <br />
            Settings → System → Notifications → Microsoft Edge → On.
          </p>
        </div>
      );

    case "brave":
      return (
        <div className="bg-secondary/40 rounded-lg p-3 space-y-2">
          <p className="text-xs font-semibold text-foreground">خطوات Brave</p>
          <ol className="space-y-1 list-decimal pr-4">
            <Step>افتح: <code dir="ltr">brave://settings/content/notifications</code></Step>
            <Step>أزل الموقع من قائمة "Block" أو أضفه إلى "Allow".</Step>
            <Step>تأكد أن Brave Shields لا يحجب الإشعارات (الأيقونة 🦁 بجانب الرابط → Off).</Step>
            <Step>أعد تحميل الصفحة.</Step>
          </ol>
          <LinkRow links={[
            { label: "إعدادات إشعارات Brave", url: "brave://settings/content/notifications" },
          ]} />
        </div>
      );

    case "firefox":
      return (
        <div className="bg-secondary/40 rounded-lg p-3 space-y-2">
          <p className="text-xs font-semibold text-foreground">خطوات Firefox</p>
          <ol className="space-y-1 list-decimal pr-4">
            <Step>افتح: <code dir="ltr">about:preferences#privacy</code> ثم انزل إلى "Permissions" → "Notifications" → "Settings…".</Step>
            <Step>ابحث عن الموقع وغيّر الحالة من "Block" إلى <b>Allow</b>، ثم احفظ.</Step>
            <Step>أو اضغط القفل 🔒 → السهم بجانب الموقع → Clear permission ثم أعد تحميل الصفحة.</Step>
          </ol>
          <LinkRow links={[
            { label: "إعدادات الخصوصية", url: "about:preferences#privacy" },
          ]} />
        </div>
      );

    case "safari-ios":
      return (
        <div className="bg-secondary/40 rounded-lg p-3 space-y-2">
          <p className="text-xs font-semibold text-foreground">خطوات Safari على iOS / iPadOS</p>
          <p className="text-[11px] text-muted-foreground bg-background/60 rounded p-2">
            ⚠️ لاستقبال إشعارات حقيقية على iPhone/iPad يجب أولاً <b>تثبيت الموقع كتطبيق على الشاشة الرئيسية</b> (Add to Home Screen)، لأن Safari لا يدعم Web Push من المتصفح مباشرة.
          </p>
          <ol className="space-y-1 list-decimal pr-4">
            <Step>افتح الموقع في Safari ثم اضغط زر المشاركة <b>⎙</b> أسفل الشاشة.</Step>
            <Step>اختر <b>"Add to Home Screen" / "إضافة إلى الشاشة الرئيسية"</b>.</Step>
            <Step>افتح التطبيق من الشاشة الرئيسية، وعند ظهور طلب الإشعارات اختر <b>السماح</b>.</Step>
            <Step>إذا رفضتها سابقاً: اذهب إلى <b>الإعدادات → الإشعارات</b> ثم ابحث عن هذا التطبيق وفعّل "السماح بالإشعارات".</Step>
            <Step>تأكد من تعطيل "وضع التركيز / Focus" و"عدم الإزعاج".</Step>
          </ol>
          <p className="text-[10px] text-muted-foreground/70">
            مطلوب iOS 16.4 أو أحدث لدعم إشعارات Web Push.
          </p>
        </div>
      );

    case "safari-mac":
      return (
        <div className="bg-secondary/40 rounded-lg p-3 space-y-2">
          <p className="text-xs font-semibold text-foreground">خطوات Safari على macOS</p>
          <ol className="space-y-1 list-decimal pr-4">
            <Step>من شريط القوائم: <b>Safari → Settings (⌘,) → Websites → Notifications</b>.</Step>
            <Step>ابحث عن هذا الموقع وغيّر الحالة من "Deny" إلى <b>Allow</b>.</Step>
            <Step>تأكد من تعطيل "Do Not Disturb" من Control Center.</Step>
            <Step>افتح <b>System Settings → Notifications → Safari</b> وفعّل "Allow Notifications".</Step>
            <Step>أعد تحميل الصفحة.</Step>
          </ol>
        </div>
      );

    case "samsung":
      return (
        <div className="bg-secondary/40 rounded-lg p-3 space-y-2">
          <p className="text-xs font-semibold text-foreground">خطوات Samsung Internet</p>
          <ol className="space-y-1 list-decimal pr-4">
            <Step>اضغط على القائمة (☰) → <b>Settings</b> → <b>Sites and downloads</b> → <b>Site permissions</b> → <b>Notifications</b>.</Step>
            <Step>ابحث عن الموقع في قائمة "Blocked" واحذفه.</Step>
            <Step>أعد تحميل الصفحة وامنح الإذن عند الطلب.</Step>
          </ol>
        </div>
      );

    case "opera":
      return (
        <div className="bg-secondary/40 rounded-lg p-3 space-y-2">
          <p className="text-xs font-semibold text-foreground">خطوات Opera</p>
          <ol className="space-y-1 list-decimal pr-4">
            <Step>افتح: <code dir="ltr">opera://settings/content/notifications</code></Step>
            <Step>أزل الموقع من "Block" وأضفه إلى "Allow".</Step>
            <Step>أعد تحميل الصفحة.</Step>
          </ol>
          <LinkRow links={[
            { label: "إعدادات إشعارات Opera", url: "opera://settings/content/notifications" },
          ]} />
        </div>
      );

    default:
      return (
        <div className="bg-secondary/40 rounded-lg p-3 space-y-2">
          <p className="text-xs font-semibold text-foreground">خطوات عامة</p>
          <ol className="space-y-1 list-decimal pr-4">
            <Step>اضغط على أيقونة القفل 🔒 بجانب رابط الموقع.</Step>
            <Step>ابحث عن "Notifications" وغيّر الحالة إلى Allow.</Step>
            <Step>أعد تحميل الصفحة.</Step>
          </ol>
        </div>
      );
  }
}