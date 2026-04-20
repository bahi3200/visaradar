import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { ReceiptThumbnail } from "./receipt/ReceiptThumbnail";
import { ReceiptLightbox } from "./receipt/ReceiptLightbox";
import { extractStoragePath } from "@/lib/receiptStorage";

export function ReceiptImage({ receiptUrl }: { receiptUrl: string }) {
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [lightboxOpen, setLightboxOpen] = useState(false);
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
      const { data, error: signErr } = await supabase.storage
        .from("receipts")
        .createSignedUrl(path, 3600);
      if (cancelled) return;
      if (signErr || !data?.signedUrl) {
        setError(signErr?.message || "تعذر تحميل الصورة");
        setLoading(false);
        return;
      }
      setSignedUrl(data.signedUrl);
      setLoading(false);
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [receiptUrl]);

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
      <div className="flex items-center justify-center h-40 rounded-xl border border-border/50 bg-muted/30">
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !signedUrl) {
    return (
      <div className="flex items-center gap-2 h-40 px-4 rounded-xl border border-destructive/30 bg-destructive/5 text-destructive text-sm">
        <AlertCircle className="w-4 h-4 shrink-0" />
        <span>{error || "لا يمكن عرض الوصل"}</span>
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
