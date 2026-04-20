import { Loader2, Download, ZoomIn } from "lucide-react";

interface ReceiptThumbnailProps {
  signedUrl: string;
  downloading: boolean;
  onOpen: () => void;
  onDownload: () => void;
}

export function ReceiptThumbnail({ signedUrl, downloading, onOpen, onDownload }: ReceiptThumbnailProps) {
  return (
    <div className="flex items-start gap-3 flex-wrap">
      <button
        type="button"
        onClick={onOpen}
        className="relative group rounded-xl overflow-hidden border border-border/50 hover:border-primary/50 transition-colors"
        aria-label="تكبير صورة الوصل"
      >
        <img
          src={signedUrl}
          alt="Receipt"
          className="max-h-56 group-hover:opacity-80 transition-opacity"
        />
        <span className="absolute inset-0 flex items-center justify-center bg-background/40 opacity-0 group-hover:opacity-100 transition-opacity">
          <ZoomIn className="w-6 h-6 text-foreground" />
        </span>
      </button>
      <button
        type="button"
        onClick={onDownload}
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
