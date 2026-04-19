import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, AlertCircle } from "lucide-react";

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
    <a href={signedUrl} target="_blank" rel="noopener noreferrer">
      <img
        src={signedUrl}
        alt="Receipt"
        className="max-h-56 rounded-xl border border-border/50 hover:opacity-90 transition-opacity"
      />
    </a>
  );
}
