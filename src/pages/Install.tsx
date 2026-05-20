import { useEffect, useState } from "react";
import { Helmet } from "react-helmet";
import { Download, Share2, Plus, Check, Copy, ExternalLink, AlertTriangle, MoreVertical } from "lucide-react";
import Layout from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "sonner";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

const ua = () => navigator.userAgent || "";
const isIOS = () => /iPad|iPhone|iPod/.test(ua()) && !(window as any).MSStream;
const isAndroid = () => /Android/i.test(ua());
const isStandalone = () =>
  window.matchMedia("(display-mode: standalone)").matches ||
  (navigator as any).standalone === true;
const isInAppBrowser = () =>
  /(FBAN|FBAV|Instagram|Line|Twitter|TikTok|MicroMessenger|Snapchat)/i.test(ua());
const isSafari = () => /^((?!chrome|android|crios|fxios).)*safari/i.test(ua());

export default function Install() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [platform, setPlatform] = useState<"ios" | "android" | "desktop">("desktop");
  const [inApp, setInApp] = useState(false);
  const [iosNotSafari, setIosNotSafari] = useState(false);

  useEffect(() => {
    setInstalled(isStandalone());
    setInApp(isInAppBrowser());
    if (isIOS()) {
      setPlatform("ios");
      setIosNotSafari(!isSafari());
    } else if (isAndroid()) setPlatform("android");
    else setPlatform("desktop");

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
    if (deferredPrompt) {
      await deferredPrompt.prompt();
      await deferredPrompt.userChoice;
      setDeferredPrompt(null);
      return;
    }
    toast.info("افتح قائمة المتصفح ⋮ ثم اختر «تثبيت التطبيق»");
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText("https://visaradar.lovable.app");
      toast.success("تم نسخ الرابط — افتحه في Chrome أو Safari");
    } catch {
      toast.error("تعذر النسخ");
    }
  };

  const openExternal = () =>
    window.open("https://visaradar.lovable.app/install", "_blank", "noopener,noreferrer");

  return (
    <Layout>
      <Helmet>
        <title>ثبّت تطبيق VisaRadar — خطوة واحدة</title>
        <meta name="description" content="ثبّت VisaRadar على شاشتك الرئيسية في ثوانٍ." />
      </Helmet>

      <section className="container max-w-xl mx-auto px-4 py-10">
        <div className="text-center mb-8">
          <img src="/icon-512.png" alt="VisaRadar" className="w-24 h-24 mx-auto rounded-3xl shadow-lg mb-4" />
          <h1 className="text-2xl font-bold mb-2">ثبّت VisaRadar على هاتفك</h1>
          <p className="text-sm text-muted-foreground">
            بدون متجر • بدون تسجيل إضافي • أقل من 10 ثوانٍ
          </p>
        </div>

        {installed && (
          <Card className="border-primary/30 bg-primary/5">
            <CardContent className="flex items-center gap-3 py-5">
              <Check className="w-6 h-6 text-primary shrink-0" />
              <div>
                <p className="font-semibold">التطبيق مثبّت ✨</p>
                <p className="text-sm text-muted-foreground">أنت تستخدم النسخة المثبّتة الآن.</p>
              </div>
            </CardContent>
          </Card>
        )}

        {!installed && inApp && (
          <Card className="border-amber-500/40 bg-amber-500/5 mb-4">
            <CardContent className="py-5 space-y-3">
              <div className="flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold mb-1">أنت داخل تطبيق آخر</p>
                  <p className="text-sm text-muted-foreground">
                    التثبيت غير متاح من هنا. افتح الرابط في متصفح Chrome أو Safari.
                  </p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Button onClick={openExternal} size="sm">
                  <ExternalLink className="w-4 h-4 ml-1.5" />
                  فتح في المتصفح
                </Button>
                <Button onClick={copyLink} variant="outline" size="sm">
                  <Copy className="w-4 h-4 ml-1.5" />
                  نسخ الرابط
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {!installed && !inApp && platform === "ios" && iosNotSafari && (
          <Card className="border-amber-500/40 bg-amber-500/5 mb-4">
            <CardContent className="py-5 space-y-3">
              <div className="flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold mb-1">افتح الصفحة في Safari</p>
                  <p className="text-sm text-muted-foreground">
                    على iPhone يجب استخدام Safari لتثبيت التطبيق.
                  </p>
                </div>
              </div>
              <Button onClick={copyLink} variant="outline" size="sm" className="w-full">
                <Copy className="w-4 h-4 ml-1.5" />
                نسخ الرابط ولصقه في Safari
              </Button>
            </CardContent>
          </Card>
        )}

        {!installed && !inApp && platform !== "ios" && (
          <Card>
            <CardContent className="py-6 space-y-4">
              <Button onClick={handleInstall} size="lg" className="w-full h-14 text-base font-bold">
                <Download className="w-5 h-5 ml-2" />
                {deferredPrompt ? "ثبّت الآن بضغطة واحدة" : "ثبّت التطبيق"}
              </Button>

              {!deferredPrompt && (
                <div className="rounded-lg bg-muted/50 p-4 text-sm space-y-2">
                  <p className="font-medium flex items-center gap-2">
                    <MoreVertical className="w-4 h-4" />
                    إذا لم يظهر الزر مباشرة:
                  </p>
                  <ol className="space-y-1.5 text-muted-foreground pr-5 list-decimal">
                    <li>اضغط على قائمة المتصفح (⋮) في الأعلى</li>
                    <li>اختر «تثبيت التطبيق» أو «إضافة إلى الشاشة الرئيسية»</li>
                    <li>تأكيد بـ «تثبيت»</li>
                  </ol>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {!installed && !inApp && platform === "ios" && !iosNotSafari && (
          <Card>
            <CardContent className="py-6">
              <p className="text-sm text-muted-foreground mb-4 text-center">
                ثلاث خطوات فقط على iPhone:
              </p>
              <div className="space-y-3">
                <Step n={1} icon={<Share2 className="w-5 h-5" />}>
                  اضغط زر <strong>المشاركة</strong> في أسفل Safari
                </Step>
                <Step n={2} icon={<Plus className="w-5 h-5" />}>
                  اختر <strong>«إضافة إلى الشاشة الرئيسية»</strong>
                </Step>
                <Step n={3} icon={<Check className="w-5 h-5" />}>
                  اضغط <strong>«إضافة»</strong> في الأعلى
                </Step>
              </div>
            </CardContent>
          </Card>
        )}

        <div className="mt-8 grid grid-cols-3 gap-3 text-center">
          <Benefit emoji="⚡" label="فتح فوري" />
          <Benefit emoji="📱" label="شاشة كاملة" />
          <Benefit emoji="🔔" label="تنبيهات" />
        </div>

        <p className="mt-8 text-xs text-muted-foreground text-center">
          واجهتك مشكلة؟ راسلنا عبر صفحة <a href="/contact" className="text-primary underline">اتصل بنا</a>
        </p>
      </section>
    </Layout>
  );
}

function Step({ n, icon, children }: { n: number; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/40 border border-border/40">
      <span className="shrink-0 w-8 h-8 rounded-full bg-primary text-primary-foreground font-bold flex items-center justify-center text-sm">
        {n}
      </span>
      <span className="text-primary shrink-0">{icon}</span>
      <span className="text-sm">{children}</span>
    </div>
  );
}

function Benefit({ emoji, label }: { emoji: string; label: string }) {
  return (
    <div className="p-3 rounded-lg bg-muted/30">
      <div className="text-2xl mb-1">{emoji}</div>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  );
}