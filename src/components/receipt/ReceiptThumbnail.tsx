import { forwardRef, useEffect, useState } from "react";
import { Loader2, Download, ZoomIn, ImageIcon, ChevronDown, FileImage, FileDown, Info, RefreshCw, FileText } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import type { ReceiptFileKind } from "@/lib/receiptStorage";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const SLOW_LOAD_THRESHOLD_MS = 4000;
const HARD_LOAD_TIMEOUT_MS = 12000;

export interface ReceiptThumbnailProps {
  signedUrl: string;
  downloading: boolean;
  onOpen: () => void;
  onDownload: () => void;
  /** Optional callback for downloading the smaller thumbnail variant. */
  onDownloadThumb?: () => void;
  /** Show notice that image transform is disabled and full size will be used. */
  fullSizeNotice?: boolean;
  /** Optional callback to retry fetching the signed URL / image. */
  onRetry?: () => void;
  fileKind?: ReceiptFileKind;
  filename?: string;
  /**
   * Optional fallback URL to swap in if the primary signedUrl (often the
   * transformed thumbnail) fails to load. Lets us recover from transient
   * CDN/transform errors without forcing a full retry round-trip.
   */
  fallbackUrl?: string;
}

export const ReceiptThumbnail = forwardRef<HTMLButtonElement, ReceiptThumbnailProps>(
  ({ signedUrl, downloading, onOpen, onDownload, onDownloadThumb, fullSizeNotice, onRetry, fileKind = "image", filename, fallbackUrl }, ref) => {
  const [imgState, setImgState] = useState<"loading" | "loaded" | "error">("loading");
  const [slow, setSlow] = useState(false);
  const [activeSrc, setActiveSrc] = useState(signedUrl);
  const [fallbackTried, setFallbackTried] = useState(false);
  const isImage = fileKind === "image";

  // Reset state when src changes (retry, new signed URL)
  useEffect(() => {
    if (!isImage) {
      setImgState("loaded");
      setSlow(false);
      return;
    }
    setImgState("loading");
    setSlow(false);
    setActiveSrc(signedUrl);
    setFallbackTried(false);
  }, [signedUrl, isImage]);

  useEffect(() => {
    if (!isImage) return;
    if (imgState !== "loading") return;
    const slowTimer = window.setTimeout(() => setSlow(true), SLOW_LOAD_THRESHOLD_MS);
    // Hard fallback: if the <img> never fires load/error (transform 400, CDN
    // hangs, stale cached signed URL after re-upload), surface an error state
    // so the user gets a retry button instead of an infinite skeleton.
    const hardTimer = window.setTimeout(() => {
      setImgState((s) => {
        if (s !== "loading") return s;
        // Last-ditch: try the fallback (full-size) URL before showing error.
        if (fallbackUrl && fallbackUrl !== activeSrc && !fallbackTried) {
          setActiveSrc(fallbackUrl);
          setFallbackTried(true);
          setSlow(false);
          return "loading";
        }
        return "error";
      });
    }, HARD_LOAD_TIMEOUT_MS);
    return () => {
      window.clearTimeout(slowTimer);
      window.clearTimeout(hardTimer);
    };
  }, [imgState, signedUrl, isImage, fallbackUrl, activeSrc, fallbackTried]);

  return (
    <div className="flex flex-col gap-2">
    <div className="flex items-start gap-3 flex-wrap">
      <div className="relative w-40 h-40 sm:w-48 sm:h-48 aspect-square shrink-0">
      <button
        ref={ref}
        type="button"
        onClick={onOpen}
        className="relative group w-full h-full rounded-xl overflow-hidden border border-border/50 hover:border-primary/50 transition-colors focus:outline-none focus-visible:ring-4 focus-visible:ring-accent/60 focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:border-accent bg-muted/20"
        aria-label={isImage ? "تكبير صورة الوصل" : "فتح ملف الوصل"}
        disabled={isImage && imgState === "error"}
      >
        {!isImage ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-muted/20 px-3 text-center">
            <FileText className="w-10 h-10 text-primary" />
            <span className="text-sm font-bold text-foreground">وصل PDF</span>
            <span className="max-w-full truncate text-[11px] text-muted-foreground" title={filename}>
              {filename || "receipt.pdf"}
            </span>
          </div>
        ) : (
          <>
        {/* Stable placeholder: same icon always rendered; only background and message swap */}
        <div
          className={`absolute inset-0 transition-opacity duration-200 ${
            imgState === "loaded" ? "opacity-0 pointer-events-none" : "opacity-100"
          }`}
          role="status"
          aria-live="polite"
          aria-label={
            imgState === "error"
              ? "تعذر تحميل صورة الوصل"
              : slow
              ? "التحميل يستغرق وقتاً أطول من المعتاد"
              : "جارٍ تحميل صورة الوصل"
          }
        >
          <Skeleton
            className={`absolute inset-0 w-full h-full rounded-none transition-opacity ${
              imgState === "loading" ? "opacity-100" : "opacity-0"
            }`}
          />
          <div
            className={`absolute inset-0 transition-colors ${
              imgState === "error" ? "bg-destructive/5" : ""
            }`}
          />
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 px-2 text-center">
            <ImageIcon
              className={`w-8 h-8 transition-colors ${
                imgState === "error" ? "text-destructive/70" : "text-muted-foreground/40"
              }`}
            />
            <span
              className={`text-[10px] leading-tight font-medium min-h-[1.25rem] transition-colors ${
                imgState === "error"
                  ? "text-destructive"
                  : "text-muted-foreground/80"
              }`}
            >
              {imgState === "error"
                ? "تعذر تحميل الصورة"
                : slow
                ? "التحميل يستغرق وقتاً أطول من المعتاد…"
                : "\u00A0"}
            </span>
          </div>
        </div>
        <img
          src={signedUrl}
          alt="Receipt"
          decoding="async"
          onLoad={() => setImgState("loaded")}
          onError={() => setImgState("error")}
          className={`absolute inset-0 w-full h-full object-contain group-hover:opacity-80 transition-opacity ${
            imgState === "loaded" ? "opacity-100" : "opacity-0 pointer-events-none"
          }`}
        />
          </>
        )}
        <span className="absolute inset-0 flex items-center justify-center bg-background/40 opacity-0 group-hover:opacity-100 transition-opacity">
          {isImage ? <ZoomIn className="w-6 h-6 text-foreground" /> : <FileText className="w-6 h-6 text-foreground" />}
        </span>
      </button>
      {isImage && onRetry && (imgState === "error" || (imgState === "loading" && slow)) && (
        <button
          type="button"
          onClick={onRetry}
          className={`absolute z-10 inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium border transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 ${
            imgState === "error"
              ? "bottom-2 left-1/2 -translate-x-1/2 bg-destructive/10 hover:bg-destructive/20 border-destructive/40 text-destructive"
              : "bottom-2 left-1/2 -translate-x-1/2 bg-background/90 backdrop-blur hover:bg-background border-border/60 text-foreground"
          }`}
          aria-label="إعادة محاولة تحميل الصورة"
        >
          <RefreshCw className="w-3 h-3" />
          <span>إعادة المحاولة</span>
        </button>
      )}
      </div>
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
    {fullSizeNotice && (
      <div
        className="inline-flex items-start gap-1.5 px-2.5 py-1.5 rounded-md bg-muted/40 border border-border/40 text-[11px] text-muted-foreground max-w-fit"
        role="status"
      >
        <Info className="w-3 h-3 mt-0.5 shrink-0 text-muted-foreground/80" />
        <span>
          تعذّر إنشاء نسخة مصغّرة — سيتم تحميل الصورة بالحجم الكامل.
        </span>
      </div>
    )}
    </div>
  );
  }
);

ReceiptThumbnail.displayName = "ReceiptThumbnail";
