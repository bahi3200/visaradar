import { motion } from "framer-motion";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { useReducedMotion } from "@/hooks/useReducedMotion";

const faqs = [
  { q: "كيف تعمل خدمة تنبيهات التأشيرات؟", a: "نراقب مواقع مقدمي خدمات التأشيرات (VFS، TLS، BLS) كل 5 دقائق على مدار الساعة. فور توفر موعد جديد، نرسل لك تنبيهاً فورياً عبر تليغرام حتى تتمكن من الحجز قبل نفاد المواعيد." },
  { q: "ما الدول المتاحة حالياً للمراقبة؟", a: "حالياً نراقب مواعيد تأشيرات إيطاليا (VFS Global)، فرنسا (TLScontact)، وإسبانيا (BLS International). نعمل على إضافة دول جديدة باستمرار." },
  { q: "هل يمكنني استخدام حسابي على أكثر من جهاز؟", a: "يمكنك استخدام حسابك على جهازين كحد أقصى في نفس الوقت. هذا لحماية الخدمة وضمان جودتها لجميع المشتركين." },
  { q: "كيف أستقبل التنبيهات على تليغرام؟", a: "بعد الاشتراك، ستحصل على رابط بوت تليغرام الخاص بنا. فقط ابدأ محادثة مع البوت وأرسل معرّفك، وسيبدأ بإرسال التنبيهات إليك فوراً." },
  { q: "ما هي طرق الدفع المتاحة؟", a: "نقبل الدفع عبر CCP أو بريد موب (BaridiMob). بعد التحويل، ارفع صورة الوصل عند تقديم طلب الاشتراك وسيتم مراجعته وتفعيل حسابك خلال وقت قصير." },
  { q: "هل يمكنني تغيير الباقة أو تجديد اشتراكي؟", a: "نعم، يمكنك تقديم طلب اشتراك جديد بباقة مختلفة في أي وقت. سيتم تفعيل الباقة الجديدة بعد مراجعة الإدارة." },
];

export default function FAQSection() {
  const reduced = useReducedMotion();

  const container = {
    hidden: {},
    show: { transition: { staggerChildren: reduced ? 0.03 : 0.08 } },
  };

  const item = reduced
    ? { hidden: { opacity: 0 }, show: { opacity: 1, transition: { duration: 0.15 } } }
    : { hidden: { opacity: 0, x: -15 }, show: { opacity: 1, x: 0, transition: { type: "spring", stiffness: 200, damping: 25 } } };

  return (
    <section className="container py-14">
      <motion.div
        initial={reduced ? { opacity: 1 } : { opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-50px" }}
        className="text-center mb-8"
      >
        <h2 className="font-heading text-2xl md:text-3xl font-bold text-foreground mb-3">
          الأسئلة الشائعة
        </h2>
        <p className="text-sm text-muted-foreground">
          إجابات على أكثر الأسئلة تكراراً من مستخدمينا
        </p>
      </motion.div>

      <motion.div
        variants={container}
        initial="hidden"
        whileInView="show"
        viewport={{ once: true, margin: "-50px" }}
        className="max-w-2xl mx-auto"
      >
        <Accordion type="single" collapsible className="space-y-3">
          {faqs.map((faq, i) => (
            <motion.div key={i} variants={item}>
              <AccordionItem
                value={`faq-${i}`}
                className="gradient-card rounded-xl border border-border/50 px-5 shadow-card"
              >
                <AccordionTrigger className="text-right text-sm font-bold text-foreground hover:text-primary py-4 [&[data-state=open]]:text-primary">
                  {faq.q}
                </AccordionTrigger>
                <AccordionContent className="text-sm text-muted-foreground leading-relaxed pb-4">
                  {faq.a}
                </AccordionContent>
              </AccordionItem>
            </motion.div>
          ))}
        </Accordion>
      </motion.div>
    </section>
  );
}
