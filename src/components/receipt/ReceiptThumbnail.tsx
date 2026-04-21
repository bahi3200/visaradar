import { forwardRef, useState } from "react";
import { Loader2, Download, ZoomIn, AlertCircle } from "lucide-react";

export interface ReceiptThumbnailProps {
  signedUrl: string;
  downloading: boolean;
  onOpen: () => void;
  onDownload: () => void;
}

export const ReceiptThumbnail = forwardRef<HTMLButtonElement, ReceiptThumbnailProps>(
  ({ signedUrl, downloading, onOpen, onDownload }, ref) => {
  const [imgState, setImgState] = useState<"loading" | "loaded" | "error">("loading");
  return (
    <div className="flex items-start gap-3 flex-wrap">
      <button
        ref={ref}
        type="button"
        onClick={onOpen}
        className="relative group rounded-xl overflow-hidden border border-border/50 hover:border-primary/50 transition-colors focus:outline-none focus-visible:ring-4 focus-visible:ring-accent/60 focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:border-accent"
        aria-label="تكبير صورة الوصل"
        disabled={imgState === "error"}
      >
        {imgState === "loading" && (
          <div className="flex items-center justify-center w-40 h-40 bg-muted/30">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        )}
        {imgState === "error" && (
          <div className="flex flex-col items-center justify-center w-40 h-40 gap-1 bg-destructive/5 text-destructive text-xs px-2 text-center">
            <AlertCircle className="w-4 h-4" />
            <span>تعذر تحميل الصورة</span>
          </div>
        )}
        <img
          src={signedUrl}
          alt="Receipt"
          onLoad={() => setImgState("loaded")}
          onError={() => setImgState("error")}
          className={`max-h-56 group-hover:opacity-80 transition-opacity ${imgState === "loaded" ? "" : "hidden"}`}
        />
        <span className="absolute inset-0 flex items-center justify-center bg-background/40 opacity-0 group-hover:opacity-100 transition-opacity">
          <ZoomIn className="w-6 h-6 text-foreground" />
        </span>
      </button>
      <button
        type="button"
        onClick={onDownload}
        disabled={downloading}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-primary/10 text-primary border border-primary/30 hover:bg-primary/20 transition-colors disabled:opacity-50 focus:outline-none focus-visible:ring-4 focus-visible:ring-accent/60 focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:border-accent"
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
);

ReceiptThumbnail.displayName = "ReceiptThumbnail";
