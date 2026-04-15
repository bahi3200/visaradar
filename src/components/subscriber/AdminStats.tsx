import { motion, AnimatePresence } from "framer-motion";
import { Users, FileText, Bell, CreditCard, Smartphone, MessageSquare, AlertTriangle, X } from "lucide-react";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Link } from "react-router-dom";
import { useState, useRef, useCallback, useEffect } from "react";

function playAlertSound() {
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = "sine";
    // Two-tone chime
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    osc.frequency.setValueAtTime(1100, ctx.currentTime + 0.15);
    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.4);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.4);
  } catch {
    // Audio not available
  }
}

export default function AdminStats() {
  const reduced = useReducedMotion();
  const noMotion = { opacity: 1, y: 0 };
  const [dismissed, setDismissed] = useState<string[]>([]);
  const prevPendingRef = useRef<number | null>(null);

  const { data: stats } = useQuery({
    queryKey: ["admin-home-stats"],
    queryFn: async () => {
      const [subs, pending, notifs, users, devices, messages] = await Promise.all([
        supabase.from("subscriptions").select("id", { count: "exact", head: true }).eq("status", "active"),
        supabase.from("subscription_requests").select("id", { count: "exact", head: true }).eq("status", "pending"),
        supabase.from("visa_notifications").select("id", { count: "exact", head: true }),
        supabase.from("profiles").select("id", { count: "exact", head: true }),
        supabase.from("user_devices").select("id", { count: "exact", head: true }).eq("is_active", true),
        supabase.from("contact_messages").select("id", { count: "exact", head: true }).eq("status", "new"),
      ]);
      return {
        activeSubscriptions: subs.count ?? 0,
        pendingRequests: pending.count ?? 0,
        totalNotifications: notifs.count ?? 0,
        totalUsers: users.count ?? 0,
        activeDevices: devices.count ?? 0,
        newMessages: messages.count ?? 0,
      };
    },
  });

  const alerts = [
    {
      id: "pending",
      show: (stats?.pendingRequests ?? 0) > 0,
      count: stats?.pendingRequests ?? 0,
      label: "طلب اشتراك معلق بانتظار المراجعة",
      labelPlural: "طلبات اشتراك معلقة بانتظار المراجعة",
      to: "/dashboard/requests",
      actionLabel: "مراجعة الطلبات",
      gradient: "from-orange-500/20 via-orange-500/10 to-transparent",
      border: "border-orange-500/40",
      iconBg: "bg-orange-500",
      pulseColor: "bg-orange-400",
    },
    {
      id: "messages",
      show: (stats?.newMessages ?? 0) > 0,
      count: stats?.newMessages ?? 0,
      label: "رسالة تواصل جديدة لم تُقرأ",
      labelPlural: "رسائل تواصل جديدة لم تُقرأ",
      to: "/dashboard/contact-messages",
      actionLabel: "عرض الرسائل",
      gradient: "from-blue-400/20 via-blue-400/10 to-transparent",
      border: "border-blue-400/40",
      iconBg: "bg-blue-400",
      pulseColor: "bg-blue-300",
    },
  ];

  const visibleAlerts = alerts.filter((a) => a.show && !dismissed.includes(a.id));

  const cards = [
    { icon: Users, label: "المستخدمين", value: stats?.totalUsers ?? "—", gradient: "from-primary/20 to-primary/5", iconBg: "gradient-primary", iconColor: "text-primary-foreground", border: "border-primary/20", to: "/dashboard/users" },
    { icon: CreditCard, label: "اشتراكات نشطة", value: stats?.activeSubscriptions ?? "—", gradient: "from-green-500/20 to-green-500/5", iconBg: "bg-green-500", iconColor: "text-white", border: "border-green-500/20", to: "/dashboard/requests" },
    { icon: FileText, label: "طلبات معلقة", value: stats?.pendingRequests ?? "—", gradient: "from-orange-500/20 to-orange-500/5", iconBg: "bg-orange-500", iconColor: "text-white", border: "border-orange-500/20", to: "/dashboard/requests" },
    { icon: Bell, label: "التنبيهات", value: stats?.totalNotifications ?? "—", gradient: "from-accent/20 to-accent/5", iconBg: "gradient-accent", iconColor: "text-accent-foreground", border: "border-accent/20", to: "/dashboard/notifications" },
    { icon: Smartphone, label: "أجهزة نشطة", value: stats?.activeDevices ?? "—", gradient: "from-purple-500/20 to-purple-500/5", iconBg: "bg-purple-500", iconColor: "text-white", border: "border-purple-500/20", to: "/dashboard/users" },
    { icon: MessageSquare, label: "رسائل جديدة", value: stats?.newMessages ?? "—", gradient: "from-blue-400/20 to-blue-400/5", iconBg: "bg-blue-400", iconColor: "text-white", border: "border-blue-400/20", to: "/dashboard/contact-messages" },
  ];

  return (
    <section className="container py-6 -mt-6 relative z-10">
      {/* Alert banners */}
      <AnimatePresence>
        {visibleAlerts.map((alert) => (
          <motion.div
            key={alert.id}
            initial={reduced ? noMotion : { opacity: 0, y: -12, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -12, scale: 0.97 }}
            transition={{ type: "spring", stiffness: 300, damping: 25 }}
            className={`relative mb-3 rounded-2xl border ${alert.border} bg-card overflow-hidden`}
          >
            <div className={`absolute inset-0 bg-gradient-to-l ${alert.gradient}`} />
            <div className="relative flex items-center gap-3 px-4 py-3">
              <div className="relative flex-shrink-0">
                <div className={`w-9 h-9 rounded-xl ${alert.iconBg} flex items-center justify-center`}>
                  <AlertTriangle className="w-4 h-4 text-white" />
                </div>
                <span className={`absolute -top-1 -right-1 w-3 h-3 rounded-full ${alert.pulseColor} animate-ping`} />
                <span className={`absolute -top-1 -right-1 w-3 h-3 rounded-full ${alert.pulseColor}`} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-foreground">
                  {alert.count} {alert.count > 1 ? alert.labelPlural : alert.label}
                </p>
              </div>
              <Link
                to={alert.to}
                className={`flex-shrink-0 text-xs font-bold ${alert.iconBg} text-white px-3 py-1.5 rounded-full hover:opacity-90 transition-opacity`}
              >
                {alert.actionLabel}
              </Link>
              <button
                onClick={() => setDismissed((prev) => [...prev, alert.id])}
                className="flex-shrink-0 p-1 rounded-lg hover:bg-muted/50 transition-colors text-muted-foreground"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </motion.div>
        ))}
      </AnimatePresence>

      {/* Stats grid */}
      <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
        {cards.map((card, i) => (
          <motion.div
            key={card.label}
            initial={reduced ? noMotion : { opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ delay: 0.08 * i, type: "spring", stiffness: 200, damping: 20 }}
          >
            <Link
              to={card.to}
              className={`relative rounded-2xl border ${card.border} p-3 flex flex-col items-center gap-1 text-center hover:shadow-lg transition-all group overflow-hidden bg-card`}
            >
              <div className={`absolute inset-0 bg-gradient-to-br ${card.gradient} opacity-50`} />
              <div className={`w-9 h-9 rounded-xl ${card.iconBg} flex items-center justify-center group-hover:scale-110 transition-transform relative`}>
                <card.icon className={`w-4 h-4 ${card.iconColor}`} />
              </div>
              <p className="text-xl font-black text-foreground relative tabular-nums">{card.value}</p>
              <span className="text-[9px] text-muted-foreground relative leading-tight">{card.label}</span>
            </Link>
          </motion.div>
        ))}
      </div>
    </section>
  );
}