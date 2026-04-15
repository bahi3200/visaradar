import Layout from "@/components/Layout";
import { sampleJobs } from "@/data/sample";
import { useParams, Link } from "react-router-dom";
import { motion } from "framer-motion";
import {
  MapPin,
  Banknote,
  Building2,
  Star,
  ArrowRight,
  CheckCircle2,
  Gift,
  ExternalLink,
  FileText,
  Send,
  Lock,
  Crown,
  Calendar,
  Share2,
  MessageCircle,
} from "lucide-react";
import { toast } from "sonner";
import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

const countryNames: Record<string, string> = {
  CA: "كندا 🇨🇦",
  FR: "فرنسا 🇫🇷",
  DE: "ألمانيا 🇩🇪",
  US: "أمريكا 🇺🇸",
  AU: "أستراليا 🇦🇺",
  GB: "بريطانيا 🇬🇧",
};

export default function JobDetailsPage() {
  const { id } = useParams<{ id: string }>();
  const job = sampleJobs.find((j) => j.id === id);
  const [applying, setApplying] = useState(false);
  const { user } = useAuth();

  const { data: subscription } = useQuery({
    queryKey: ["my-subscription", user?.id],
    queryFn: async () => {
      if (!user) return null;
      const { data } = await supabase
        .from("subscriptions")
        .select("*, packages(*)")
        .eq("user_id", user.id)
        .eq("status", "active")
        .maybeSingle();
      return data;
    },
    enabled: !!user,
  });

  const hasAccess = !!subscription && (subscription.service_type === 'jobs' || subscription.service_type === 'both');

  const formatDate = (d: string) =>
    new Date(d).toLocaleDateString("ar-DZ", { year: "numeric", month: "long", day: "numeric" });

  if (!job) {
    return (
      <Layout>
        <div className="container py-20 text-center">
          <h1 className="font-heading text-2xl font-bold text-foreground mb-4">الوظيفة غير موجودة</h1>
          <p className="text-muted-foreground mb-6">عذراً، لم نتمكن من العثور على هذه الوظيفة.</p>
          <Link
            to="/jobs"
            className="inline-flex items-center gap-2 gradient-primary text-primary-foreground font-bold px-6 py-3 rounded-xl"
          >
            <ArrowRight className="w-4 h-4" />
            العودة للوظائف
          </Link>
        </div>
      </Layout>
    );
  }

  function handleApply() {
    if (!user) {
      toast.error("يرجى تسجيل الدخول أولاً للتقديم");
      return;
    }
    if (!hasAccess) {
      toast.error("يرجى الاشتراك أولاً للتقديم على الوظائف");
      return;
    }
    setApplying(true);
    setTimeout(() => {
      toast.success("تم إرسال طلبك بنجاح! سنتواصل معك قريباً.");
      setApplying(false);
    }, 1000);
  }

  return (
    <Layout>
      <div className="container py-8 max-w-3xl">
        <Link
          to="/jobs"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-primary transition-colors mb-6"
        >
          <ArrowRight className="w-4 h-4" />
          العودة لقائمة الوظائف
        </Link>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="gradient-card rounded-2xl border border-border/50 shadow-card overflow-hidden"
        >
          {/* Header - always visible */}
          <div className="p-6 sm:p-8 border-b border-border/30">
            <div className="flex items-start justify-between gap-3 mb-4">
              <h1 className="font-heading text-2xl sm:text-3xl font-bold text-foreground leading-relaxed">
                {job.titleAr}
              </h1>
              {job.isFeatured && (
                <span className="shrink-0 flex items-center gap-1 gradient-accent text-accent-foreground text-xs font-bold px-3 py-1 rounded-full">
                  <Star className="w-3.5 h-3.5" />
                  مميّز
                </span>
              )}
            </div>
            <p className="text-sm text-muted-foreground mb-5">{job.titleFr}</p>

            <div className="flex flex-wrap gap-3 text-sm">
              <span className="flex items-center gap-1.5 bg-muted/50 px-3 py-1.5 rounded-lg text-muted-foreground">
                <MapPin className="w-4 h-4 text-primary" />
                {countryNames[job.countryCode] || job.countryCode}
              </span>
              <span className="flex items-center gap-1.5 bg-muted/50 px-3 py-1.5 rounded-lg text-muted-foreground">
                <Building2 className="w-4 h-4 text-primary" />
                {job.sourceName} • {job.contractType}
              </span>
              {job.salaryText && (
                <span className="flex items-center gap-1.5 bg-accent/10 px-3 py-1.5 rounded-lg text-accent font-bold">
                  <Banknote className="w-4 h-4" />
                  {job.salaryText}
                </span>
              )}
            </div>

            {/* Share buttons */}
            <div className="flex items-center gap-2 mt-4">
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <Share2 className="w-3.5 h-3.5" />
                مشاركة:
              </span>
              <a
                href={`https://wa.me/?text=${encodeURIComponent(job.titleAr + " — " + window.location.href)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#25D366]/10 text-[#25D366] text-xs font-medium hover:bg-[#25D366]/20 transition-colors"
              >
                <MessageCircle className="w-3.5 h-3.5" />
                واتساب
              </a>
              <a
                href={`https://t.me/share/url?url=${encodeURIComponent(window.location.href)}&text=${encodeURIComponent(job.titleAr)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#0088cc]/10 text-[#0088cc] text-xs font-medium hover:bg-[#0088cc]/20 transition-colors"
              >
                <Send className="w-3.5 h-3.5" />
                تيليغرام
              </a>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(window.location.href);
                  toast.success("تم نسخ الرابط");
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-muted/50 text-muted-foreground text-xs font-medium hover:bg-muted transition-colors"
              >
                نسخ الرابط
              </button>
            </div>
          </div>

          {/* Content - locked for non-subscribers */}
          {hasAccess ? (
            <div className="p-6 sm:p-8 space-y-8">
              {/* Subscription info */}
              <div className="flex items-center justify-between flex-wrap gap-3 bg-accent/10 rounded-xl p-3">
                <div className="flex items-center gap-2">
                  <Crown className="w-4 h-4 text-accent" />
                  <span className="text-xs font-bold text-foreground">مشترك — وصول كامل</span>
                </div>
                <div className="flex gap-3 text-[10px] text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Calendar className="w-3 h-3 text-primary" />
                    من {formatDate(subscription!.starts_at)}
                  </span>
                  <span className="flex items-center gap-1">
                    <Calendar className="w-3 h-3 text-destructive" />
                    إلى {formatDate(subscription!.expires_at)}
                  </span>
                </div>
              </div>

              {job.descriptionAr && (
                <section>
                  <div className="flex items-center gap-2 mb-3">
                    <FileText className="w-5 h-5 text-primary" />
                    <h2 className="font-heading text-lg font-bold text-foreground">وصف الوظيفة</h2>
                  </div>
                  <p className="text-muted-foreground leading-relaxed text-sm">{job.descriptionAr}</p>
                </section>
              )}

              {job.requirementsAr && job.requirementsAr.length > 0 && (
                <section>
                  <div className="flex items-center gap-2 mb-3">
                    <CheckCircle2 className="w-5 h-5 text-primary" />
                    <h2 className="font-heading text-lg font-bold text-foreground">متطلبات التقديم</h2>
                  </div>
                  <ul className="space-y-2.5">
                    {job.requirementsAr.map((req, i) => (
                      <li key={i} className="flex items-start gap-2.5 text-sm text-muted-foreground">
                        <span className="mt-1 w-1.5 h-1.5 rounded-full bg-primary shrink-0" />
                        {req}
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {job.benefitsAr && job.benefitsAr.length > 0 && (
                <section>
                  <div className="flex items-center gap-2 mb-3">
                    <Gift className="w-5 h-5 text-accent" />
                    <h2 className="font-heading text-lg font-bold text-foreground">المزايا</h2>
                  </div>
                  <ul className="space-y-2.5">
                    {job.benefitsAr.map((b, i) => (
                      <li key={i} className="flex items-start gap-2.5 text-sm text-muted-foreground">
                        <span className="mt-1 w-1.5 h-1.5 rounded-full bg-accent shrink-0" />
                        {b}
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              <div className="flex flex-col sm:flex-row gap-3 pt-4 border-t border-border/30">
                <button
                  onClick={handleApply}
                  disabled={applying}
                  className="flex-1 flex items-center justify-center gap-2 gradient-primary text-primary-foreground font-bold py-3.5 rounded-xl transition-all hover:opacity-90 disabled:opacity-50"
                >
                  <Send className="w-4 h-4" />
                  {applying ? "جارٍ الإرسال..." : "تقديم طلب"}
                </button>
                {job.detailsUrl && (
                  <a
                    href={job.detailsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-1 flex items-center justify-center gap-2 border border-border/50 text-muted-foreground hover:text-foreground font-medium py-3.5 rounded-xl transition-colors hover:bg-muted/30"
                  >
                    <ExternalLink className="w-4 h-4" />
                    المصدر الرسمي
                  </a>
                )}
              </div>
            </div>
          ) : (
            /* Locked state */
            <div className="p-6 sm:p-8 relative">
              {/* Blurred preview */}
              <div className="space-y-6 blur-sm select-none pointer-events-none opacity-40">
                <div className="space-y-2">
                  <div className="h-4 bg-muted rounded w-24" />
                  <div className="h-3 bg-muted rounded w-full" />
                  <div className="h-3 bg-muted rounded w-5/6" />
                  <div className="h-3 bg-muted rounded w-4/6" />
                </div>
                <div className="space-y-2">
                  <div className="h-4 bg-muted rounded w-28" />
                  <div className="h-3 bg-muted rounded w-3/4" />
                  <div className="h-3 bg-muted rounded w-2/3" />
                </div>
                <div className="space-y-2">
                  <div className="h-4 bg-muted rounded w-20" />
                  <div className="h-3 bg-muted rounded w-4/5" />
                  <div className="h-3 bg-muted rounded w-3/5" />
                </div>
              </div>

              {/* Lock overlay */}
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="text-center bg-background/80 backdrop-blur-sm rounded-2xl p-8 border border-accent/30 max-w-sm mx-4">
                  <Lock className="w-10 h-10 text-accent mx-auto mb-3" />
                  <h3 className="font-heading text-lg font-bold text-foreground mb-2">محتوى مقفل</h3>
                  <p className="text-sm text-muted-foreground mb-5">
                    اشترك للوصول إلى تفاصيل الوظيفة الكاملة والتقديم المباشر
                  </p>
                  <Link
                    to={user ? "/pricing" : "/auth/register"}
                    className="inline-flex items-center gap-2 bg-accent hover:bg-accent/90 text-accent-foreground font-bold px-8 py-3 rounded-full transition-all shadow-lg"
                  >
                    اشترك الآن
                  </Link>
                </div>
              </div>
            </div>
          )}
        </motion.div>
      </div>
    </Layout>
  );
}
