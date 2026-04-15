import { motion } from "framer-motion";
import { Users, FileText, Bell, CreditCard } from "lucide-react";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Link } from "react-router-dom";

export default function AdminStats() {
  const reduced = useReducedMotion();
  const noMotion = { opacity: 1, y: 0 };

  const { data: stats } = useQuery({
    queryKey: ["admin-home-stats"],
    queryFn: async () => {
      const [subs, pending, notifs, users] = await Promise.all([
        supabase.from("subscriptions").select("id", { count: "exact", head: true }).eq("status", "active"),
        supabase.from("subscription_requests").select("id", { count: "exact", head: true }).eq("status", "pending"),
        supabase.from("visa_notifications").select("id", { count: "exact", head: true }),
        supabase.from("profiles").select("id", { count: "exact", head: true }),
      ]);
      return {
        activeSubscriptions: subs.count ?? 0,
        pendingRequests: pending.count ?? 0,
        totalNotifications: notifs.count ?? 0,
        totalUsers: users.count ?? 0,
      };
    },
  });

  const cards = [
    { icon: Users, label: "المستخدمين", value: stats?.totalUsers ?? "—", gradient: "from-primary/20 to-primary/5", iconBg: "gradient-primary", iconColor: "text-primary-foreground", border: "border-primary/20", to: "/dashboard/users" },
    { icon: CreditCard, label: "اشتراكات نشطة", value: stats?.activeSubscriptions ?? "—", gradient: "from-green-500/20 to-green-500/5", iconBg: "bg-green-500", iconColor: "text-white", border: "border-green-500/20", to: "/dashboard/requests" },
    { icon: FileText, label: "طلبات معلقة", value: stats?.pendingRequests ?? "—", gradient: "from-orange-500/20 to-orange-500/5", iconBg: "bg-orange-500", iconColor: "text-white", border: "border-orange-500/20", to: "/dashboard/requests" },
    { icon: Bell, label: "التنبيهات", value: stats?.totalNotifications ?? "—", gradient: "from-accent/20 to-accent/5", iconBg: "gradient-accent", iconColor: "text-accent-foreground", border: "border-accent/20", to: "/dashboard/notifications" },
  ];

  return (
    <section className="container py-6 -mt-6 relative z-10">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {cards.map((card, i) => (
          <motion.div
            key={card.label}
            initial={reduced ? noMotion : { opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ delay: 0.1 * i, type: "spring", stiffness: 200, damping: 20 }}
          >
            <Link
              to={card.to}
              className={`relative rounded-2xl border ${card.border} p-4 flex flex-col items-center gap-1.5 text-center hover:shadow-lg transition-all group overflow-hidden bg-card`}
            >
              <div className={`absolute inset-0 bg-gradient-to-br ${card.gradient} opacity-50`} />
              <div className={`w-10 h-10 rounded-xl ${card.iconBg} flex items-center justify-center group-hover:scale-110 transition-transform relative`}>
                <card.icon className={`w-5 h-5 ${card.iconColor}`} />
              </div>
              <p className="text-2xl font-black text-foreground relative tabular-nums">{card.value}</p>
              <span className="text-[10px] text-muted-foreground relative">{card.label}</span>
            </Link>
          </motion.div>
        ))}
      </div>
    </section>
  );
}
