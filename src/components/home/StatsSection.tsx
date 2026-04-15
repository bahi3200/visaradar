import { motion } from "framer-motion";
import { Users, Bell, Star, Clock } from "lucide-react";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export default function StatsSection() {
  const reduced = useReducedMotion();

  const { data } = useQuery({
    queryKey: ["home-stats"],
    queryFn: async () => {
      const [notifRes, reviewRes, lastCheckRes] = await Promise.all([
        supabase.from("visa_notifications").select("sent_count"),
        supabase.from("reviews").select("id", { count: "exact", head: true }).eq("is_approved", true),
        supabase.from("visa_monitor_checks").select("checked_at, status, country_code").eq("status", "available").order("checked_at", { ascending: false }).limit(1),
      ]);

      const totalNotifs = (notifRes.data || []).reduce((sum, n) => sum + (n.sent_count || 0), 0);
      const reviewCount = reviewRes.count || 0;
      const lastAvailable = lastCheckRes.data?.[0];

      return { totalNotifs, reviewCount, lastAvailable };
    },
    staleTime: 60_000,
  });

  const formatLastDate = () => {
    if (!data?.lastAvailable) return "—";
    const d = new Date(data.lastAvailable.checked_at);
    const now = new Date();
    const diffH = Math.floor((now.getTime() - d.getTime()) / 3600000);
    if (diffH < 1) return "أقل من ساعة";
    if (diffH < 24) return `منذ ${diffH} ساعة`;
    const diffD = Math.floor(diffH / 24);
    return `منذ ${diffD} يوم`;
  };

  const stats = [
    { icon: Clock, value: formatLastDate(), label: "آخر موعد متاح", color: "text-accent" },
    { icon: Bell, value: data ? data.totalNotifs.toLocaleString("ar-DZ") : "...", label: "تنبيه مرسل", color: "text-primary" },
    { icon: Star, value: data ? String(data.reviewCount) : "...", label: "مراجعة", color: "text-accent" },
    { icon: Users, value: "24/7", label: "مراقبة مستمرة", color: "text-primary" },
  ];

  const container = {
    hidden: {},
    show: { transition: { staggerChildren: reduced ? 0.03 : 0.1 } },
  };

  const item = reduced
    ? { hidden: { opacity: 0 }, show: { opacity: 1, transition: { duration: 0.2 } } }
    : { hidden: { opacity: 0, scale: 0.8, y: 20 }, show: { opacity: 1, scale: 1, y: 0, transition: { type: "spring", stiffness: 200, damping: 20 } } };

  return (
    <section className="container py-12">
      <motion.div
        variants={container}
        initial="hidden"
        whileInView="show"
        viewport={{ once: true, margin: "-50px" }}
        className="grid grid-cols-2 md:grid-cols-4 gap-4 max-w-3xl mx-auto"
      >
        {stats.map((s) => (
          <motion.div
            key={s.label}
            variants={item}
            {...(!reduced && {
              whileHover: { y: -6, scale: 1.03, transition: { type: "spring", stiffness: 300, damping: 20 } },
            })}
            className="gradient-card rounded-2xl border border-border/50 p-5 text-center shadow-card cursor-default hover:border-accent/30 hover:shadow-[0_8px_30px_-8px_hsl(var(--accent)/0.25)] transition-colors"
          >
            <s.icon className={`w-6 h-6 ${s.color} mx-auto mb-2`} />
            <p className={`font-heading text-2xl font-black ${s.color}`}>{s.value}</p>
            <p className="text-xs text-muted-foreground mt-1">{s.label}</p>
          </motion.div>
        ))}
      </motion.div>
    </section>
  );
}
