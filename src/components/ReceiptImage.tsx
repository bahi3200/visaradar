import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, AlertCircle, Download, ZoomIn, X, Plus, Minus, RotateCcw, Maximize2, Minimize2, HelpCircle } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";
import { TransformWrapper, TransformComponent, type ReactZoomPanPinchRef } from "react-zoom-pan-pinch";

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
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const fullscreenRef = useRef<HTMLDivElement | null>(null);
  const transformRef = useRef<ReactZoomPanPinchRef | null>(null);

  useEffect(() => {
    const onChange = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  const toggleFullscreen = async () => {
    try {
      if (!document.fullscreenElement) {
        await fullscreenRef.current?.requestFullscreen();
      } else {
        await document.exitFullscreen();
      }
    } catch {
      toast.error("تعذر تفعيل ملء الشاشة");
    }
  };

  // Keyboard shortcuts: + zoom in, - zoom out, 0 reset, F fullscreen, Esc close
  useEffect(() => {
    if (!lightboxOpen) return;
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) return;
      const t = transformRef.current;
      if ((e.key === "+" || e.key === "=") && t) { e.preventDefault(); t.zoomIn(); }
      else if ((e.key === "-" || e.key === "_") && t) { e.preventDefault(); t.zoomOut(); }
      else if (e.key === "0" && t) { e.preventDefault(); t.resetTransform(); }
      else if (e.key === "f" || e.key === "F") { e.preventDefault(); toggleFullscreen(); }
      // Esc is handled by Dialog automatically; let it close.
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [lightboxOpen]);
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
    <>
      <div className="flex items-start gap-3 flex-wrap">
        <button
          type="button"
          onClick={() => setLightboxOpen(true)}
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

      <Dialog open={lightboxOpen} onOpenChange={setLightboxOpen}>
        <DialogContent className="max-w-5xl p-0 bg-background/95 border-border/50 [&>button]:hidden">
          <VisuallyHidden>
            <DialogTitle>صورة الوصل</DialogTitle>
          </VisuallyHidden>
          <div ref={fullscreenRef} className="relative bg-background/95">
            <TransformWrapper
              ref={transformRef}
              initialScale={1}
              minScale={0.5}
              maxScale={6}
              doubleClick={{ mode: "toggle", step: 2 }}
              wheel={{ step: 0.15 }}
              pinch={{ step: 5 }}
            >
              {({ zoomIn, zoomOut, resetTransform }) => (
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setLightboxOpen(false)}
                    className="absolute top-3 right-3 z-10 p-2 rounded-full bg-background/80 hover:bg-background border border-border/50 transition-colors"
                    aria-label="إغلاق"
                  >
                    <X className="w-4 h-4 text-foreground" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setShortcutsOpen(true)}
                    className="sm:hidden absolute top-3 right-14 z-10 p-2 rounded-full bg-background/80 hover:bg-background border border-border/50 transition-colors"
                    aria-label="عرض الاختصارات"
                  >
                    <HelpCircle className="w-4 h-4 text-foreground" />
                  </button>
                  <div className="absolute top-3 left-3 z-10 flex items-center gap-1.5 flex-wrap">
                    <button
                      type="button"
                      onClick={() => zoomIn()}
                      className="p-2 rounded-full bg-background/80 hover:bg-background border border-border/50 transition-colors"
                      aria-label="تكبير"
                    >
                      <Plus className="w-4 h-4 text-foreground" />
                    </button>
                    <button
                      type="button"
                      onClick={() => zoomOut()}
                      className="p-2 rounded-full bg-background/80 hover:bg-background border border-border/50 transition-colors"
                      aria-label="تصغير"
                    >
                      <Minus className="w-4 h-4 text-foreground" />
                    </button>
                    <button
                      type="button"
                      onClick={() => resetTransform()}
                      className="p-2 rounded-full bg-background/80 hover:bg-background border border-border/50 transition-colors"
                      aria-label="إعادة الضبط"
                    >
                      <RotateCcw className="w-4 h-4 text-foreground" />
                    </button>
                    <button
                      type="button"
                      onClick={toggleFullscreen}
                      className="p-2 rounded-full bg-background/80 hover:bg-background border border-border/50 transition-colors"
                      aria-label={isFullscreen ? "الخروج من ملء الشاشة" : "ملء الشاشة"}
                    >
                      {isFullscreen ? (
                        <Minimize2 className="w-4 h-4 text-foreground" />
                      ) : (
                        <Maximize2 className="w-4 h-4 text-foreground" />
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={handleDownload}
                      disabled={downloading}
                      className="inline-flex items-center gap-1.5 px-3 py-2 rounded-full text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
                    >
                      {downloading ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Download className="w-3.5 h-3.5" />
                      )}
                      <span>تنزيل</span>
                    </button>
                  </div>
                  <TransformComponent
                    wrapperClass={`!w-full ${isFullscreen ? "!h-screen !max-h-screen" : "!max-h-[85vh]"} rounded-lg bg-background/40`}
                    contentClass="!w-full"
                  >
                    <img
                      src={signedUrl}
                      alt="Receipt full view"
                      className={`w-full ${isFullscreen ? "h-screen max-h-screen" : "max-h-[85vh]"} object-contain select-none`}
                      draggable={false}
                    />
                  </TransformComponent>
                  {/* Keyboard shortcuts hint bar */}
                  <div className="hidden sm:flex absolute bottom-3 left-1/2 -translate-x-1/2 z-10 items-center gap-2 px-3 py-1.5 rounded-full bg-background/80 backdrop-blur border border-border/50 text-[11px] text-muted-foreground shadow-sm">
                    <span className="flex items-center gap-1">
                      <kbd className="px-1.5 py-0.5 rounded bg-muted/70 border border-border/50 text-foreground font-mono text-[10px]">+</kbd>
                      تكبير
                    </span>
                    <span className="text-border">•</span>
                    <span className="flex items-center gap-1">
                      <kbd className="px-1.5 py-0.5 rounded bg-muted/70 border border-border/50 text-foreground font-mono text-[10px]">−</kbd>
                      تصغير
                    </span>
                    <span className="text-border">•</span>
                    <span className="flex items-center gap-1">
                      <kbd className="px-1.5 py-0.5 rounded bg-muted/70 border border-border/50 text-foreground font-mono text-[10px]">0</kbd>
                      إعادة
                    </span>
                    <span className="text-border">•</span>
                    <span className="flex items-center gap-1">
                      <kbd className="px-1.5 py-0.5 rounded bg-muted/70 border border-border/50 text-foreground font-mono text-[10px]">F</kbd>
                      ملء الشاشة
                    </span>
                    <span className="text-border">•</span>
                    <span className="flex items-center gap-1">
                      <kbd className="px-1.5 py-0.5 rounded bg-muted/70 border border-border/50 text-foreground font-mono text-[10px]">Esc</kbd>
                      إغلاق
                    </span>
                  </div>
                </div>
              )}
            </TransformWrapper>
          </div>
        </DialogContent>
      </Dialog>

      {/* Shortcuts help modal (mobile) */}
      <Dialog open={shortcutsOpen} onOpenChange={setShortcutsOpen}>
        <DialogContent className="max-w-xs p-0 bg-background border-border/50">
          <div className="p-5">
            <DialogTitle className="text-base font-bold text-foreground mb-3 flex items-center gap-2">
              <HelpCircle className="w-4 h-4 text-primary" />
              اختصارات لوحة المفاتيح
            </DialogTitle>
            <ul className="space-y-2 text-sm text-foreground">
              {[
                { k: "+", label: "تكبير" },
                { k: "−", label: "تصغير" },
                { k: "0", label: "إعادة الضبط" },
                { k: "F", label: "ملء الشاشة" },
                { k: "Esc", label: "إغلاق" },
              ].map((row) => (
                <li key={row.k} className="flex items-center justify-between rounded-lg bg-muted/40 px-3 py-2">
                  <span className="text-muted-foreground">{row.label}</span>
                  <kbd className="px-2 py-0.5 rounded bg-background border border-border/50 text-foreground font-mono text-xs">
                    {row.k}
                  </kbd>
                </li>
              ))}
            </ul>
            <p className="text-[11px] text-muted-foreground mt-3 text-center">
              يمكنك أيضاً قرص الصورة بإصبعين للتكبير
            </p>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
