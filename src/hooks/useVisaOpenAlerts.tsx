import { useEffect, useRef } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { getAlertMode, getVolume, triggerAlert } from "@/lib/notificationPrefs";

const COUNTRY_NAMES_AR: Record<string, string> = {
  IT: "إيطاليا", FR: "فرنسا", ES: "إسبانيا", DE: "ألمانيا", GR: "اليونان",
  PT: "البرتغال", NL: "هولندا", BE: "بلجيكا", AT: "النمسا", CH: "سويسرا",
  GB: "بريطانيا", US: "أمريكا", CA: "كندا",
};
const getCountryName = (c: string) => COUNTRY_NAMES_AR[c] || c;

const SEEN_KEY = "visa_open_alerts_seen";
const SEEN_TTL_MS = 60 * 60 * 1000; // 1h dedupe window

function loadSeen(): Record<string, number> {
  try {
    const raw = sessionStorage.getItem(SEEN_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, number>;
    const now = Date.now();
    const fresh: Record<string, number> = {};
    Object.entries(parsed).forEach(([k, v]) => {
      if (now - v < SEEN_TTL_MS) fresh[k] = v;
    });
    return fresh;
  } catch {
    return {};
  }
}
function saveSeen(seen: Record<string, number>) {
  try { sessionStorage.setItem(SEEN_KEY, JSON.stringify(seen)); } catch {}
}

/**
 * Real-time in-app alerts for any subscribed country that just opened.
 * - Subscribes to visa_open_events INSERT for the user's active subscription countries
 * - Shows a sonner toast, plays sound/vibrate per user prefs, and tries a browser Notification
 * - Deduplicates events within a 1-hour window per (country|opened_at) key
 * Telegram delivery is handled server-side; this only mirrors it inside the app.
 */
export function useVisaOpenAlerts() {
  const { user } = useAuth();
  const countriesRef = useRef<string[]>([]);
  const browserAllowedRef = useRef<boolean>(false);

  useEffect(() => {
    if (!user) return;
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let cancelled = false;

    (async () => {
      // Load active subscription countries
      const { data: sub } = await supabase
        .from("subscriptions")
        .select("countries")
        .eq("user_id", user.id)
        .eq("status", "active")
        .gt("expires_at", new Date().toISOString())
        .order("expires_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (cancelled) return;
      const countries: string[] = sub?.countries || [];
      if (countries.length === 0) return;
      countriesRef.current = countries;

      // Load preferences (browser notifications opt-in)
      const { data: prefs } = await supabase
        .from("notification_preferences")
        .select("browser_notifications")
        .eq("user_id", user.id)
        .maybeSingle();
      browserAllowedRef.current = prefs?.browser_notifications !== false;

      channel = supabase
        .channel(`visa-open-alerts-${user.id}`)
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "visa_open_events" },
          (payload: any) => {
            const row = payload.new as {
              country_code?: string;
              provider?: string;
              opened_at?: string;
              id?: string;
            };
            if (!row?.country_code) return;
            if (!countriesRef.current.includes(row.country_code)) return;

            // Dedupe
            const key = `${row.country_code}|${row.opened_at || row.id}`;
            const seen = loadSeen();
            if (seen[key]) return;
            seen[key] = Date.now();
            saveSeen(seen);

            const countryName = getCountryName(row.country_code);
            const provider = row.provider ? ` (${row.provider.toUpperCase()})` : "";

            // Sonner toast
            toast.success(`🎉 فُتحت مواعيد ${countryName}`, {
              description: `تم رصد فتح حالي${provider}. سارع للحجز قبل امتلاء الأماكن.`,
              duration: 12000,
              action: {
                label: "عرض",
                onClick: () => {
                  window.location.href = `/visa/${row.country_code.toLowerCase()}`;
                },
              },
            });

            // Sound / vibrate
            try {
              triggerAlert(getAlertMode(), getVolume());
            } catch {}

            // Browser notification (if permitted & enabled)
            if (browserAllowedRef.current && typeof Notification !== "undefined") {
              try {
                if (Notification.permission === "granted") {
                  const n = new Notification(`🎉 فُتحت مواعيد ${countryName}`, {
                    body: `تم رصد فتح حالي${provider}. اضغط للحجز.`,
                    icon: "/favicon.ico",
                    tag: `visa-open-${row.country_code}`,
                    requireInteraction: false,
                  });
                  n.onclick = () => {
                    window.focus();
                    window.location.href = `/visa/${row.country_code!.toLowerCase()}`;
                    n.close();
                  };
                }
              } catch {}
            }
          }
        )
        .subscribe();
    })();

    return () => {
      cancelled = true;
      if (channel) supabase.removeChannel(channel);
    };
  }, [user]);
}

export default function VisaOpenAlertsBridge() {
  useVisaOpenAlerts();
  return null;
}