import { motion } from "framer-motion";
import { UserPlus, CreditCard, Bell, CheckCircle2 } from "lucide-react";
import { useReducedMotion } from "@/hooks/useReducedMotion";

const steps = [
  { icon: UserPlus, title: "أنشئ حسابك", desc: "سجّل بالبريد الإلكتروني ورقم تليغرام في أقل من دقيقة", num: "١" },
  { icon: CreditCard, title: "اختر باقتك", desc: "اختر الباقة المناسبة وأرسل وصل الدفع CCP", num: "٢" },
  { icon: CheckCircle2, title: "تأكيد الاشتراك", desc: "يتم مراجعة وصلك وتفعيل حسابك خلال ساعات", num: "٣" },
  { icon: Bell, title: "استقبل التنبيهات", desc: "تصلك إشعارات فورية على تليغرام عند فتح المواعيد", num: "٤" },
];

export default function HowItWorksSection() {
  const reduced = useReducedMotion();

  const container = {
    hidden: {},
    show: { transition: { staggerChildren: reduced ? 0.05 : 0.15 } },
  };

  const item = reduced
    ? { hidden: { opacity: 0 }, show: { opacity: 1, transition: { duration: 0.2 } } }
    : { hidden: { opacity: 0, y: 30 }, show: { opacity: 1, y: 0, transition: { type: "spring", stiffness: 150, damping: 20 } } };

  return (
    <section className="container py-16">
      <motion.div
        initial={reduced ? { opacity: 1 } : { opacity: 0 }}
        whileInView={{ opacity: 1 }}
        viewport={{ once: true }}
      >
        <motion.h2
          initial={reduced ? { opacity: 1 } : { opacity: 0, y: 15 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-50px" }}
          className="font-heading text-2xl md:text-3xl font-bold text-foreground text-center mb-2"
        >
          كيف يعمل؟
        </motion.h2>
        <motion.p
          initial={reduced ? { opacity: 1 } : { opacity: 0, y: 10 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-50px" }}
          transition={reduced ? { duration: 0 } : { delay: 0.1 }}
          className="text-sm text-muted-foreground text-center mb-10"
        >
          4 خطوات بسيطة للبدء
        </motion.p>

        <motion.div
          variants={container}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, margin: "-50px" }}
          className="grid grid-cols-2 md:grid-cols-4 gap-4 max-w-4xl mx-auto"
        >
          {steps.map((step) => (
            <motion.div
              key={step.num}
              variants={item}
              {...(!reduced && {
                whileHover: { y: -8, transition: { type: "spring", stiffness: 300, damping: 20 } },
              })}
              className="relative gradient-card rounded-2xl border border-border/50 p-5 text-center shadow-card group hover:border-accent/30 hover:shadow-[0_12px_35px_-10px_hsl(var(--accent)/0.2)] transition-all cursor-default"
            >
              <div className="absolute -top-3 right-4 w-7 h-7 rounded-full gradient-accent flex items-center justify-center text-accent-foreground text-xs font-black shadow-lg">
                {step.num}
              </div>
              <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mx-auto mb-3 group-hover:bg-primary/20 group-hover:scale-110 transition-all duration-300">
                <step.icon className="w-6 h-6 text-primary" />
              </div>
              <h3 className="font-heading text-sm font-bold text-foreground mb-1 group-hover:text-accent transition-colors">{step.title}</h3>
              <p className="text-xs text-muted-foreground leading-relaxed">{step.desc}</p>
            </motion.div>
          ))}
        </motion.div>
      </motion.div>
    </section>
  );
}
