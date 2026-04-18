import Layout from "@/components/Layout";
import SEO from "@/components/SEO";
import { motion } from "framer-motion";
import { Shield, Lock, Eye, FileText, Users, Globe, Mail, AlertTriangle } from "lucide-react";

const sections = [
  {
    icon: Eye,
    title: "جمع البيانات",
    content: `نقوم بجمع البيانات التالية عند استخدامك للمنصة:
• الاسم الكامل والبريد الإلكتروني ورقم الهاتف عند التسجيل
• معلومات الجهاز والمتصفح لأغراض أمنية
• بيانات الاشتراك والمعاملات المالية (وصولات الدفع CCP)
• معرّف تليجرام لإرسال الإشعارات`
  },
  {
    icon: Lock,
    title: "حماية البيانات",
    content: `نلتزم بحماية بياناتك الشخصية من خلال:
• تشفير جميع البيانات المنقولة عبر بروتوكول HTTPS
• تخزين البيانات في خوادم آمنة مع سياسات وصول صارمة
• عدم مشاركة بياناتك مع أطراف ثالثة دون موافقتك
• تقييد الوصول إلى البيانات الحساسة للمسؤولين المخوّلين فقط`
  },
  {
    icon: Globe,
    title: "استخدام البيانات",
    content: `نستخدم بياناتك للأغراض التالية فقط:
• تقديم خدمات المنصة وإدارة اشتراكك
• إرسال إشعارات متعلقة بحالة طلباتك عبر تليجرام أو البريد الإلكتروني
• تحسين تجربة المستخدم وأداء المنصة
• التحقق من هوية المستخدمين ومنع الاحتيال`
  },
  {
    icon: Users,
    title: "حقوق المستخدم",
    content: `يحق لك في أي وقت:
• طلب الاطلاع على بياناتك الشخصية المخزنة
• طلب تعديل أو تصحيح بياناتك
• طلب حذف حسابك وجميع بياناتك المرتبطة
• إلغاء الاشتراك في الإشعارات البريدية
• تقديم شكوى في حال الإخلال بخصوصيتك`
  },
  {
    icon: Mail,
    title: "الإشعارات والتواصل",
    content: `قد نتواصل معك عبر:
• البريد الإلكتروني لإشعارات حالة الاشتراك
• تليجرام للتنبيهات الفورية المتعلقة بالتأشيرات
• رسائل داخل المنصة للتحديثات المهمة
يمكنك التحكم في تفضيلات الإشعارات من إعدادات حسابك.`
  },
  {
    icon: AlertTriangle,
    title: "سياسة الأجهزة",
    content: `للحفاظ على أمان حسابك:
• يُسمح بتسجيل الدخول من جهازين كحد أقصى في نفس الوقت
• يتم تسجيل بصمة الجهاز والمتصفح ونظام التشغيل
• قد يتم تعطيل الحساب في حال اكتشاف نشاط مشبوه
• يحق للإدارة مراجعة الأجهزة النشطة لأي حساب`
  },
];

export default function PrivacyPolicy() {
  return (
    <Layout>
      <SEO
        title="سياسة الخصوصية — VisaRadar"
        description="تعرّف على كيفية جمع وحماية بياناتك الشخصية على منصة VisaRadar وحقوقك في الوصول إليها وتعديلها أو حذفها."
        path="/privacy"
      />
      <div className="container max-w-4xl py-12">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-12"
        >
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary/10 border border-primary/20 mb-6">
            <Shield className="w-8 h-8 text-primary" />
          </div>
          <h1 className="text-3xl font-heading font-bold text-foreground mb-3">سياسة الخصوصية</h1>
          <p className="text-muted-foreground">آخر تحديث: {new Date().toLocaleDateString('ar', { year: 'numeric', month: 'long', day: 'numeric' })}</p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="gradient-card rounded-2xl border border-border/50 p-6 mb-8"
        >
          <p className="text-muted-foreground leading-relaxed text-sm">
            نحن في <span className="text-primary font-bold">VisaRadar</span> نلتزم بحماية خصوصية مستخدمينا. 
            توضح هذه السياسة كيفية جمع واستخدام وحماية بياناتك الشخصية عند استخدامك لمنصتنا.
            باستخدامك للمنصة، فإنك توافق على الشروط الواردة في هذه السياسة.
          </p>
        </motion.div>

        <div className="space-y-6">
          {sections.map((section, i) => (
            <motion.div
              key={section.title}
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15 + i * 0.05 }}
              className="gradient-card rounded-2xl border border-border/50 p-6"
            >
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
                  <section.icon className="w-5 h-5 text-primary" />
                </div>
                <h2 className="text-lg font-heading font-bold text-foreground">{section.title}</h2>
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-line">{section.content}</p>
            </motion.div>
          ))}
        </div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.6 }}
          className="mt-10 text-center text-xs text-muted-foreground"
        >
          للاستفسارات المتعلقة بالخصوصية، تواصل معنا عبر الدعم الفني.
        </motion.div>
      </div>
    </Layout>
  );
}
