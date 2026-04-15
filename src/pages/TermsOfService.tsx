import Layout from "@/components/Layout";
import { motion } from "framer-motion";
import { FileText, CheckCircle, XCircle, CreditCard, Ban, RefreshCw, Scale } from "lucide-react";

const sections = [
  {
    icon: CheckCircle,
    title: "قبول الشروط",
    content: `باستخدامك لمنصة VisaRadar فإنك توافق على:
• الالتزام بجميع الشروط والأحكام المذكورة أدناه
• تقديم معلومات صحيحة ودقيقة عند التسجيل والاشتراك
• عدم استخدام المنصة لأغراض غير مشروعة
• الالتزام بالقوانين المحلية والدولية المعمول بها`
  },
  {
    icon: CreditCard,
    title: "الاشتراكات والدفع",
    content: `فيما يخص الاشتراكات:
• يتم الدفع عبر تحويل CCP مع إرفاق وصل الدفع
• يتم مراجعة الوصولات يدوياً وبالذكاء الاصطناعي للتحقق من صحتها
• يبدأ الاشتراك فور موافقة الإدارة على الطلب
• لا يمكن استرداد المبالغ المدفوعة بعد تفعيل الاشتراك
• تحتفظ الإدارة بحق رفض أي طلب اشتراك مع توضيح السبب`
  },
  {
    icon: Ban,
    title: "الاستخدام المحظور",
    content: `يُحظر على المستخدمين:
• مشاركة حساباتهم أو بيانات تسجيل الدخول مع آخرين
• محاولة الوصول غير المصرح به لبيانات مستخدمين آخرين
• استخدام أدوات آلية لاستخراج البيانات من المنصة
• تقديم وصولات دفع مزورة أو معدّلة
• التحايل على نظام تقييد الأجهزة
• نشر محتوى مسيء أو مخالف للقوانين`
  },
  {
    icon: XCircle,
    title: "تعليق وإنهاء الحساب",
    content: `يحق للإدارة:
• تعليق أو تجميد الحساب مؤقتاً عند الاشتباه في مخالفة الشروط
• حذف الحساب نهائياً في حالات المخالفات الجسيمة
• تعطيل الاشتراك دون إنذار مسبق في حالة الاحتيال
• إرسال إشعار للمستخدم عبر البريد أو تليجرام عند أي إجراء
يمكن للمستخدم الطعن في القرار عبر التواصل مع الدعم الفني.`
  },
  {
    icon: RefreshCw,
    title: "تعديل الشروط",
    content: `نحتفظ بالحق في تعديل هذه الشروط في أي وقت:
• سيتم إشعار المستخدمين بالتغييرات الجوهرية عبر المنصة
• استمرار استخدام المنصة بعد التعديل يعتبر قبولاً للشروط الجديدة
• يمكن للمستخدم إلغاء حسابه إذا لم يوافق على الشروط المعدّلة`
  },
  {
    icon: Scale,
    title: "حدود المسؤولية",
    content: `نوضح أن:
• المنصة تقدم خدمة إعلامية وتنبيهية فقط ولا تضمن الحصول على تأشيرة
• لا نتحمل مسؤولية أي خسائر ناتجة عن تأخر الإشعارات أو انقطاع الخدمة
• المعلومات المقدمة استرشادية وقد تتغير حسب الجهات المختصة
• المستخدم مسؤول عن التحقق من المعلومات مباشرة من المصادر الرسمية`
  },
];

export default function TermsOfService() {
  return (
    <Layout>
      <div className="container max-w-4xl py-12">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-12"
        >
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-accent/10 border border-accent/20 mb-6">
            <FileText className="w-8 h-8 text-accent" />
          </div>
          <h1 className="text-3xl font-heading font-bold text-foreground mb-3">شروط الاستخدام</h1>
          <p className="text-muted-foreground">آخر تحديث: {new Date().toLocaleDateString('ar', { year: 'numeric', month: 'long', day: 'numeric' })}</p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="gradient-card rounded-2xl border border-border/50 p-6 mb-8"
        >
          <p className="text-muted-foreground leading-relaxed text-sm">
            مرحباً بك في <span className="text-primary font-bold">VisaRadar</span>. 
            يرجى قراءة هذه الشروط بعناية قبل استخدام المنصة. 
            باستخدامك للمنصة أو التسجيل فيها، فإنك توافق على الالتزام بهذه الشروط والأحكام.
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
                <div className="w-10 h-10 rounded-xl bg-accent/10 border border-accent/20 flex items-center justify-center shrink-0">
                  <section.icon className="w-5 h-5 text-accent" />
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
          للاستفسارات، تواصل معنا عبر الدعم الفني.
        </motion.div>
      </div>
    </Layout>
  );
}
