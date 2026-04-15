import { motion } from "framer-motion";
import { Bell, Briefcase, FileText, Smartphone, CreditCard, Settings } from "lucide-react";
import { Link } from "react-router-dom";
import { useReducedMotion } from "@/hooks/useReducedMotion";

const links = [
  { icon: Bell, label: "تنبيهات التأشيرات", to: "/notification-settings", color: "text-accent", bg: "bg-accent/10" },
  { icon: Briefcase, label: "عقود العمل", to: "/jobs", color: "text-primary", bg: "bg-primary/10" },
  { icon: FileText, label: "طلباتي", to: "/my-requests", color: "text-orange-500", bg: "bg-orange-500/10" },
  { icon: Smartphone, label: "أجهزتي", to: "/my-devices", color: "text-green-500", bg: "bg-green-500/10" },
  { icon: CreditCard, label: "الباقات", to: "/pricing", color: "text-purple-500", bg: "bg-purple-500/10" },
  { icon: Settings, label: "الملف الشخصي", to: "/profile", color: "text-blue-400", bg: "bg-blue-400/10" },
];

export default function QuickLinks() {
  const reduced = useReducedMotion();
  const noMotion = { opacity: 1, y: 0, scale: 1 };

  return (
    <section className="container py-6">
      <motion.h2
        initial={reduced ? noMotion : { opacity: 0, y: 15 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        className="font-heading text-xl font-bold text-foreground text-center mb-4"
      >
        ⚡ اختصارات سريعة
      </motion.h2>
      <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
        {links.map((link, i) => (
          <motion.div
            key={link.label}
            initial={reduced ? noMotion : { opacity: 0, y: 15 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.05 * i }}
          >
            <Link
              to={link.to}
              className="gradient-card rounded-xl border border-border/50 p-3 flex flex-col items-center gap-2 text-center hover:border-accent/30 hover:shadow-lg transition-all group"
            >
              <div className={`w-10 h-10 rounded-lg ${link.bg} flex items-center justify-center group-hover:scale-110 transition-transform`}>
                <link.icon className={`w-5 h-5 ${link.color}`} />
              </div>
              <span className="text-[10px] font-bold text-foreground">{link.label}</span>
            </Link>
          </motion.div>
        ))}
      </div>
    </section>
  );
}
