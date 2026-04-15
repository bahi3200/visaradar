import { motion } from "framer-motion";
import { Bell } from "lucide-react";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

const countryFlags: Record<string, string> = {
  IT: "🇮🇹",
  FR: "🇫🇷",
  ES: "🇪🇸",
};

const countryNames: Record<string, string> = {
  IT: "إيطاليا",
  FR: "فرنسا",
  ES: "إسبانيا",
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
    if (mins < 60) return `منذ ${mins} د`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `منذ ${hours} س`;
    const days = Math.floor(hours / 24);
    return `منذ ${days} ي`;
  };

  if (!alerts || alerts.length === 0) return null;

  return (
    <section className="container py-8">
      <motion.h2
        initial={reduced ? noMotion : { opacity: 0, y: 15 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        className="font-heading text-xl font-bold text-foreground text-center mb-1"
      >
        🔔 آخر التنبيهات
      </motion.h2>
      <motion.p
        initial={reduced ? noMotion : { opacity: 0 }}
        whileInView={{ opacity: 1 }}
        viewport={{ once: true }}
        className="text-xs text-muted-foreground text-center mb-5"
      >
        أحدث إشعارات مواعيد التأشيرات
      </motion.p>
      <div className="max-w-2xl mx-auto space-y-2.5">
        {alerts.map((alert, i) => (
          <motion.div
            key={alert.id}
            initial={reduced ? noMotion : { opacity: 0, x: -20 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.08 * i, type: "spring", stiffness: 200, damping: 25 }}
            className="relative bg-card rounded-2xl border border-border/50 p-4 flex items-start gap-3 overflow-hidden hover:border-accent/30 transition-colors group"
          >
            <div className="absolute inset-0 bg-gradient-to-l from-accent/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
            <div className="w-10 h-10 rounded-xl bg-accent/10 flex items-center justify-center shrink-0 relative">
              <span className="text-lg">{countryFlags[alert.country_code] || "🌍"}</span>
            </div>
            <div className="flex-1 min-w-0 relative">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs font-bold text-foreground">
                  {countryNames[alert.country_code] || alert.country_code}
                </span>
                <span className="text-[9px] text-muted-foreground/60 bg-muted/50 px-2 py-0.5 rounded-full mr-auto">
                  {timeAgo(alert.created_at)}
                </span>
              </div>
              <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">{alert.message_ar}</p>
            </div>
          </motion.div>
        ))}
      </div>
    </section>
  );
}
