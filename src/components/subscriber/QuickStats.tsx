import { motion } from "framer-motion";
import { Globe, Bell, Shield } from "lucide-react";
import { useReducedMotion } from "@/hooks/useReducedMotion";

interface Props {
  countries: string[];
  serviceType: string;
}

const countryNames: Record<string, string> = {
  IT: "🇮🇹 إيطاليا",
  FR: "🇫🇷 فرنسا",
  ES: "🇪🇸 إسبانيا",
};

export default function QuickStats({ countries, serviceType }: Props) {
  const reduced = useReducedMotion();
  const noMotion = { opacity: 1, y: 0 };

  const stats = [
    {
      icon: Globe,
      label: "الدول المراقبة",
      value: countries.map((c) => countryNames[c] || c).join("، ") || "—",
      gradient: "from-primary/20 to-primary/5",
      iconBg: "gradient-primary",
      iconColor: "text-primary-foreground",
      border: "border-primary/20",
    },
    {
      icon: Bell,
      label: "نوع الخدمة",
      value: serviceType === "visa" ? "تنبيهات تأشيرات" : serviceType === "jobs" ? "عقود عمل" : "تأشيرات + عقود",
      gradient: "from-accent/20 to-accent/5",
      iconBg: "gradient-accent",
      iconColor: "text-accent-foreground",
      border: "border-accent/20",
    },
    {
      icon: Shield,
      label: "حالة الحساب",
      value: "نشط ✅",
      gradient: "from-green-500/20 to-green-500/5",
      iconBg: "bg-green-500",
      iconColor: "text-white",
      border: "border-green-500/20",
    },
  ];

  return (
    <section className="container py-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {stats.map((s, i) => (
          <motion.div
            key={s.label}
            initial={reduced ? noMotion : { opacity: 0, y: 15, scale: 0.95 }}
            whileInView={{ opacity: 1, y: 0, scale: 1 }}
            viewport={{ once: true }}
            transition={{ delay: 0.1 * i, type: "spring", stiffness: 200, damping: 20 }}
            className={`relative bg-card rounded-2xl border ${s.border} p-4 flex items-center gap-3 overflow-hidden`}
          >
            <div className={`absolute inset-0 bg-gradient-to-br ${s.gradient} opacity-50`} />
            <div className={`w-10 h-10 rounded-xl ${s.iconBg} flex items-center justify-center shrink-0 shadow-lg relative`}>
              <s.icon className={`w-5 h-5 ${s.iconColor}`} />
            </div>
            <div className="relative">
              <p className="text-[10px] text-muted-foreground/70">{s.label}</p>
              <p className="text-sm font-bold text-foreground">{s.value}</p>
            </div>
          </motion.div>
        ))}
      </div>
    </section>
  );
}
