import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { motion, AnimatePresence } from "framer-motion";
import { ExternalLink, X, Zap } from "lucide-react";
import { useState, useEffect, useRef, useCallback, forwardRef } from "react";

const VISA_BOOKING_URLS: Record<string, { url: string; provider: string }> = {
  IT: { url: "https://visa.vfsglobal.com/dza/ar/ita/", provider: "VFS Global" },
  FR: { url: "https://fr.capago.net/rendez-vous/dz/", provider: "Capago (TLScontact)" },
  ES: { url: "https://algeria.blsspainvisa.com/", provider: "BLS International" },
  DE: { url: "https://visa.vfsglobal.com/dza/ar/deu/", provider: "VFS Global" },
  GR: { url: "https://visa.vfsglobal.com/dza/ar/grc/", provider: "VFS Global" },
};

const COUNTRY_INFO: Record<string, { flag: string; name: string }> = {
  IT: { flag: "🇮🇹", name: "إيطاليا" },
  FR: { flag: "🇫🇷", name: "فرنسا" },
  ES: { flag: "🇪🇸", name: "إسبانيا" },
  DE: { flag: "🇩🇪", name: "ألمانيا" },
  GR: { flag: "🇬🇷", name: "اليونان" },
};

interface Props {
  subscribedCountries: string[];
}

export default function VisaAlertBanner({ subscribedCountries }: Props) {
  const { user } = useAuth();
  const [dismissed, setDismissed] = useState<string[]>([]);
  const playedRef = useRef(false);

  const playAlertSound = useCallback(() => {
    try {
      const ctx = new AudioContext();
      const now = ctx.currentTime;

      // Three-tone urgent alert: ascending chime
      const notes = [
        { freq: 784, start: 0, dur: 0.12 },    // G5
        { freq: 988, start: 0.13, dur: 0.12 },  // B5
        { freq: 1319, start: 0.26, dur: 0.25 }, // E6
      ];

      for (const n of notes) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type = "sine";
        osc.frequency.setValueAtTime(n.freq, now + n.start);
        gain.gain.setValueAtTime(0.35, now + n.start);
        gain.gain.exponentialRampToValueAtTime(0.01, now + n.start + n.dur);
        osc.start(now + n.start);
        osc.stop(now + n.start + n.dur + 0.05);
      }

      // Second chime (repeat) after a short pause
      const pause = 0.55;
      for (const n of notes) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type = "sine";
        osc.frequency.setValueAtTime(n.freq, now + pause + n.start);
        gain.gain.setValueAtTime(0.25, now + pause + n.start);
        gain.gain.exponentialRampToValueAtTime(0.01, now + pause + n.start + n.dur);
        osc.start(now + pause + n.start);
        osc.stop(now + pause + n.start + n.dur + 0.05);
      }
    } catch {
      // AudioContext not available
    }
  }, []);

  // Fetch recent visa notifications (last 2 hours)
  const { data: recentAlerts } = useQuery({
    queryKey: ["visa-alert-banner", user?.id, subscribedCountries],
    enabled: !!user && subscribedCountries.length > 0,
    refetchInterval: 60_000,
    queryFn: async () => {
      const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
      const { data, error } = await supabase
        .from("visa_notifications")
        .select("id, country_code, message_ar, created_at")
        .in("country_code", subscribedCountries)
        .gte("created_at", twoHoursAgo)
        .order("created_at", { ascending: false })
        .limit(5);
      if (error) throw error;
      return data || [];
    },
  });

  const visibleAlerts = recentAlerts?.filter((a) => !dismissed.includes(a.id)) || [];

  // Play sound once when alerts first appear
  useEffect(() => {
    if (visibleAlerts.length > 0 && !playedRef.current) {
      const soundEnabled = localStorage.getItem("notif_sound") !== "false";
      if (soundEnabled) {
        playAlertSound();
      }
      playedRef.current = true;
    }
    if (visibleAlerts.length === 0) {
      playedRef.current = false;
    }
  }, [visibleAlerts.length, playAlertSound]);

  if (visibleAlerts.length === 0) return null;

  return (
    <section className="container py-4">
      <AnimatePresence>
        {visibleAlerts.map((alert) => {
          const country = COUNTRY_INFO[alert.country_code];
          const booking = VISA_BOOKING_URLS[alert.country_code];
          if (!country || !booking) return null;

          const minutesAgo = Math.floor((Date.now() - new Date(alert.created_at).getTime()) / 60000);
          const timeLabel = minutesAgo < 1 ? "الآن" : minutesAgo < 60 ? `منذ ${minutesAgo} دقيقة` : `منذ ${Math.floor(minutesAgo / 60)} ساعة`;

          return (
            <motion.div
              key={alert.id}
              initial={{ opacity: 0, y: -16, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -10, scale: 0.97 }}
              transition={{ type: "spring", stiffness: 300, damping: 25 }}
              className="relative rounded-2xl border border-green-500/40 bg-gradient-to-l from-green-500/10 via-card to-emerald-500/5 p-4 mb-3 overflow-hidden"
            >
              {/* Pulse animation */}
              <div className="absolute top-3 left-3">
                <span className="relative flex h-3 w-3">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-green-500" />
                </span>
              </div>

              <button
                onClick={() => setDismissed((prev) => [...prev, alert.id])}
                className="absolute top-2 left-8 p-1 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary/50 transition-colors"
              >
                <X className="w-3.5 h-3.5" />
              </button>

              <div className="flex items-start gap-3">
                <div className="w-12 h-12 rounded-xl bg-green-500/15 flex items-center justify-center shrink-0 text-2xl">
                  {country.flag}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <Zap className="w-4 h-4 text-green-400" />
                    <h3 className="font-heading text-sm font-bold text-foreground">
                      🚨 مواعيد مفتوحة — {country.name}
                    </h3>
                  </div>
                  <p className="text-xs text-muted-foreground mb-3 line-clamp-2 leading-relaxed">
                    {alert.message_ar}
                  </p>
                  <div className="flex items-center gap-2 flex-wrap">
                    <a
                      href={booking.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 bg-green-500 hover:bg-green-600 text-white font-bold text-xs px-4 py-2 rounded-full transition-all shadow-lg hover:shadow-xl hover:-translate-y-0.5"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      افتح موقع الحجز الآن
                    </a>
                    <span className="text-[10px] text-muted-foreground/70">
                      {booking.provider} • {timeLabel}
                    </span>
                  </div>
                </div>
              </div>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </section>
  );
}