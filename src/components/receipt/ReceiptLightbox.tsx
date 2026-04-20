import { useEffect, useRef, useState } from "react";
import { Loader2, Download, X, Plus, Minus, RotateCcw, Maximize2, Minimize2, HelpCircle, RotateCw, RefreshCw, Printer, ExternalLink } from "lucide-react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";
import { TransformWrapper, TransformComponent, type ReactZoomPanPinchRef } from "react-zoom-pan-pinch";
import { useReceiptShortcuts } from "./useReceiptShortcuts";

interface ReceiptLightboxProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  signedUrl: string;
  downloading: boolean;
  onDownload: () => void;
}

export function ReceiptLightbox({ open, onOpenChange, signedUrl, downloading, onDownload }: ReceiptLightboxProps) {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [rotation, setRotation] = useState(0);
  const fullscreenRef = useRef<HTMLDivElement | null>(null);
  const transformRef = useRef<ReactZoomPanPinchRef | null>(null);

  // Reset rotation when lightbox closes
  useEffect(() => {
    if (!open) setRotation(0);
  }, [open]);

  const handleRotate = () => setRotation((r) => (r + 90) % 360);
  const handleRotateCcw = () => setRotation((r) => (r - 90 + 360) % 360);

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

  const handlePrint = () => {
    try {
      const w = window.open("", "_blank", "width=800,height=900");
      if (!w) {
        toast.error("تعذر فتح نافذة الطباعة — تأكد من السماح بالنوافذ المنبثقة");
        return;
      }
      w.document.write(`<!doctype html><html><head><title>طباعة الوصل</title><style>
        @page { margin: 12mm; }
        html,body { margin:0; padding:0; background:#fff; }
        .wrap { display:flex; align-items:center; justify-content:center; min-height:100vh; }
        img { max-width:100%; max-height:100vh; transform: rotate(${rotation}deg); transform-origin: center; }
      </style></head><body><div class="wrap"><img src="${signedUrl}" alt="receipt" onload="setTimeout(()=>{window.focus();window.print();},150)"/></div></body></html>`);
      w.document.close();
    } catch {
      toast.error("فشل الطباعة");
    }
  };

  useReceiptShortcuts({ enabled: open, transformRef, onToggleFullscreen: toggleFullscreen, onRotate: handleRotate, onRotateCcw: handleRotateCcw, onPrint: handlePrint });

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-5xl p-0 bg-background/95 border-border/50 [&>button]:hidden">
          <VisuallyHidden>
            <DialogTitle>صورة الوصل</DialogTitle>
            <DialogDescription>عارض صورة الوصل مع أدوات التكبير والتدوير والطباعة والتنزيل</DialogDescription>
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
                    onClick={() => onOpenChange(false)}
                    className="absolute top-3 right-3 z-10 p-2 rounded-full bg-background/80 hover:bg-background border border-border/50 transition-colors focus:outline-none focus-visible:ring-4 focus-visible:ring-accent/60 focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:border-accent"
                    aria-label="إغلاق"
                  >
                    <X className="w-4 h-4 text-foreground" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setShortcutsOpen(true)}
                    className="sm:hidden absolute top-3 right-14 z-10 p-2 rounded-full bg-background/80 hover:bg-background border border-border/50 transition-colors focus:outline-none focus-visible:ring-4 focus-visible:ring-accent/60 focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:border-accent"
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
                      onClick={handleRotateCcw}
                      className="p-2 rounded-full bg-background/80 hover:bg-background border border-border/50 transition-colors"
                      aria-label="تدوير عكسي 90°"
                    >
                      <RotateCcw className="w-4 h-4 text-foreground" />
                    </button>
                    <button
                      type="button"
                      onClick={handleRotate}
                      className="p-2 rounded-full bg-background/80 hover:bg-background border border-border/50 transition-colors"
                      aria-label="تدوير 90°"
                    >
                      <RotateCw className="w-4 h-4 text-foreground" />
                    </button>
                    <button
                      type="button"
                      onClick={() => { resetTransform(); setRotation(0); }}
                      className="p-2 rounded-full bg-background/80 hover:bg-background border border-border/50 transition-colors"
                      aria-label="إعادة الضبط"
                    >
                      <RefreshCw className="w-4 h-4 text-foreground" />
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
                      onClick={handlePrint}
                      className="p-2 rounded-full bg-background/80 hover:bg-background border border-border/50 transition-colors"
                      aria-label="طباعة"
                    >
                      <Printer className="w-4 h-4 text-foreground" />
                    </button>
                    <button
                      type="button"
                      onClick={onDownload}
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
                      className={`w-full ${isFullscreen ? "h-screen max-h-screen" : "max-h-[85vh]"} object-contain select-none transition-transform duration-300`}
                      style={{ transform: `rotate(${rotation}deg)` }}
                      draggable={false}
                    />
                  </TransformComponent>
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
                      <kbd className="px-1.5 py-0.5 rounded bg-muted/70 border border-border/50 text-foreground font-mono text-[10px]">R</kbd>
                      تدوير
                    </span>
                    <span className="text-border">•</span>
                    <span className="flex items-center gap-1">
                      <kbd className="px-1.5 py-0.5 rounded bg-muted/70 border border-border/50 text-foreground font-mono text-[10px]">⇧R</kbd>
                      عكسي
                    </span>
                    <span className="text-border">•</span>
                    <span className="flex items-center gap-1">
                      <kbd className="px-1.5 py-0.5 rounded bg-muted/70 border border-border/50 text-foreground font-mono text-[10px]">F</kbd>
                      ملء الشاشة
                    </span>
                    <span className="text-border">•</span>
                    <span className="flex items-center gap-1">
                      <kbd className="px-1.5 py-0.5 rounded bg-muted/70 border border-border/50 text-foreground font-mono text-[10px]">P</kbd>
                      طباعة
                    </span>
                    <span className="text-border">•</span>
                    <span className="flex items-center gap-1">
                      <kbd className="px-1.5 py-0.5 rounded bg-muted/70 border border-border/50 text-foreground font-mono text-[10px]">Esc</kbd>
                      إغلاق
                    </span>
                    <span className="text-border">•</span>
                    <button
                      type="button"
                      onClick={() => setShortcutsOpen(true)}
                      className="flex items-center gap-1 px-1.5 py-0.5 rounded text-accent hover:text-accent-foreground hover:bg-accent/20 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 focus-visible:ring-offset-1 focus-visible:ring-offset-background"
                      aria-label="عرض دليل الاختصارات الكامل"
                    >
                      <HelpCircle className="w-3 h-3" />
                      <span className="text-[10px] font-medium">دليل كامل</span>
                    </button>
                  </div>
                </div>
              )}
            </TransformWrapper>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={shortcutsOpen} onOpenChange={setShortcutsOpen}>
        <DialogContent className="max-w-md p-0 bg-background border-border/50 max-h-[85vh] overflow-y-auto">
          <div className="p-5">
            <DialogTitle className="text-base font-bold text-foreground mb-1 flex items-center gap-2">
              <HelpCircle className="w-4 h-4 text-accent" />
              دليل الاختصارات
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground mb-4">
              استخدم لوحة المفاتيح للتحكم السريع بالعارض
            </DialogDescription>
            <ul className="space-y-1.5 text-sm">
              {[
                { k: ["+"], label: "تكبير الصورة", Icon: Plus },
                { k: ["−"], label: "تصغير الصورة", Icon: Minus },
                { k: ["0"], label: "إعادة الضبط للحجم الأصلي", Icon: RefreshCw },
                { k: ["R"], label: "تدوير 90° مع عقارب الساعة", Icon: RotateCw },
                { k: ["⇧", "R"], label: "تدوير عكس عقارب الساعة", Icon: RotateCcw },
                { k: ["F"], label: "تبديل ملء الشاشة", Icon: Maximize2 },
                { k: ["P"], label: "طباعة الوصل", Icon: Printer },
                { k: ["Esc"], label: "إغلاق العارض", Icon: X },
              ].map((row) => (
                <li
                  key={row.label}
                  className="flex items-center justify-between gap-3 rounded-lg bg-muted/40 hover:bg-muted/60 transition-colors px-3 py-2.5"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="shrink-0 w-7 h-7 rounded-md bg-background border border-border/50 flex items-center justify-center">
                      <row.Icon className="w-3.5 h-3.5 text-accent" />
                    </div>
                    <span className="text-foreground truncate">{row.label}</span>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {row.k.map((key, i) => (
                      <span key={i} className="flex items-center gap-1">
                        {i > 0 && <span className="text-muted-foreground text-xs">+</span>}
                        <kbd className="inline-flex items-center justify-center min-w-[1.75rem] h-7 px-2 rounded bg-background border border-border text-foreground font-mono text-xs shadow-sm">
                          {key}
                        </kbd>
                      </span>
                    ))}
                  </div>
                </li>
              ))}
            </ul>
            <div className="mt-4 rounded-lg border border-border/40 bg-muted/30 px-3 py-2.5">
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                💡 يمكنك أيضاً <strong className="text-foreground">قرص الصورة بإصبعين</strong> للتكبير على الأجهزة اللوحية، و<strong className="text-foreground">النقر المزدوج</strong> لتبديل التكبير السريع.
              </p>
            </div>
            <Link
              to="/help/shortcuts"
              onClick={() => setShortcutsOpen(false)}
              className="mt-3 inline-flex items-center justify-center gap-1.5 w-full px-3 py-2 rounded-lg text-xs font-medium bg-accent/10 text-accent border border-accent/30 hover:bg-accent/20 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              عرض دليل الاختصارات الكامل
            </Link>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
