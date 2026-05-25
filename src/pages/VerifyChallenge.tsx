import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Shield, ExternalLink, Check, AlertTriangle, Loader2, ClipboardPaste } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import SEO from "@/components/SEO";

/**
 * Public page reached via the Telegram deep link.
 * The user solves CAPTCHA in a new tab on the provider's site,
 * then pastes the page cookies (export via DevTools or browser extension)
 * back here so the worker can reuse the trusted session.
 */
export default function VerifyChallenge() {
  const { token = "" } = useParams();
  const [info, setInfo] = useState<any>(null);
  const [cookiesText, setCookiesText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!token) return;
    (async () => {
      const { data } = await supabase
        .from("challenge_sessions" as any)
        .select("provider, country_code, challenge_type, target_url, status, expires_at")
        .eq("deep_link_token", token)
        .maybeSingle();
      setInfo(data);
    })();
  }, [token]);

  async function handleSubmit() {
    let cookies: any;
    try {
      cookies = JSON.parse(cookiesText.trim());
      if (!Array.isArray(cookies)) throw new Error("must be array");
    } catch {
      toast.error("الكوكيز يجب أن تكون JSON Array مأخوذة من EditThisCookie أو Cookie-Editor");
      return;
    }
    setSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke("hvg-resolve-challenge", {
        body: {
          token,
          cookies,
          user_agent: navigator.userAgent,
        },
      });
      if (error || (data as any)?.error) {
        toast.error((data as any)?.error || error?.message || "فشل حفظ الجلسة");
      } else {
        setDone(true);
        toast.success("تم حفظ الجلسة — يمكن للمراقبة الاستئناف الآن");
      }
    } finally {
      setSubmitting(false);
    }
  }

  const expired = info && new Date(info.expires_at) < new Date();
  const resolved = info?.status === "resolved";

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4" dir="rtl">
      <SEO title="تحقق بشري — VisaRadar" description="صفحة حل تحدي الحماية لاستئناف المراقبة" />
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-xl gradient-card rounded-2xl border border-border/50 p-6 space-y-5"
      >
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-primary/15 flex items-center justify-center">
            <Shield className="w-6 h-6 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-black text-foreground">تحقق بشري</h1>
            <p className="text-xs text-muted-foreground">Human Verification Gateway</p>
          </div>
        </div>

        {!info && <p className="text-sm text-muted-foreground">جاري تحميل التحدي…</p>}

        {info && (done || resolved) && (
          <div className="rounded-xl bg-green-500/10 border border-green-500/30 p-4 flex items-start gap-3">
            <Check className="w-5 h-5 text-green-400 mt-0.5" />
            <div className="text-sm">
              <p className="font-bold text-green-400">تم بنجاح</p>
              <p className="text-muted-foreground mt-1">تم حفظ الجلسة. سيستأنف نظام المراقبة عمله تلقائياً خلال دقائق.</p>
              <Link to="/" className="text-primary text-xs underline mt-2 inline-block">العودة للصفحة الرئيسية</Link>
            </div>
          </div>
        )}

        {info && expired && !resolved && (
          <div className="rounded-xl bg-orange-500/10 border border-orange-500/30 p-4 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-orange-400 mt-0.5" />
            <p className="text-sm">انتهت صلاحية هذا الرابط. سيُعاد إرسال طلب جديد عند الحاجة.</p>
          </div>
        )}

        {info && !expired && !resolved && !done && (
          <>
            <div className="rounded-xl bg-secondary/40 border border-border/50 p-4 text-sm space-y-1">
              <p><span className="text-muted-foreground">المزود:</span> <b>{info.provider}</b></p>
              <p><span className="text-muted-foreground">الدولة:</span> <b>{info.country_code}</b></p>
              <p><span className="text-muted-foreground">نوع التحدي:</span> <code className="text-orange-400">{info.challenge_type}</code></p>
            </div>

            <ol className="text-sm space-y-2 list-decimal pr-5 text-foreground/90">
              <li>اضغط على الزر أدناه لفتح موقع المزود في تبويب جديد.</li>
              <li>أكمل التحقق (CAPTCHA / Cloudflare) يدوياً حتى تظهر الصفحة بشكل طبيعي.</li>
              <li>استخرج كوكيز الموقع باستعمال إضافة مثل <b>Cookie-Editor</b> أو <b>EditThisCookie</b> (تصدير JSON).</li>
              <li>الصق الـ JSON أدناه واضغط <b>حفظ الجلسة</b>.</li>
            </ol>

            {info.target_url && (
              <Button asChild variant="outline" className="w-full">
                <a href={info.target_url} target="_blank" rel="noreferrer noopener">
                  <ExternalLink className="w-4 h-4 ml-2" /> فتح صفحة المزود
                </a>
              </Button>
            )}

            <div className="space-y-2">
              <label className="text-xs font-bold text-muted-foreground flex items-center gap-1">
                <ClipboardPaste className="w-3 h-3" /> الكوكيز (JSON Array)
              </label>
              <Textarea
                value={cookiesText}
                onChange={(e) => setCookiesText(e.target.value)}
                placeholder='[{"name":"cf_clearance","value":"...","domain":".tlscontact.com",...}]'
                rows={8}
                className="font-mono text-[11px] ltr:text-left"
                dir="ltr"
              />
            </div>

            <Button onClick={handleSubmit} disabled={submitting || !cookiesText.trim()} className="w-full">
              {submitting ? <Loader2 className="w-4 h-4 ml-2 animate-spin" /> : <Check className="w-4 h-4 ml-2" />}
              حفظ الجلسة
            </Button>

            <p className="text-[10px] text-muted-foreground text-center">
              الكوكيز تُحفظ مشفّرة وتُستعمل فقط لمراقبة هذا المزود لحسابك. تنتهي صلاحيتها تلقائياً.
            </p>
          </>
        )}
      </motion.div>
    </div>
  );
}