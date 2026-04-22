import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, AlertCircle, RefreshCw, WifiOff, Clock, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { ReceiptThumbnail } from "./receipt/ReceiptThumbnail";
import { ReceiptLightbox } from "./receipt/ReceiptLightbox";
import { extractStoragePath, getReceiptFileKind, getReceiptFilename } from "@/lib/receiptStorage";

const MAX_SIGN_RETRIES = 3;
const RETRY_BASE_DELAY_MS = 800;
const THUMB_WIDTH = 400; // px — server-side resize via Storage transform
const FULL_SIGN_TIMEOUT_MS = 10000;
const THUMB_TIMEOUT_MS = 6000; // Don't let a hanging transform request block the full URL
const TOTAL_LOAD_BUDGET_MS = 25000; // Hard cap so the UI never hangs longer than this

type ErrorKind = "timeout" | "network" | "auth" | "notfound" | "unknown";

interface ClassifiedError {
  kind: ErrorKind;
  message: string;
  hint: string;
}

const classifyError = (raw: string | null | undefined): ClassifiedError => {
  const msg = (raw || "").toLowerCase();
  if (!raw) {
    return {
      kind: "unknown",
      message: "تعذر تحميل الوصل",
      hint: "حدث خطأ غير متوقع. حاول مرة أخرى.",
    };
  }
  if (msg.includes("timeout") || msg.includes("مهلة") || msg.includes("timed out")) {
    return {
      kind: "timeout",
      message: "انتهت مهلة الاتصال",
      hint: "الخادم يستغرق وقتًا أطول من المعتاد. تحقق من الإنترنت ثم أعد المحاولة.",
    };
  }
  if (
    msg.includes("network") ||
    msg.includes("fetch") ||
    msg.includes("failed to fetch") ||
    msg.includes("offline")
  ) {
    return {
      kind: "network",
      message: "تعذّر الاتصال بالخادم",
      hint: "تحقق من اتصال الإنترنت وأعد المحاولة.",
    };
  }
  if (
    msg.includes("not found") ||
    msg.includes("404") ||
    msg.includes("does not exist") ||
    msg.includes("no such")
  ) {
    return {
      kind: "notfound",
      message: "الوصل غير موجود",
      hint: "قد يكون الملف قد حُذف أو نُقل. اطلب من المستخدم رفع وصل جديد.",
    };
  }
  if (
    msg.includes("unauthorized") ||
    msg.includes("forbidden") ||
    msg.includes("permission") ||
    msg.includes("401") ||
    msg.includes("403")
  ) {
    return {
      kind: "auth",
      message: "ليست لديك صلاحية الوصول",
      hint: "أعد تسجيل الدخول للتأكد من صلاحياتك.",
    };
  }
  return {
    kind: "unknown",
    message: raw,
    hint: "حدث خطأ غير متوقع. حاول مرة أخرى.",
  };
};

const ErrorIcon = ({ kind }: { kind: ErrorKind }) => {
  switch (kind) {
    case "timeout":
      return <Clock className="w-5 h-5 shrink-0" />;
    case "network":
      return <WifiOff className="w-5 h-5 shrink-0" />;
    case "auth":
      return <ShieldAlert className="w-5 h-5 shrink-0" />;
    case "notfound":
    case "unknown":
    default:
      return <AlertCircle className="w-5 h-5 shrink-0" />;
  }
};

// Session-level kill switch: if Storage transform fails (e.g., plan limits,
// unsupported format, server config), skip thumbnail requests for the rest
// of the session to avoid wasted round-trips.
let transformDisabled = false;

const isTransformError = (err: unknown): boolean => {
  if (!err || typeof err !== "object") return false;
  const msg = (err as { message?: string }).message?.toLowerCase() ?? "";
  return (
    msg.includes("transform") ||
    msg.includes("image processing") ||
    msg.includes("unsupported") ||
    msg.includes("not enabled") ||
    msg.includes("not allowed")
  );
};

export function ReceiptImage({ receiptUrl }: { receiptUrl: string }) {
  const fileKind = getReceiptFileKind(receiptUrl);
  const filename = getReceiptFilename(receiptUrl);
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [thumbUrl, setThumbUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [errorKind, setErrorKind] = useState<ErrorKind>("unknown");
  const [downloading, setDownloading] = useState(false);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [retryNonce, setRetryNonce] = useState(0);
  const [transformBlocked, setTransformBlocked] = useState(transformDisabled);
  const [elapsedMs, setElapsedMs] = useState(0);
  const thumbnailRef = useRef<HTMLButtonElement | null>(null);
  const hasFocusedRef = useRef(false);

  useEffect(() => {
    if (signedUrl && !loading && !hasFocusedRef.current) {
      thumbnailRef.current?.focus({ preventScroll: true });
      hasFocusedRef.current = true;
    }
  }, [signedUrl, loading]);

  useEffect(() => {
    let cancelled = false;
    const startedAt = Date.now();
    // Lightweight ticker so the user sees that progress is being made and
    // knows roughly how long they've been waiting. 500ms keeps it smooth
    // without thrashing React.
    const ticker = window.setInterval(() => {
      if (!cancelled) setElapsedMs(Date.now() - startedAt);
    }, 500);
    // Hard cap: if the entire load goes past the budget, abort with a
    // clear timeout error instead of letting the spinner spin forever.
    const budgetTimer = window.setTimeout(() => {
      if (cancelled) return;
      cancelled = true;
      setError("انتهت المهلة الإجمالية لتحميل الوصل");
      setErrorKind("timeout");
      setLoading(false);
    }, TOTAL_LOAD_BUDGET_MS);
    const sleep = (ms: number) =>
      new Promise<void>((resolve) => setTimeout(resolve, ms));

    const load = async () => {
      // Reset all derived state at the start of every load so a retry
      // never inherits stale error/attempt/url from the previous run.
      setLoading(true);
      setError(null);
      setErrorKind("unknown");
      setAttempt(0);
      setElapsedMs(0);
      let succeeded = false;
      try {
        const path = extractStoragePath(receiptUrl);
        if (!path) {
          if (!cancelled) {
            setSignedUrl(receiptUrl);
            setThumbUrl(receiptUrl);
            succeeded = true;
          }
          return;
        }

        let lastErr: string | null = null;
        for (let i = 0; i < MAX_SIGN_RETRIES; i++) {
        if (cancelled) return;
        setAttempt(i + 1);
        // Request the full signed URL on its own — never let the optional
        // thumbnail transform request block or fail the primary URL.
        // Pass an explicit empty options object because some Storage client
        // builds read `options.transform` without guarding undefined.
        const fullReq = supabase.storage
          .from("receipts")
          .createSignedUrl(path, 3600, {});
        const fullTimeout = new Promise<{ data: null; error: { message: string } }>((resolve) =>
          setTimeout(
            () => resolve({ data: null, error: { message: "انتهت مهلة تحميل الوصل" } }),
            FULL_SIGN_TIMEOUT_MS,
          ),
        );
        const fullRes = await Promise.race([fullReq, fullTimeout]).catch((err) => ({
          data: null,
          error: {
            message:
              err instanceof Error
                ? err.message
                : "تعذر إنشاء رابط آمن للوصول",
          },
        }));
        if (cancelled) return;
        if (!fullRes.error && fullRes.data?.signedUrl) {
          setSignedUrl(fullRes.data.signedUrl);
          setThumbUrl(fullRes.data.signedUrl); // optimistic fallback
          succeeded = true;
          // Fire-and-forget thumbnail request with a hard timeout so a
          // hanging transform endpoint never re-blocks the UI.
          if (fileKind === "image" && !transformDisabled) {
            const thumbReq = supabase.storage
              .from("receipts")
              .createSignedUrl(path, 3600, {
                transform: { width: THUMB_WIDTH, resize: "contain", quality: 75 },
              });
            const timeout = new Promise<{ data: null; error: { message: string } }>((resolve) =>
              setTimeout(
                () => resolve({ data: null, error: { message: "thumb timeout" } }),
                THUMB_TIMEOUT_MS,
              ),
            );
            Promise.race([thumbReq, timeout])
              .then((thumbRes) => {
                if (cancelled) return;
                if (thumbRes.error) {
                  if (isTransformError(thumbRes.error)) {
                    transformDisabled = true;
                    setTransformBlocked(true);
                    console.warn(
                      "[ReceiptImage] Storage image transform disabled for session:",
                      thumbRes.error.message,
                    );
                  }
                  return;
                }
                if (thumbRes.data?.signedUrl) setThumbUrl(thumbRes.data.signedUrl);
              })
              .catch(() => {
                /* swallow — thumb is optional */
              });
          }
          return;
        }
        lastErr = fullRes.error?.message || "تعذر تحميل الصورة";
        if (i < MAX_SIGN_RETRIES - 1) {
          await sleep(RETRY_BASE_DELAY_MS * Math.pow(2, i));
        }
        }
        if (!cancelled) {
          const classified = classifyError(lastErr);
          setError(classified.message);
          setErrorKind(classified.kind);
        }
      } catch (err) {
        // Last-resort guard: any unexpected throw must still surface an
        // error UI instead of an infinite spinner.
        if (!cancelled) {
          console.error("[ReceiptImage] Unexpected load failure:", err);
          const classified = classifyError(
            err instanceof Error ? err.message : "حدث خطأ غير متوقع أثناء تحميل الوصل",
          );
          setError(classified.message);
          setErrorKind(classified.kind);
        }
      } finally {
        // Guarantee the spinner clears on every exit path: success,
        // handled error, timeout, thrown exception. Skip only when the
        // effect was cancelled (component unmounted / deps changed) so we
        // don't touch state on a stale render.
        if (!cancelled) {
          setLoading(false);
          // Reset attempt counter on terminal success so future retries
          // start clean; keep it on failure so the user sees how many
          // tries we made before giving up.
          if (succeeded) setAttempt(0);
        }
      }
    };
    load();
    return () => {
      cancelled = true;
      window.clearInterval(ticker);
      window.clearTimeout(budgetTimer);
    };
  }, [receiptUrl, retryNonce, fileKind]);

  const handleRetry = () => {
    hasFocusedRef.current = false;
    // Re-enable Storage transform attempt on explicit user retry — the
    // previous failure may have been a transient transform glitch (e.g.
    // right after a fresh upload) rather than a permanent plan limit.
    transformDisabled = false;
    setTransformBlocked(false);
    setSignedUrl(null);
    setThumbUrl(null);
    setError(null);
    setErrorKind("unknown");
    setRetryNonce((n) => n + 1);
  };

  const handleDownload = async (variant: "full" | "thumb" = "full") => {
    const url =
      variant === "thumb" && thumbUrl && thumbUrl !== signedUrl
        ? thumbUrl
        : signedUrl;
    if (!url) return;
    setDownloading(true);
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error("Network error");
      const blob = await res.blob();
      const path = extractStoragePath(receiptUrl);
      const baseName = path ? path.split("/").pop() || filename : filename;
      const downloadName =
        variant === "thumb"
          ? baseName.replace(/(\.[^.]+)?$/, (ext) => `_thumb${ext || ".jpg"}`)
          : baseName;
      const objUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = objUrl;
      a.download = downloadName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(objUrl);
      toast.success(
        variant === "thumb" ? "تم تنزيل النسخة المصغّرة" : "تم تنزيل الوصل",
      );
    } catch (e) {
      toast.error("فشل تنزيل الوصل");
    } finally {
      setDownloading(false);
    }
  };

  const thumbDownloadAvailable = Boolean(fileKind === "image" && thumbUrl && thumbUrl !== signedUrl);

  if (loading) {
    const seconds = Math.floor(elapsedMs / 1000);
    const budgetSeconds = Math.floor(TOTAL_LOAD_BUDGET_MS / 1000);
    const progress = Math.min(100, Math.round((elapsedMs / TOTAL_LOAD_BUDGET_MS) * 100));
    const slow = seconds >= 6;
    return (
      <div
        className="flex flex-col items-center justify-center gap-3 h-40 px-4 rounded-xl border border-border/50 bg-muted/30"
        role="status"
        aria-live="polite"
        aria-busy="true"
      >
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
        <div className="flex flex-col items-center gap-1 text-center">
          <span className="text-xs font-medium text-muted-foreground">
            جاري تحميل الوصل…
          </span>
          {attempt > 1 && (
            <span className="text-[11px] text-muted-foreground/80">
              إعادة محاولة تلقائية {attempt} من {MAX_SIGN_RETRIES}
            </span>
          )}
          {slow && (
            <span className="text-[11px] text-amber-600 dark:text-amber-400">
              التحميل أبطأ من المعتاد ({seconds}s / {budgetSeconds}s)
            </span>
          )}
        </div>
        <div className="w-32 h-1 rounded-full bg-border overflow-hidden">
          <div
            className="h-full bg-primary transition-[width] duration-500 ease-out"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>
    );
  }

  if (error || !signedUrl) {
    const classified = classifyError(error);
    const kind = error ? errorKind : classified.kind;
    const message = error || classified.message;
    const hint = classified.hint;
    return (
      <div
        className="flex flex-col items-center justify-center gap-2 min-h-40 px-4 py-4 rounded-xl border border-destructive/30 bg-destructive/5 text-destructive text-sm text-center"
        role="alert"
      >
        <div className="flex items-center gap-2 font-medium">
          <ErrorIcon kind={kind} />
          <span>{message}</span>
        </div>
        <p className="text-xs text-destructive/80 max-w-xs leading-relaxed">{hint}</p>
        {attempt > 1 && (
          <span className="text-[11px] text-destructive/70">
            تمت {attempt} محاولات تلقائية قبل التوقف
          </span>
        )}
        <button
          type="button"
          onClick={handleRetry}
          className="mt-1 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium bg-destructive/10 hover:bg-destructive/20 border border-destructive/30 transition-colors"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          إعادة المحاولة
        </button>
      </div>
    );
  }

  return (
    <>
      <ReceiptThumbnail
        ref={thumbnailRef}
        signedUrl={thumbUrl || signedUrl}
        fallbackUrl={signedUrl}
        downloading={downloading}
        onOpen={() => setLightboxOpen(true)}
        onDownload={() => handleDownload("full")}
        onDownloadThumb={thumbDownloadAvailable ? () => handleDownload("thumb") : undefined}
        fullSizeNotice={fileKind === "image" && transformBlocked}
        onRetry={handleRetry}
        fileKind={fileKind}
        filename={filename}
      />
      <ReceiptLightbox
        open={lightboxOpen}
        onOpenChange={setLightboxOpen}
        signedUrl={signedUrl}
        thumbUrl={thumbUrl || undefined}
        downloading={downloading}
        onDownload={() => handleDownload("full")}
        fileKind={fileKind}
      />
    </>
  );
}
