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
    { icon: Users, label: "إجمالي المستخدمين", value: stats?.totalUsers ?? "—", color: "text-primary", bg: "bg-primary/10", to: "/dashboard/users" },
    { icon: CreditCard, label: "اشتراكات نشطة", value: stats?.activeSubscriptions ?? "—", color: "text-green-500", bg: "bg-green-500/10", to: "/dashboard/requests" },
    { icon: FileText, label: "طلبات معلقة", value: stats?.pendingRequests ?? "—", color: "text-orange-500", bg: "bg-orange-500/10", to: "/dashboard/requests" },
    { icon: Bell, label: "إجمالي التنبيهات", value: stats?.totalNotifications ?? "—", color: "text-accent", bg: "bg-accent/10", to: "/dashboard/notifications" },
  ];

  return (
    <section className="container py-6">
      <motion.h2
        initial={reduced ? noMotion : { opacity: 0, y: 15 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        className="font-heading text-xl font-bold text-foreground text-center mb-4"
      >
        📊 إحصائيات سريعة
      </motion.h2>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {cards.map((card, i) => (
          <motion.div
            key={card.label}
            initial={reduced ? noMotion : { opacity: 0, y: 15 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.08 * i }}
          >
            <Link
              to={card.to}
              className="gradient-card rounded-xl border border-border/50 p-4 flex flex-col items-center gap-2 text-center hover:border-accent/30 hover:shadow-lg transition-all group"
            >
              <div className={`w-10 h-10 rounded-lg ${card.bg} flex items-center justify-center group-hover:scale-110 transition-transform`}>
                <card.icon className={`w-5 h-5 ${card.color}`} />
              </div>
              <p className="text-2xl font-black text-foreground">{card.value}</p>
              <span className="text-[10px] text-muted-foreground">{card.label}</span>
            </Link>
          </motion.div>
        ))}
      </div>
    </section>
  );
}
