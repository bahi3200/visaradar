import { useState } from "react";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

/**
 * زر إعادة تحميل صارم: يبطل ذاكرة التخزين المؤقت (Cache + Service Worker)
 * ثم يعيد تحميل الصفحة لجلب أحدث إصدار بعد أي إعادة تشغيل للخادم.
 */
const HardReloadButton = () => {
  const [loading, setLoading] = useState(false);

  const handleReload = async () => {
    setLoading(true);
    toast.loading("جارٍ جلب أحدث إصدار...", { id: "hard-reload" });
    try {
      if ("caches" in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map((k) => caches.delete(k)));
      }
      if ("serviceWorker" in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map((r) => r.unregister()));
      }
    } catch (e) {
      console.warn("Cache clear failed", e);
    } finally {
      const url = new URL(window.location.href);
      url.searchParams.set("_r", Date.now().toString());
      window.location.replace(url.toString());
    }
  };

  return (
    <Button
      onClick={handleReload}
      disabled={loading}
      size="icon"
      variant="secondary"
      aria-label="تحديث وجلب أحدث إصدار"
      title="تحديث وجلب أحدث إصدار"
      className="fixed bottom-4 left-4 z-[9999] h-11 w-11 rounded-full shadow-lg border border-border bg-background/90 backdrop-blur hover:bg-accent"
    >
      <RefreshCw className={`h-5 w-5 ${loading ? "animate-spin" : ""}`} />
    </Button>
  );
};

export default HardReloadButton;