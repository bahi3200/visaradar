import { motion } from "framer-motion";
import { Bell, MapPin } from "lucide-react";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

const countryNames: Record<string, string> = {
  IT: "🇮🇹 إيطاليا",
  FR: "🇫🇷 فرنسا",
  ES: "🇪🇸 إسبانيا",
};

export default function RecentAlerts() {
  const reduced = useReducedMotion();
  const noMotion = { opacity: 1, y: 0 };

  const { data: alerts } = useQuery({
    queryKey: ["recent-visa-notifications"],
    queryFn: async () => {
      const { data } = await supabase
        .from("visa_notifications")
        .select("id, country_code, message_ar, created_at, sent_count")
        .order("created_at", { ascending: false })
        .limit(5);
      return data || [];
    },
  });

  const timeAgo = (date: string) => {
    const diff = Date.now() - new Date(date).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `منذ ${mins} دقيقة`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `منذ ${hours} ساعة`;
    const days = Math.floor(hours / 24);
    return `منذ ${days} يوم`;
  };

  if (!alerts || alerts.length === 0) return null;

  return (
    <section className="container py-6">
      <motion.h2
        initial={reduced ? noMotion : { opacity: 0, y: 15 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        className="font-heading text-xl font-bold text-foreground text-center mb-4"
      >
        🔔 آخر التنبيهات
      </motion.h2>
      <div className="max-w-2xl mx-auto space-y-2">
        {alerts.map((alert, i) => (
          <motion.div
            key={alert.id}
            initial={reduced ? noMotion : { opacity: 0, y: 10 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.08 * i }}
            className="gradient-card rounded-xl border border-border/50 p-3 flex items-start gap-3"
          >
            <div className="w-8 h-8 rounded-lg bg-accent/10 flex items-center justify-center shrink-0 mt-0.5">
              <Bell className="w-4 h-4 text-accent" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-0.5">
                <span className="text-xs font-bold text-foreground">
                  {countryNames[alert.country_code] || alert.country_code}
                </span>
                <span className="text-[10px] text-muted-foreground mr-auto">{timeAgo(alert.created_at)}</span>
              </div>
              <p className="text-xs text-muted-foreground line-clamp-2">{alert.message_ar}</p>
            </div>
          </motion.div>
        ))}
      </div>
    </section>
  );
}
