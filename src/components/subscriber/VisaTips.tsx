import { motion } from "framer-motion";
import { Lightbulb, CheckCircle } from "lucide-react";
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
        initial={reduced ? noMotion : { opacity: 0, y: 15 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        className="gradient-card rounded-2xl border border-accent/20 p-6 max-w-2xl mx-auto"
      >
        <div className="flex items-center gap-2 mb-4">
          <div className="w-9 h-9 rounded-lg gradient-accent flex items-center justify-center">
            <Lightbulb className="w-4 h-4 text-accent-foreground" />
          </div>
          <h2 className="font-heading text-lg font-bold text-foreground">💡 نصائح لتأشيرتك</h2>
        </div>
        <ul className="space-y-3">
          {tips.map((tip, i) => (
            <motion.li
              key={i}
              initial={reduced ? noMotion : { opacity: 0, y: 10 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.1 * i }}
              className="flex items-start gap-2 text-sm text-muted-foreground"
            >
              <CheckCircle className="w-4 h-4 text-accent shrink-0 mt-0.5" />
              <span>{tip}</span>
            </motion.li>
          ))}
        </ul>
      </motion.div>
    </section>
  );
}
