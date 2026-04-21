import { forwardRef, useEffect, useState } from "react";
import { Loader2, Download, ZoomIn, AlertCircle, ImageIcon, ChevronDown, FileImage, FileDown } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const SLOW_LOAD_THRESHOLD_MS = 4000;

export interface ReceiptThumbnailProps {
  signedUrl: string;
  downloading: boolean;
  onOpen: () => void;
  onDownload: () => void;
  /** Optional callback for downloading the smaller thumbnail variant. */
  onDownloadThumb?: () => void;
}

export const ReceiptThumbnail = forwardRef<HTMLButtonElement, ReceiptThumbnailProps>(
  ({ signedUrl, downloading, onOpen, onDownload, onDownloadThumb }, ref) => {
  const [imgState, setImgState] = useState<"loading" | "loaded" | "error">("loading");
  const [slow, setSlow] = useState(false);

  // Reset state when src changes (retry, new signed URL)
  useEffect(() => {
    setImgState("loading");
    setSlow(false);
  }, [signedUrl]);

  useEffect(() => {
    if (imgState !== "loading") return;
    const t = window.setTimeout(() => setSlow(true), SLOW_LOAD_THRESHOLD_MS);
    return () => window.clearTimeout(t);
  }, [imgState]);

  return (
    <div className="flex items-start gap-3 flex-wrap">
      <button
        ref={ref}
        type="button"
        onClick={onOpen}
        className="relative group w-40 h-40 sm:w-48 sm:h-48 aspect-square shrink-0 rounded-xl overflow-hidden border border-border/50 hover:border-primary/50 transition-colors focus:outline-none focus-visible:ring-4 focus-visible:ring-accent/60 focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:border-accent bg-muted/20"
        aria-label="تكبير صورة الوصل"
        disabled={imgState === "error"}
      >
        {imgState === "loading" && (
          <div
            className="absolute inset-0"
            role="status"
            aria-live="polite"
            aria-label={slow ? "التحميل يستغرق وقتاً أطول من المعتاد" : "جارٍ تحميل صورة الوصل"}
          >
            <Skeleton className="absolute inset-0 w-full h-full rounded-none" />
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 px-2 text-center">
              <ImageIcon className="w-8 h-8 text-muted-foreground/40" />
              {slow && (
                <span className="text-[10px] leading-tight text-muted-foreground/80 font-medium">
                  التحميل يستغرق وقتاً أطول من المعتاد…
                </span>
              )}
            </div>
          </div>
        )}
        {imgState === "error" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-destructive/5 text-destructive text-xs px-2 text-center">
            <AlertCircle className="w-4 h-4" />
            <span>تعذر تحميل الصورة</span>
          </div>
        )}
        <img
          src={signedUrl}
          alt="Receipt"
          loading="lazy"
          decoding="async"
          onLoad={() => setImgState("loaded")}
          onError={() => setImgState("error")}
          className={`absolute inset-0 w-full h-full object-contain group-hover:opacity-80 transition-opacity ${imgState === "loaded" ? "" : "hidden"}`}
        />
        <span className="absolute inset-0 flex items-center justify-center bg-background/40 opacity-0 group-hover:opacity-100 transition-opacity">
          <ZoomIn className="w-6 h-6 text-foreground" />
        </span>
      </button>
      {onDownloadThumb ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              disabled={downloading}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-primary/10 text-primary border border-primary/30 hover:bg-primary/20 transition-colors disabled:opacity-50 focus:outline-none focus-visible:ring-4 focus-visible:ring-accent/60 focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:border-accent"
              aria-label="خيارات تنزيل الوصل"
            >
              {downloading ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Download className="w-3.5 h-3.5" />
              )}
              <span>تنزيل الوصل</span>
              <ChevronDown className="w-3 h-3 opacity-70" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-[14rem]">
            <DropdownMenuItem onClick={onDownload} className="gap-2 cursor-pointer">
              <FileImage className="w-4 h-4 text-primary" />
              <div className="flex flex-col">
                <span className="text-xs font-medium">النسخة الكاملة</span>
                <span className="text-[10px] text-muted-foreground">
                  أعلى جودة — حجم أكبر
                </span>
              </div>
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onDownloadThumb} className="gap-2 cursor-pointer">
              <FileDown className="w-4 h-4 text-accent" />
              <div className="flex flex-col">
                <span className="text-xs font-medium">نسخة مصغّرة</span>
                <span className="text-[10px] text-muted-foreground">
                  حجم أصغر — مناسب للمشاركة السريعة
                </span>
              </div>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ) : (
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
      )}
    </div>
  );
  }
);

ReceiptThumbnail.displayName = "ReceiptThumbnail";
