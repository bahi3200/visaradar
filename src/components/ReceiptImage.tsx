import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, AlertCircle, Download } from "lucide-react";
import { toast } from "sonner";

const extractStoragePath = (receiptUrl: string): string | null => {
  if (!receiptUrl) return null;
  if (receiptUrl.startsWith("receipts/")) {
    return receiptUrl.replace(/^receipts\//, "");
  }
  // Match both public and signed URLs
  const match = receiptUrl.match(/\/object\/(?:public\/|sign\/)?receipts\/(.+?)(?:\?|$)/);
  if (match) return decodeURIComponent(match[1]);
  return null;
};

export function ReceiptImage({ receiptUrl }: { receiptUrl: string }) {
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError(null);
      const path = extractStoragePath(receiptUrl);
      if (!path) {
        // Fall back to using the URL as-is (legacy public URLs)
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
    <div className="flex items-start gap-3 flex-wrap">
      <a href={signedUrl} target="_blank" rel="noopener noreferrer">
        <img
          src={signedUrl}
          alt="Receipt"
          className="max-h-56 rounded-xl border border-border/50 hover:opacity-90 transition-opacity"
        />
      </a>
      <button
        type="button"
        onClick={handleDownload}
        disabled={downloading}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-primary/10 text-primary border border-primary/30 hover:bg-primary/20 transition-colors disabled:opacity-50"
      >
        {downloading ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
        ) : (
          <Download className="w-3.5 h-3.5" />
        )}
        <span>تنزيل الوصل</span>
      </button>
    </div>
  );
}
