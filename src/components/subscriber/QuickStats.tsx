import { motion } from "framer-motion";
import { Bell, Globe, Shield, Briefcase } from "lucide-react";
import { useReducedMotion } from "@/hooks/useReducedMotion";

interface Props {
  countries: string[];
  serviceType: string;
}

const countryNames: Record<string, string> = {
  IT: "إيطاليا 🇮🇹",
  FR: "فرنسا 🇫🇷",
  ES: "إسبانيا 🇪🇸",
};

export default function QuickStats({ countries, serviceType }: Props) {
  const reduced = useReducedMotion();
  const noMotion = { opacity: 1, y: 0 };

  const stats = [
    {
      icon: Globe,
      label: "الدول المراقبة",
      value: countries.map((c) => countryNames[c] || c).join("، ") || "لا يوجد",
      color: "text-primary",
      bg: "bg-primary/10",
    },
    {
      icon: Bell,
      label: "نوع الخدمة",
      value: serviceType === "visa" ? "تنبيهات تأشيرات" : serviceType === "jobs" ? "عقود عمل" : "تأشيرات + عقود",
      color: "text-accent",
      bg: "bg-accent/10",
    },
    {
      icon: Shield,
      label: "حالة الحساب",
      value: "نشط ✅",
      color: "text-green-500",
      bg: "bg-green-500/10",
    },
  ];

  return (
    <section className="container py-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {stats.map((s, i) => (
          <motion.div
            key={s.label}
            initial={reduced ? noMotion : { opacity: 0, y: 15 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.1 * i }}
            className="gradient-card rounded-xl border border-border/50 p-4 flex items-center gap-3"
          >
            <div className={`w-10 h-10 rounded-lg ${s.bg} flex items-center justify-center shrink-0`}>
              <s.icon className={`w-5 h-5 ${s.color}`} />
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground">{s.label}</p>
              <p className="text-sm font-bold text-foreground">{s.value}</p>
            </div>
          </motion.div>
        ))}
      </div>
    </section>
  );
}
