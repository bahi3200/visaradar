import { useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  Github,
  ShieldAlert,
  Lock,
  RefreshCw,
  UserX,
  GitBranch,
  Wifi,
  KeyRound,
  ExternalLink,
  HelpCircle,
} from "lucide-react";
import AdminLayout from "@/components/AdminLayout";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

type Severity = "high" | "medium" | "low";

interface Issue {
  id: string;
  icon: typeof Github;
  title: string;
  severity: Severity;
  symptoms: string[];
  causes: string[];
  fixes: string[];
  link?: { label: string; url: string };
}

const ISSUES: Issue[] = [
  {
    id: "popup-blocked",
    icon: ShieldAlert,
    title: "نافذة التفويض لا تفتح أو تُغلق فوراً",
    severity: "high",
    symptoms: [
      "النقر على Connect لا يفتح GitHub.",
      "تظهر نافذة وتختفي مباشرة دون أي رسالة.",
    ],
    causes: [
      "المتصفح يحجب النوافذ المنبثقة (Popup blocker).",
      "إضافات حماية الخصوصية (uBlock, AdGuard, Brave Shields) تعترض الـ redirect.",
      "وضع التصفح المتخفّي يمنع cookies الطرف الثالث.",
    ],
    fixes: [
      "اسمح بالنوافذ المنبثقة لموقع lovable.app في إعدادات المتصفح.",
      "عطّل مؤقتاً Brave Shields / uBlock على هذه الصفحة ثم أعد المحاولة.",
      "جرّب متصفحاً عادياً (Chrome / Edge) بدلاً من وضع Incognito.",
    ],
  },
  {
    id: "app-not-installed",
    icon: Lock,
    title: 'خطأ "Lovable GitHub App not installed"',
    severity: "high",
    symptoms: [
      "بعد تسجيل الدخول إلى GitHub تظهر صفحة بيضاء أو خطأ 404.",
      'تعود إلى Lovable مع رسالة "App not installed".',
    ],
    causes: [
      "لم يتم تثبيت تطبيق Lovable GitHub على حسابك أو منظمتك.",
      "تم تثبيته على حساب شخصي بينما تحاول إنشاء repo داخل organization.",
    ],
    fixes: [
      "افتح الرابط أدناه وثبّت التطبيق على الحساب الصحيح.",
      'عند التثبيت اختر "All repositories" أو حدّد المستودع الجديد يدوياً.',
      "إذا كنت ضمن منظمة فقد يحتاج المالك للموافقة على التثبيت.",
    ],
    link: {
      label: "تثبيت Lovable GitHub App",
      url: "https://github.com/apps/gpt-engineer-app/installations/new",
    },
  },
  {
    id: "org-restrictions",
    icon: UserX,
    title: "المنظمة (Organization) ترفض التفويض",
    severity: "high",
    symptoms: [
      'رسالة "Your organization has restricted OAuth app access".',
      "لا تظهر المنظمة في قائمة الحسابات أثناء الربط.",
    ],
    causes: [
      "إعدادات OAuth App access policy في المنظمة على Restricted.",
      "صلاحياتك في المنظمة لا تسمح بتثبيت تطبيقات.",
    ],
    fixes: [
      "اطلب من مالك المنظمة الموافقة على تطبيق Lovable من Settings → Third-party Access.",
      "أو أنشئ المستودع تحت حسابك الشخصي ثم انقله إلى المنظمة لاحقاً.",
    ],
    link: {
      label: "Org → Third-party Access",
      url: "https://github.com/settings/connections/applications",
    },
  },
  {
    id: "scopes-missing",
    icon: KeyRound,
    title: "صلاحيات (Scopes) ناقصة بعد الموافقة",
    severity: "medium",
    symptoms: [
      "ينجح تسجيل الدخول لكن إنشاء الـ repo يفشل.",
      'رسائل من نوع "insufficient permissions" أو 403.',
    ],
    causes: [
      "ضغطت Authorize دون منح صلاحية repo / workflow.",
      "تم سحب الصلاحيات لاحقاً من GitHub Settings.",
    ],
    fixes: [
      "افصل التطبيق من GitHub ثم أعد ربطه من Lovable واقبل كل الصلاحيات.",
      "تأكد من تفعيل صلاحيتي Contents (Read/Write) و Workflows.",
    ],
    link: {
      label: "GitHub → Authorized Apps",
      url: "https://github.com/settings/applications",
    },
  },
  {
    id: "already-linked",
    icon: GitBranch,
    title: "حساب GitHub آخر مربوط مسبقاً بـ Lovable",
    severity: "medium",
    symptoms: [
      'رسالة "Account already connected to another Lovable user".',
      "لا تظهر نافذة إنشاء repo بل خيار Disconnect فقط.",
    ],
    causes: [
      "كل حساب Lovable يربط حساب GitHub واحد فقط في الوقت نفسه.",
      "تم الربط سابقاً بحساب مختلف ولم يُفصل.",
    ],
    fixes: [
      "اذهب إلى Lovable Account Settings → Integrations → GitHub → Disconnect.",
      "ثم أعد الربط بالحساب الصحيح.",
    ],
  },
  {
    id: "token-expired",
    icon: RefreshCw,
    title: "Token منتهي الصلاحية أو تم إبطاله",
    severity: "medium",
    symptoms: [
      "كان الربط يعمل سابقاً ثم توقف فجأة.",
      'رسائل 401 Unauthorized أو "Bad credentials".',
    ],
    causes: [
      "غيّرت كلمة مرور GitHub أو فعّلت 2FA بعد الربط.",
      "أبطلت التطبيق من GitHub Settings عن غير قصد.",
    ],
    fixes: [
      "افصل GitHub من Lovable ثم أعد ربطه (تحديث Token تلقائياً).",
      "تأكد من أن التطبيق ما زال موجوداً في Authorized OAuth Apps.",
    ],
  },
  {
    id: "repo-exists",
    icon: AlertTriangle,
    title: 'فشل إنشاء المستودع: "Repository already exists"',
    severity: "low",
    symptoms: [
      "يظهر خطأ عند الضغط على Create Repository.",
      "اسم المستودع المقترح موجود مسبقاً.",
    ],
    causes: [
      "يوجد repo بنفس الاسم في حسابك (حتى لو كان private).",
    ],
    fixes: [
      "غيّر اسم المشروع في Lovable قبل الربط، أو احذف الـ repo القديم من GitHub.",
    ],
  },
  {
    id: "network",
    icon: Wifi,
    title: "أخطاء شبكة / VPN / Firewall",
    severity: "low",
    symptoms: [
      "Timeout أثناء إعادة التوجيه إلى GitHub.",
      'رسالة "Failed to fetch" في console.',
    ],
    causes: [
      "VPN يحجب نطاق github.com أو lovable.app.",
      "جدار حماية الشركة يعترض OAuth callbacks.",
    ],
    fixes: [
      "عطّل VPN مؤقتاً وأعد المحاولة.",
      "جرّب من شبكة منزلية أو بيانات الهاتف للتأكد.",
    ],
  },
];

const severityStyles: Record<Severity, { label: string; cls: string }> = {
  high: { label: "خطير", cls: "bg-destructive/15 text-destructive border-destructive/30" },
  medium: { label: "متوسط", cls: "bg-warning/15 text-warning-foreground border-warning/30" },
  low: { label: "بسيط", cls: "bg-muted text-muted-foreground border-border" },
};

function IssueCard({ issue }: { issue: Issue }) {
  const [open, setOpen] = useState(false);
  const Icon = issue.icon;
  const sev = severityStyles[issue.severity];

  return (
    <Card className="overflow-hidden">
      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleTrigger className="w-full text-right">
          <div className="flex items-center gap-3 p-4 hover:bg-muted/30 transition-colors">
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
              <Icon className="w-5 h-5 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-medium text-sm">{issue.title}</span>
                <Badge variant="outline" className={`text-[10px] ${sev.cls}`}>
                  {sev.label}
                </Badge>
              </div>
            </div>
            <ChevronDown
              className={`w-4 h-4 text-muted-foreground shrink-0 transition-transform ${
                open ? "rotate-180" : ""
              }`}
            />
          </div>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="px-4 pb-4 space-y-4 border-t border-border/50 pt-4">
            <Section title="الأعراض" items={issue.symptoms} tone="muted" />
            <Section title="الأسباب المحتملة" items={issue.causes} tone="warning" />
            <Section title="خطوات الإصلاح" items={issue.fixes} tone="success" />
            {issue.link && (
              <a
                href={issue.link.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex"
              >
                <Button size="sm" variant="outline">
                  <ExternalLink className="w-3.5 h-3.5 ml-2" />
                  {issue.link.label}
                </Button>
              </a>
            )}
          </div>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}

function Section({
  title,
  items,
  tone,
}: {
  title: string;
  items: string[];
  tone: "muted" | "warning" | "success";
}) {
  const toneCls =
    tone === "success"
      ? "text-emerald-500"
      : tone === "warning"
      ? "text-warning"
      : "text-muted-foreground";
  const Bullet = tone === "success" ? CheckCircle2 : tone === "warning" ? AlertTriangle : HelpCircle;
  return (
    <div>
      <div className={`text-xs font-semibold mb-2 ${toneCls}`}>{title}</div>
      <ul className="space-y-1.5">
        {items.map((it, i) => (
          <li key={i} className="flex items-start gap-2 text-xs text-foreground/90 leading-relaxed">
            <Bullet className={`w-3.5 h-3.5 mt-0.5 shrink-0 ${toneCls}`} />
            <span>{it}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function AdminGitHubTroubleshoot() {
  return (
    <AdminLayout
      title="استكشاف أخطاء ربط GitHub"
      subtitle="أسباب فشل التفويض الشائعة وحلول مباشرة"
    >
      <div className="space-y-6 max-w-4xl">
        <Card className="p-5 bg-gradient-to-br from-primary/5 to-transparent border-primary/20">
          <div className="flex items-start gap-3">
            <Github className="w-6 h-6 text-primary shrink-0 mt-0.5" />
            <div className="space-y-2">
              <h2 className="font-heading text-lg">قبل البدء</h2>
              <p className="text-xs text-muted-foreground leading-relaxed">
                إذا واجهتك مشكلة عند ربط مشروع Lovable بـ GitHub، اختر السيناريو الأقرب
                لمشكلتك من القائمة أدناه واتبع خطوات الإصلاح. معظم المشاكل تُحل خلال
                دقيقة بإعادة تثبيت تطبيق Lovable GitHub أو فصل/إعادة ربط الحساب.
              </p>
              <div className="flex flex-wrap gap-2 pt-2">
                <a
                  href="https://github.com/apps/gpt-engineer-app/installations/new"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <Button size="sm">
                    <Github className="w-3.5 h-3.5 ml-2" />
                    إعادة تثبيت Lovable App
                  </Button>
                </a>
                <a
                  href="https://docs.lovable.dev/integrations/github"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <Button size="sm" variant="outline">
                    <ExternalLink className="w-3.5 h-3.5 ml-2" />
                    دليل التوثيق الرسمي
                  </Button>
                </a>
              </div>
            </div>
          </div>
        </Card>

        <div className="space-y-3">
          {ISSUES.map((issue) => (
            <IssueCard key={issue.id} issue={issue} />
          ))}
        </div>

        <Card className="p-4 text-xs text-muted-foreground space-y-1.5">
          <div className="font-semibold text-foreground">لم تجد المشكلة؟</div>
          <div>1. افتح Console المتصفح (F12) وانسخ أول رسالة خطأ حمراء.</div>
          <div>
            2. جرّب الربط من متصفح مختلف وحساب GitHub مختلف لعزل المشكلة.
          </div>
          <div>
            3. تواصل مع الدعم عبر صفحة <code>/contact</code> مع لقطة شاشة من رسالة الخطأ.
          </div>
        </Card>
      </div>
    </AdminLayout>
  );
}