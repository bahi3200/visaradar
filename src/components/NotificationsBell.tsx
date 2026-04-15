import { Bell } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/useAuth";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect, useRef, useCallback } from "react";
import { formatDistanceToNow } from "date-fns";
import { ar } from "date-fns/locale";
import { toast } from "sonner";

const COUNTRY_FLAGS: Record<string, string> = {
  IT: "🇮🇹 إيطاليا",
  FR: "🇫🇷 فرنسا",
  ES: "🇪🇸 إسبانيا",
  DE: "🇩🇪 ألمانيا",
  GR: "🇬🇷 اليونان",
};

type NotificationItem = {
  id: string;
  type: "visa" | "request";
  title: string;
  description: string;
  date: string;
  isNew: boolean;
};

export default function NotificationsBell() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { isPrivileged } = useIsAdmin();
  const [open, setOpen] = useState(false);
  const [lastReadAt, setLastReadAt] = useState<string | null>(null);
  const channelInstanceRef = useRef(`notifications-${crypto.randomUUID()}`);

  useEffect(() => {
    if (user) {
      const stored = localStorage.getItem(`notif_read_${user.id}`);
      setLastReadAt(stored);
    }
  }, [user]);

  // Fetch user's subscribed countries
  const { data: subscribedCountries } = useQuery({
    queryKey: ["my-subscription-countries", user?.id],
    enabled: !!user,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<string[]> => {
      if (!user) return [];
      const { data } = await supabase
        .from("subscriptions")
        .select("countries, service_type")
        .eq("user_id", user.id)
        .eq("status", "active");
      
      if (!data || data.length === 0) return [];
      
      // Collect all countries from active subscriptions that include visa service
      const countries = new Set<string>();
      for (const sub of data) {
        if (sub.service_type === "visa" || sub.service_type === "both") {
          for (const c of sub.countries || []) {
            countries.add(c);
          }
        }
      }
      return Array.from(countries);
    },
  });

  // Request browser notification permission
  useEffect(() => {
    if (user && "Notification" in window && Notification.permission === "default") {
      Notification.requestPermission();
    }
  }, [user]);

  // Realtime subscriptions
  useEffect(() => {
    if (!user) return;
    const channel = supabase.channel(channelInstanceRef.current);
    
    channel
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "visa_notifications" },
        (payload: any) => {
          const countryCode = payload.new?.country_code;
          
          // Privileged users (admin/moderator) see all countries; regular users only their subscribed ones
          if (!isPrivileged && subscribedCountries && subscribedCountries.length > 0 && !subscribedCountries.includes(countryCode)) {
            return;
          }
          if (!isPrivileged && (!subscribedCountries || subscribedCountries.length === 0)) {
            return;
          }

          queryClient.invalidateQueries({ queryKey: ["user-notifications"] });
          
          const countryName = COUNTRY_FLAGS[countryCode] || countryCode;
          toast.success(`🚨 مواعيد مفتوحة! ${countryName}`, {
            description: payload.new?.message_ar || "تم اكتشاف فتح مواعيد تأشيرة",
            duration: 10000,
          });

          if ("Notification" in window && Notification.permission === "granted") {
            new Notification(`🚨 تنبيه فيزا — ${countryName}`, {
              body: payload.new?.message_ar || "تم اكتشاف فتح مواعيد تأشيرة!",
              icon: "/favicon.ico",
              tag: `visa-${countryCode}`,
            });
          }
        })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "subscription_requests", filter: `user_id=eq.${user.id}` },
        (payload: any) => {
          queryClient.invalidateQueries({ queryKey: ["user-notifications"] });
          const status = payload.new?.status;
          if (status === "approved") {
            toast.success("✅ تمت الموافقة على طلبك!", { duration: 8000 });
          } else if (status === "rejected") {
            toast.error("❌ تم رفض طلبك", { duration: 8000 });
          }
        })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user?.id, queryClient, subscribedCountries, isPrivileged]);

  const { data: notifications = [] } = useQuery({
    queryKey: ["user-notifications", user?.id, lastReadAt, subscribedCountries, isPrivileged],
    enabled: !!user,
    staleTime: 3 * 60_000,
    queryFn: async (): Promise<NotificationItem[]> => {
      if (!user) return [];

      // Privileged users see ALL visa notifications; regular users only their subscribed countries
      const canSeeAllVisa = isPrivileged;
      const hasVisaSubscription = subscribedCountries && subscribedCountries.length > 0;

      let visaPromise;
      if (canSeeAllVisa) {
        visaPromise = supabase
          .from("visa_notifications")
          .select("id, country_code, message_ar, created_at")
          .order("created_at", { ascending: false })
          .limit(20);
      } else if (hasVisaSubscription) {
        visaPromise = supabase
          .from("visa_notifications")
          .select("id, country_code, message_ar, created_at")
          .in("country_code", subscribedCountries!)
          .order("created_at", { ascending: false })
          .limit(10);
      } else {
        visaPromise = Promise.resolve({ data: [] as any[], error: null });
      }

      const [visaRes, requestsRes] = await Promise.all([
        visaPromise,
        supabase
          .from("subscription_requests")
          .select("id, status, updated_at, packages:package_id(name_ar)")
          .eq("user_id", user.id)
          .neq("status", "pending")
          .order("updated_at", { ascending: false })
          .limit(10),
      ]);

      const items: NotificationItem[] = [];

      if (visaRes.data) {
        for (const v of visaRes.data as any[]) {
          const countryName = COUNTRY_FLAGS[v.country_code] || v.country_code;
          items.push({
            id: `visa-${v.id}`,
            type: "visa",
            title: `🔔 تنبيه فيزا — ${countryName}`,
            description: v.message_ar,
            date: v.created_at,
            isNew: lastReadAt ? v.created_at > lastReadAt : true,
          });
        }
      }

      if (requestsRes.data) {
        for (const r of requestsRes.data) {
          const statusLabel =
            r.status === "approved" ? "✅ تمت الموافقة" :
            r.status === "rejected" ? "❌ مرفوض" : `📋 ${r.status}`;
          const pkg = r.packages as any;
          items.push({
            id: `req-${r.id}`,
            type: "request",
            title: `${statusLabel} على طلبك`,
            description: pkg?.name_ar ? `باقة: ${pkg.name_ar}` : "طلب اشتراك",
            date: r.updated_at,
            isNew: lastReadAt ? r.updated_at > lastReadAt : true,
          });
        }
      }

      items.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      return items;
    },
  });

  const unreadCount = notifications.filter((n) => n.isNew).length;
  const prevUnreadRef = useRef<number>(0);

  const playNotificationSound = useCallback(() => {
    try {
      const ctx = new AudioContext();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = "sine";
      osc.frequency.setValueAtTime(880, ctx.currentTime);
      osc.frequency.setValueAtTime(1047, ctx.currentTime + 0.1);
      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.3);
    } catch {}
  }, []);

  useEffect(() => {
    if (unreadCount > prevUnreadRef.current && prevUnreadRef.current !== 0) {
      const soundEnabled = localStorage.getItem("notif_sound") !== "false";
      if (soundEnabled) playNotificationSound();
    }
    prevUnreadRef.current = unreadCount;
  }, [unreadCount, playNotificationSound]);

  const handleOpen = (isOpen: boolean) => {
    setOpen(isOpen);
    if (isOpen && user) {
      const now = new Date().toISOString();
      localStorage.setItem(`notif_read_${user.id}`, now);
      setLastReadAt(now);
    }
  };

  if (!user) return null;

  return (
    <Popover open={open} onOpenChange={handleOpen}>
      <PopoverTrigger asChild>
        <button className="relative p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors outline-none">
          <Bell className="w-5 h-5" />
          {unreadCount > 0 && (
            <Badge className="absolute -top-0.5 -right-0.5 h-4 min-w-4 px-1 text-[10px] bg-destructive text-destructive-foreground border-0 flex items-center justify-center">
              {unreadCount > 9 ? "9+" : unreadCount}
            </Badge>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="px-4 py-3 border-b border-border/50">
          <h4 className="text-sm font-semibold">الإشعارات</h4>
          {isPrivileged ? (
            <p className="text-[10px] text-muted-foreground mt-0.5">
              🛡️ تنبيهات كل الدول (مسؤول)
            </p>
          ) : subscribedCountries && subscribedCountries.length > 0 ? (
            <p className="text-[10px] text-muted-foreground mt-0.5">
              تنبيهات: {subscribedCountries.map(c => COUNTRY_FLAGS[c]?.split(" ")[0] || c).join(" ")}
            </p>
          ) : null}
        </div>
        <ScrollArea className="max-h-72">
          {notifications.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-muted-foreground">
              لا توجد إشعارات حالياً
            </div>
          ) : (
            <div className="divide-y divide-border/30">
              {notifications.map((notif) => (
                <div
                  key={notif.id}
                  className={`px-4 py-3 text-sm transition-colors ${notif.isNew ? "bg-primary/5" : ""}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-medium text-foreground leading-snug">{notif.title}</p>
                    {notif.isNew && (
                      <span className="shrink-0 mt-1 w-2 h-2 rounded-full bg-primary" />
                    )}
                  </div>
                  <p className="text-muted-foreground text-xs mt-1 line-clamp-2">{notif.description}</p>
                  <p className="text-muted-foreground/60 text-[10px] mt-1">
                    {formatDistanceToNow(new Date(notif.date), { addSuffix: true, locale: ar })}
                  </p>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
