import { useEffect, useState } from "react";
import { Helmet } from "react-helmet";
import { Download, Smartphone, Share2, Plus, Check } from "lucide-react";
import Layout from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

const isIOS = () => /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream;
const isStandalone = () =>
  window.matchMedia("(display-mode: standalone)").matches ||
  (navigator as any).standalone === true;

export default function Install() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [ios, setIos] = useState(false);

  useEffect(() => {
    setIos(isIOS());
    setInstalled(isStandalone());

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };
    const installedHandler = () => {
      setInstalled(true);
      setDeferredPrompt(null);
      toast.success("تم تثبيت التطبيق بنجاح ✅");
    };
    window.addEventListener("beforeinstallprompt", handler);
    window.addEventListener("appinstalled", installedHandler);
    return () => {
      window.removeEventListener("beforeinstallprompt", handler);
      window.removeEventListener("appinstalled", installedHandler);
    };
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) {
      toast.error("التثبيت غير متاح في هذا المتصفح. جرّب فتح الرابط في Chrome أو Safari.");
      return;
    }
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === "accepted") {
      toast.success("جاري التثبيت...");
    }
    setDeferredPrompt(null);
  };

  return (
    <Layout>
      <Helmet>
        <title>تثبيت تطبيق VisaRadar على هاتفك</title>
        <meta name="description" content="ثبّت تطبيق VisaRadar على هاتفك للوصول السريع لتنبيهات الفيزا والوظائف." />
      </Helmet>

      <section className="container max-w-2xl mx-auto px-4 py-12">
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-primary/10 mb-4">
            <Smartphone className="w-10 h-10 text-primary" />
          </div>
          <h1 className="text-3xl font-bold mb-3">ثبّت تطبيق VisaRadar</h1>
          <p className="text-muted-foreground">
            احصل على تجربة تطبيق كامل: أيقونة على الشاشة الرئيسية، فتح أسرع، وتشغيل بدون شريط المتصفح.
          </p>
        </div>

        {installed ? (
          <Card className="border-primary/30 bg-primary/5">
            <CardContent className="flex items-center gap-3 py-6">
              <Check className="w-6 h-6 text-primary shrink-0" />
              <div>
                <p className="font-semibold">التطبيق مثبّت بالفعل ✨</p>
                <p className="text-sm text-muted-foreground">أنت تستخدم النسخة المثبّتة الآن.</p>
              </div>
            </CardContent>
          </Card>
        ) : ios ? (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Smartphone className="w-5 h-5" />
                التثبيت على iPhone / iPad
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <ol className="space-y-3 text-sm">
                <li className="flex items-start gap-3">
                  <span className="shrink-0 w-7 h-7 rounded-full bg-primary/15 text-primary font-bold flex items-center justify-center text-xs">1</span>
                  <span>افتح هذه الصفحة في متصفح <strong>Safari</strong> (وليس Chrome).</span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="shrink-0 w-7 h-7 rounded-full bg-primary/15 text-primary font-bold flex items-center justify-center text-xs">2</span>
                  <span className="flex items-center gap-1 flex-wrap">
                    اضغط زر المشاركة <Share2 className="inline w-4 h-4" /> في الأسفل.
                  </span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="shrink-0 w-7 h-7 rounded-full bg-primary/15 text-primary font-bold flex items-center justify-center text-xs">3</span>
                  <span className="flex items-center gap-1 flex-wrap">
                    اختر <strong>«إضافة إلى الشاشة الرئيسية»</strong> <Plus className="inline w-4 h-4" />.
                  </span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="shrink-0 w-7 h-7 rounded-full bg-primary/15 text-primary font-bold flex items-center justify-center text-xs">4</span>
                  <span>اضغط <strong>«إضافة»</strong> في الأعلى — ستظهر أيقونة VisaRadar على شاشتك.</span>
                </li>
              </ol>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Download className="w-5 h-5" />
                التثبيت على Android / Desktop
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                اضغط الزر التالي لإضافة التطبيق إلى شاشتك الرئيسية مباشرة.
              </p>
              <Button onClick={handleInstall} size="lg" className="w-full" disabled={!deferredPrompt}>
                <Download className="w-5 h-5 ml-2" />
                {deferredPrompt ? "ثبّت التطبيق الآن" : "التثبيت غير متاح حالياً"}
              </Button>
              {!deferredPrompt && (
                <p className="text-xs text-muted-foreground text-center">
                  إذا لم يظهر الزر فعّالاً، افتح قائمة المتصفح (⋮) واختر «تثبيت التطبيق» أو «إضافة إلى الشاشة الرئيسية».
                </p>
              )}
            </CardContent>
          </Card>
        )}

        <div className="mt-10 grid grid-cols-3 gap-4 text-center">
          <div>
            <div className="text-2xl mb-1">⚡</div>
            <p className="text-xs text-muted-foreground">فتح فوري</p>
          </div>
          <div>
            <div className="text-2xl mb-1">📱</div>
            <p className="text-xs text-muted-foreground">شاشة كاملة</p>
          </div>
          <div>
            <div className="text-2xl mb-1">🔔</div>
            <p className="text-xs text-muted-foreground">تنبيهات Telegram</p>
          </div>
        </div>
      </section>
    </Layout>
  );
}
