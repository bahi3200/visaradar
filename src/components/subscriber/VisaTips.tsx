import { motion } from "framer-motion";
import { Lightbulb, CheckCircle2 } from "lucide-react";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { useMemo } from "react";

const allTips = [
  "تأكد من أن جواز سفرك صالح لمدة 6 أشهر على الأقل قبل التقديم",
  "حضّر كشف حساب بنكي لآخر 3 أشهر كحد أدنى",
  "قدّم حجز فندق وتذكرة طيران ذهاب وإياب (يمكن أن تكون مؤقتة)",
  "تأمين سفر ساري المفعول يغطي منطقة شنغن بحد أدنى 30,000 يورو",
  "صور شخصية حديثة بخلفية بيضاء مقاس 3.5x4.5 سم",
  "خطاب دعوة إذا كنت ستزور عائلة أو أصدقاء",
  "لا تنسَ ترجمة الوثائق الرسمية عند الحاجة",
  "احجز موعدك مبكراً — المواعيد تنفد بسرعة!",
  "تحقق من متطلبات كل سفارة لأنها تختلف من بلد لآخر",
  "قدم ملفاً مرتباً ومنظماً — الانطباع الأول مهم",
];

export default function VisaTips() {
  const reduced = useReducedMotion();
  const noMotion = { opacity: 1, y: 0 };

  const tips = useMemo(() => {
    const shuffled = [...allTips].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, 5);
  }, []);

  return (
    <section className="container py-8 pb-16">
      <motion.div
        initial={reduced ? noMotion : { opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        className="relative rounded-2xl border border-accent/20 p-6 max-w-2xl mx-auto overflow-hidden bg-card"
      >
        {/* Decorative background */}
        <div className="absolute inset-0 bg-gradient-to-br from-accent/10 via-transparent to-primary/5" />
        <div className="absolute top-0 left-0 w-32 h-32 bg-accent/5 rounded-full -translate-x-1/2 -translate-y-1/2 blur-2xl" />

        <div className="relative">
          <div className="flex items-center gap-3 mb-5">
            <div className="w-10 h-10 rounded-xl gradient-accent flex items-center justify-center shadow-lg">
              <Lightbulb className="w-5 h-5 text-accent-foreground" />
            </div>
            <div>
              <h2 className="font-heading text-lg font-bold text-foreground">نصائح لتأشيرتك</h2>
              <p className="text-[10px] text-muted-foreground">نصائح مهمة لنجاح ملفك</p>
            </div>
          </div>
          <ul className="space-y-3.5">
            {tips.map((tip, i) => (
              <motion.li
                key={i}
                initial={reduced ? noMotion : { opacity: 0, x: -10 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ delay: 0.1 * i }}
                className="flex items-start gap-3 text-sm text-muted-foreground group"
              >
                <div className="w-5 h-5 rounded-full bg-accent/10 flex items-center justify-center shrink-0 mt-0.5 group-hover:bg-accent/20 transition-colors">
                  <CheckCircle2 className="w-3.5 h-3.5 text-accent" />
                </div>
                <span className="leading-relaxed">{tip}</span>
              </motion.li>
            ))}
          </ul>
        </div>
      </motion.div>
    </section>
  );
}
