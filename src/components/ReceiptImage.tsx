import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { ReceiptThumbnail } from "./receipt/ReceiptThumbnail";
import { ReceiptLightbox } from "./receipt/ReceiptLightbox";
import { extractStoragePath } from "@/lib/receiptStorage";

const MAX_SIGN_RETRIES = 3;
const RETRY_BASE_DELAY_MS = 800;

export function ReceiptImage({ receiptUrl }: { receiptUrl: string }) {
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [retryNonce, setRetryNonce] = useState(0);
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
          setLoading(false);
        }
        return;
      }

      let lastErr: string | null = null;
      for (let i = 0; i < MAX_SIGN_RETRIES; i++) {
        if (cancelled) return;
        setAttempt(i + 1);
        const { data, error: signErr } = await supabase.storage
          .from("receipts")
          .createSignedUrl(path, 3600);
        if (cancelled) return;
        if (!signErr && data?.signedUrl) {
          setSignedUrl(data.signedUrl);
          setLoading(false);
          return;
        }
        lastErr = signErr?.message || "تعذر تحميل الصورة";
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
    setRetryNonce((n) => n + 1);
  };

  const handleDownload = async () => {
    if (!signedUrl) return;
    setDownloading(true);
    try {
      const res = await fetch(signedUrl);
      if (!res.ok) throw new Error("Network error");
      const blob = await res.blob();
      const path = extractStoragePath(receiptUrl);
      const filename = path ? path.split("/").pop() || "receipt.jpg" : "receipt.jpg";
      const objUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = objUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(objUrl);
      toast.success("تم تنزيل الوصل");
    } catch (e) {
      toast.error("فشل تنزيل الوصل");
    } finally {
      setDownloading(false);
    }
  };

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
        signedUrl={signedUrl}
        downloading={downloading}
        onOpen={() => setLightboxOpen(true)}
        onDownload={handleDownload}
      />
      <ReceiptLightbox
        open={lightboxOpen}
        onOpenChange={setLightboxOpen}
        signedUrl={signedUrl}
        downloading={downloading}
        onDownload={handleDownload}
      />
    </>
  );
}
