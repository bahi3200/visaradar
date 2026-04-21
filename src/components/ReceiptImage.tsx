import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { ReceiptThumbnail } from "./receipt/ReceiptThumbnail";
import { ReceiptLightbox } from "./receipt/ReceiptLightbox";
import { extractStoragePath } from "@/lib/receiptStorage";

const MAX_SIGN_RETRIES = 3;
const RETRY_BASE_DELAY_MS = 800;
const THUMB_WIDTH = 400; // px — server-side resize via Storage transform

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
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [thumbUrl, setThumbUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [retryNonce, setRetryNonce] = useState(0);
  const [transformBlocked, setTransformBlocked] = useState(transformDisabled);
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
    const sleep = (ms: number) =>
      new Promise<void>((resolve) => setTimeout(resolve, ms));

    const load = async () => {
      setLoading(true);
      setError(null);
      const path = extractStoragePath(receiptUrl);
      if (!path) {
        if (!cancelled) {
          setSignedUrl(receiptUrl);
          setThumbUrl(receiptUrl);
          setLoading(false);
        }
        return;
      }

      let lastErr: string | null = null;
      for (let i = 0; i < MAX_SIGN_RETRIES; i++) {
        if (cancelled) return;
        setAttempt(i + 1);
        const fullPromise = supabase.storage
          .from("receipts")
          .createSignedUrl(path, 3600);
        const thumbPromise = transformDisabled
          ? Promise.resolve({ data: null, error: null } as unknown as Awaited<typeof fullPromise>)
          : supabase.storage.from("receipts").createSignedUrl(path, 3600, {
              transform: { width: THUMB_WIDTH, resize: "contain", quality: 75 },
            });
        const [fullRes, thumbRes] = await Promise.all([fullPromise, thumbPromise]);
        if (cancelled) return;
        // Detect transform-specific failure once and disable for the session
        if (!transformDisabled && thumbRes.error && isTransformError(thumbRes.error)) {
          transformDisabled = true;
          console.warn(
            "[ReceiptImage] Storage image transform disabled for session:",
            thumbRes.error.message,
          );
          setTransformBlocked(true);
        }
        if (!fullRes.error && fullRes.data?.signedUrl) {
          setSignedUrl(fullRes.data.signedUrl);
          // Fallback to full URL if transform fails (e.g. non-image or unsupported format)
          setThumbUrl(thumbRes.data?.signedUrl || fullRes.data.signedUrl);
          setLoading(false);
          return;
        }
        lastErr = fullRes.error?.message || "تعذر تحميل الصورة";
        if (i < MAX_SIGN_RETRIES - 1) {
          await sleep(RETRY_BASE_DELAY_MS * Math.pow(2, i));
        }
      }
      if (!cancelled) {
        setError(lastErr || "تعذر تحميل الصورة");
        setLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [receiptUrl, retryNonce]);

  const handleRetry = () => {
    hasFocusedRef.current = false;
    setSignedUrl(null);
    setThumbUrl(null);
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
      const baseName = path ? path.split("/").pop() || "receipt.jpg" : "receipt.jpg";
      const filename =
        variant === "thumb"
          ? baseName.replace(/(\.[^.]+)?$/, (ext) => `_thumb${ext || ".jpg"}`)
          : baseName;
      const objUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = objUrl;
      a.download = filename;
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

  const thumbDownloadAvailable = Boolean(thumbUrl && thumbUrl !== signedUrl);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 h-40 rounded-xl border border-border/50 bg-muted/30">
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
        {attempt > 1 && (
          <span className="text-xs text-muted-foreground">
            محاولة {attempt} من {MAX_SIGN_RETRIES}…
          </span>
        )}
      </div>
    );
  }

  if (error || !signedUrl) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 h-40 px-4 rounded-xl border border-destructive/30 bg-destructive/5 text-destructive text-sm text-center">
        <div className="flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error || "لا يمكن عرض الوصل"}</span>
        </div>
        <button
          type="button"
          onClick={handleRetry}
          className="px-3 py-1 rounded-md text-xs bg-destructive/10 hover:bg-destructive/20 border border-destructive/30 transition-colors"
        >
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
        downloading={downloading}
        onOpen={() => setLightboxOpen(true)}
        onDownload={() => handleDownload("full")}
        onDownloadThumb={thumbDownloadAvailable ? () => handleDownload("thumb") : undefined}
        fullSizeNotice={transformBlocked}
      />
      <ReceiptLightbox
        open={lightboxOpen}
        onOpenChange={setLightboxOpen}
        signedUrl={signedUrl}
        thumbUrl={thumbUrl || undefined}
        downloading={downloading}
        onDownload={() => handleDownload("full")}
      />
    </>
  );
}
