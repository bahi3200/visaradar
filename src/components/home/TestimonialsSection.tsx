import { motion } from "framer-motion";
import { Star, Quote } from "lucide-react";
import { useReducedMotion } from "@/hooks/useReducedMotion";

const testimonials = [
  { name: "أحمد ب.", role: "مشترك - تأشيرة إيطاليا", text: "بفضل التنبيهات الفورية، تمكّنت من حجز موعد فيزا إيطاليا بعد أسبوع فقط من الاشتراك. خدمة ممتازة!", rating: 5, flag: "🇮🇹" },
  { name: "سارة م.", role: "مشتركة - الباقة الشاملة", text: "الباقة الشاملة وفرت عليّ الوقت والجهد. تنبيهات الفيزا + عروض العمل في مكان واحد. أنصح بها بشدة.", rating: 5, flag: "🇫🇷" },
  { name: "كريم ل.", role: "مشترك - تأشيرة فرنسا", text: "كنت أتابع الموقع يومياً لأشهر بدون فائدة. مع هذه الخدمة، وصلني التنبيه في الوقت المناسب وحجزت موعدي.", rating: 5, flag: "🇫🇷" },
  { name: "نور الدين ع.", role: "مشترك - عقود العمل", text: "وجدت عقد عمل في كندا عبر المنصة. المعلومات كانت دقيقة ومحدّثة. شكراً لكم!", rating: 5, flag: "🇨🇦" },
];

export default function TestimonialsSection() {
  const reduced = useReducedMotion();

  const container = {
    hidden: {},
    show: { transition: { staggerChildren: reduced ? 0.05 : 0.12 } },
  };

  const item = reduced
    ? { hidden: { opacity: 0 }, show: { opacity: 1, transition: { duration: 0.2 } } }
    : { hidden: { opacity: 0, y: 25 }, show: { opacity: 1, y: 0, transition: { type: "spring", stiffness: 150, damping: 20 } } };

  return (
    <section className="py-16 relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-accent/[0.02] to-transparent pointer-events-none" />

      <div className="container relative">
        <motion.div
          initial={reduced ? { opacity: 1 } : { opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
        >
          <div className="text-center mb-10">
            <motion.div initial={reduced ? { opacity: 1 } : { opacity: 0, scale: 0.8 }} whileInView={{ opacity: 1, scale: 1 }} viewport={{ once: true }} className="inline-flex items-center gap-2 bg-accent/10 text-accent text-xs font-bold px-4 py-1.5 rounded-full mb-4">
              <Star className="w-3.5 h-3.5 fill-accent" />
              آراء المشتركين
            </motion.div>
            <motion.h2 initial={reduced ? { opacity: 1 } : { opacity: 0, y: 15 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "-50px" }} className="font-heading text-2xl md:text-3xl font-bold text-foreground mb-2">
              ماذا يقول مشتركونا؟
            </motion.h2>
            <motion.p initial={reduced ? { opacity: 1 } : { opacity: 0, y: 10 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "-50px" }} transition={reduced ? { duration: 0 } : { delay: 0.1 }} className="text-sm text-muted-foreground">تجارب حقيقية من مستخدمي المنصة</motion.p>
          </div>

          <motion.div
            variants={container}
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, margin: "-50px" }}
            className="grid md:grid-cols-2 gap-4 max-w-4xl mx-auto"
          >
            {testimonials.map((t) => (
              <motion.div
                key={t.name}
                variants={item}
                {...(!reduced && {
                  whileHover: { y: -6, scale: 1.02, transition: { type: "spring", stiffness: 300, damping: 20 } },
                })}
                className="gradient-card rounded-2xl border border-border/50 p-5 shadow-card hover:border-accent/20 hover:shadow-[0_10px_30px_-8px_hsl(var(--accent)/0.2)] transition-all cursor-default relative"
              >
                <Quote className="absolute top-4 left-4 w-8 h-8 text-accent/10" />
                <div className="flex gap-0.5 mb-3">
                  {[...Array(t.rating)].map((_, j) => (
                    <Star key={j} className="w-3.5 h-3.5 fill-accent text-accent" />
                  ))}
                </div>
                <p className="text-sm text-muted-foreground leading-relaxed mb-4">"{t.text}"</p>
                <div className="flex items-center gap-3 pt-3 border-t border-border/30">
                  <div className="w-9 h-9 rounded-full gradient-accent flex items-center justify-center text-accent-foreground font-bold text-sm">
                    {t.name.charAt(0)}
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-bold text-foreground">{t.name}</p>
                    <p className="text-xs text-muted-foreground">{t.role}</p>
                  </div>
                  <span className="text-xl">{t.flag}</span>
                </div>
              </motion.div>
            ))}
          </motion.div>
        </motion.div>
      </div>
    </section>
  );
}
