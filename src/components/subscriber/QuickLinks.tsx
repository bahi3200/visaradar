import { motion } from "framer-motion";
import { Bell, Briefcase, FileText, Smartphone, CreditCard, Settings, LayoutDashboard } from "lucide-react";
import { Link } from "react-router-dom";
import { useReducedMotion } from "@/hooks/useReducedMotion";

const userLinks = [
  { icon: Bell, label: "تنبيهات التأشيرات", to: "/notification-settings", gradient: "from-accent/20 to-accent/5", iconBg: "gradient-accent", iconColor: "text-accent-foreground", border: "border-accent/20" },
  { icon: Briefcase, label: "عقود العمل", to: "/jobs", gradient: "from-primary/20 to-primary/5", iconBg: "gradient-primary", iconColor: "text-primary-foreground", border: "border-primary/20" },
  { icon: FileText, label: "طلباتي", to: "/my-requests", gradient: "from-orange-500/20 to-orange-500/5", iconBg: "bg-orange-500", iconColor: "text-white", border: "border-orange-500/20" },
  { icon: Smartphone, label: "أجهزتي", to: "/my-devices", gradient: "from-green-500/20 to-green-500/5", iconBg: "bg-green-500", iconColor: "text-white", border: "border-green-500/20" },
  { icon: CreditCard, label: "الباقات", to: "/pricing", gradient: "from-purple-500/20 to-purple-500/5", iconBg: "bg-purple-500", iconColor: "text-white", border: "border-purple-500/20" },
  { icon: Settings, label: "الملف الشخصي", to: "/profile", gradient: "from-blue-400/20 to-blue-400/5", iconBg: "bg-blue-400", iconColor: "text-white", border: "border-blue-400/20" },
];

const adminLink = { icon: LayoutDashboard, label: "لوحة التحكم", to: "/dashboard", gradient: "from-red-500/20 to-red-500/5", iconBg: "bg-red-500", iconColor: "text-white", border: "border-red-500/20" };

interface Props {
  isAdmin?: boolean;
}

export default function QuickLinks({ isAdmin }: Props) {
  const reduced = useReducedMotion();
  const noMotion = { opacity: 1, y: 0, scale: 1 };
  const links = isAdmin ? [adminLink, ...userLinks] : userLinks;

  return (
    <section className="container py-8">
      <motion.h2
        initial={reduced ? noMotion : { opacity: 0, y: 15 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        className="font-heading text-xl font-bold text-foreground text-center mb-1"
      >
        ⚡ اختصارات سريعة
      </motion.h2>
      <motion.p
        initial={reduced ? noMotion : { opacity: 0 }}
        whileInView={{ opacity: 1 }}
        viewport={{ once: true }}
        className="text-xs text-muted-foreground text-center mb-5"
      >
        وصول مباشر لأهم الخدمات
      </motion.p>
      <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
        {links.map((link, i) => (
          <motion.div
            key={link.label}
            initial={reduced ? noMotion : { opacity: 0, y: 15, scale: 0.9 }}
            whileInView={{ opacity: 1, y: 0, scale: 1 }}
            viewport={{ once: true }}
            transition={{ delay: 0.05 * i, type: "spring", stiffness: 200, damping: 20 }}
          >
            <Link
              to={link.to}
              className={`relative rounded-2xl border ${link.border} p-3.5 flex flex-col items-center gap-2 text-center hover:shadow-xl transition-all group overflow-hidden bg-card`}
            >
              <div className={`absolute inset-0 bg-gradient-to-br ${link.gradient} opacity-40 group-hover:opacity-70 transition-opacity`} />
              <div className={`w-11 h-11 rounded-xl ${link.iconBg} flex items-center justify-center group-hover:scale-110 group-hover:rotate-3 transition-transform relative shadow-lg`}>
                <link.icon className={`w-5 h-5 ${link.iconColor}`} />
              </div>
              <span className="text-[10px] font-bold text-foreground relative">{link.label}</span>
            </Link>
          </motion.div>
        ))}
      </div>
    </section>
  );
}
