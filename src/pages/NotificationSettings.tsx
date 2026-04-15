import { useState, useEffect } from "react";
import Layout from "@/components/Layout";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { motion } from "framer-motion";
import { Bell, BellOff, Volume2, VolumeX, Globe, Save, ArrowRight, Lock } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useNavigate } from "react-router-dom";

const AVAILABLE_COUNTRIES = [
  { code: "IT", name: "إيطاليا", flag: "🇮🇹" },
  { code: "FR", name: "فرنسا", flag: "🇫🇷" },
  { code: "ES", name: "إسبانيا", flag: "🇪🇸" },
  { code: "DE", name: "ألمانيا", flag: "🇩🇪" },
  { code: "GR", name: "اليونان", flag: "🇬🇷" },
];

export default function NotificationSettings() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [soundEnabled, setSoundEnabled] = useState(true);
  const [browserNotifications, setBrowserNotifications] = useState(true);
  const [selectedCountries, setSelectedCountries] = useState<string[]>(["IT", "FR", "ES"]);
  const [hasChanges, setHasChanges] = useState(false);

  // Fetch subscription with package info to get max_countries
  const { data: subscriptionInfo } = useQuery({
    queryKey: ["subscription-limits", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const [{ data: sub }, { data: isAdmin }] = await Promise.all([
        supabase
          .from("subscriptions")
          .select("*, packages(max_countries)")
          .eq("user_id", user!.id)
          .eq("status", "active")
          .order("expires_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase.rpc("has_role", { _user_id: user!.id, _role: "admin" }),
        supabase.rpc("has_role", { _user_id: user!.id, _role: "moderator" }),
      ]);
      return {
        maxCountries: isAdmin ? 999 : (sub?.packages as any)?.max_countries ?? 1,
        subscriptionCountries: sub?.countries ?? [],
        isAdmin: !!isAdmin,
        hasSubscription: !!sub,
      };
    },
  });

  const maxCountries = subscriptionInfo?.maxCountries ?? 1;
  const isAdmin = subscriptionInfo?.isAdmin ?? false;

  const { data: prefs, isLoading } = useQuery({
    queryKey: ["notification-preferences", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase
        .from("notification_preferences")
        .select("*")
        .eq("user_id", user!.id)
        .maybeSingle();
      return data;
    },
  });

  useEffect(() => {
    if (isAdmin) {
      // Admin always monitors all countries
      setSelectedCountries(AVAILABLE_COUNTRIES.map(c => c.code));
    } else if (prefs) {
      setSelectedCountries(prefs.countries || ["IT", "FR", "ES"]);
    }
    if (prefs) {
      setSoundEnabled(prefs.sound_enabled);
      setBrowserNotifications(prefs.browser_notifications);
    }
  }, [prefs, isAdmin]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("Not authenticated");

      const payload = {
        user_id: user.id,
        sound_enabled: soundEnabled,
        browser_notifications: browserNotifications,
        countries: selectedCountries,
      };

      if (prefs) {
        const { error } = await supabase
          .from("notification_preferences")
          .update(payload)
          .eq("user_id", user.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("notification_preferences")
          .insert(payload);
        if (error) throw error;
      }

      localStorage.setItem("notif_sound", soundEnabled ? "true" : "false");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notification-preferences"] });
      toast.success("تم حفظ إعدادات الإشعارات بنجاح");
      setHasChanges(false);
    },
    onError: () => {
      toast.error("فشل حفظ الإعدادات، حاول مرة أخرى");
    },
  });

  const toggleCountry = (code: string) => {
    setSelectedCountries((prev) => {
      if (prev.includes(code)) {
        return prev.filter((c) => c !== code);
      }
      // Enforce max_countries limit
      if (prev.length >= maxCountries) {
        toast.error(`اشتراكك يسمح بحد أقصى ${maxCountries} ${maxCountries === 1 ? "دولة" : "دول"} فقط`);
        return prev;
      }
      return [...prev, code];
    });
    setHasChanges(true);
  };

  const handleSoundChange = (val: boolean) => {
    setSoundEnabled(val);
    setHasChanges(true);
  };

  const handleBrowserChange = (val: boolean) => {
    setBrowserNotifications(val);
    setHasChanges(true);
    if (val && "Notification" in window && Notification.permission === "default") {
      Notification.requestPermission();
    }
  };

  const requestPermission = async () => {
    if ("Notification" in window) {
      const permission = await Notification.requestPermission();
      if (permission === "granted") {
        toast.success("تم تفعيل إشعارات المتصفح");
      } else {
        toast.error("تم رفض إذن الإشعارات من المتصفح");
      }
    }
  };

  const notificationPermission =
    typeof window !== "undefined" && "Notification" in window
      ? Notification.permission
      : "default";

  return (
    <Layout>
      <div className="min-h-screen bg-background py-8 px-4">
        <div className="max-w-lg mx-auto space-y-6">
          {/* Header */}
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
            <button onClick={() => navigate(-1)} className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-4 transition-colors">
              <ArrowRight className="w-4 h-4" />
              رجوع
            </button>
            <h1 className="font-heading text-2xl font-black text-foreground">إعدادات الإشعارات</h1>
            <p className="text-sm text-muted-foreground mt-1">تخصيص تنبيهات التأشيرات والأصوات</p>
          </motion.div>

          {/* Sound */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05 }}
            className="gradient-card rounded-2xl border border-border/50 p-5"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                {soundEnabled ? (
                  <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                    <Volume2 className="w-5 h-5 text-primary" />
                  </div>
                ) : (
                  <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center">
                    <VolumeX className="w-5 h-5 text-muted-foreground" />
                  </div>
                )}
                <div>
                  <p className="text-sm font-bold text-foreground">صوت الإشعارات</p>
                  <p className="text-xs text-muted-foreground">تشغيل صوت عند وصول تنبيه جديد</p>
                </div>
              </div>
              <Switch checked={soundEnabled} onCheckedChange={handleSoundChange} />
            </div>
          </motion.div>

          {/* Browser notifications */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="gradient-card rounded-2xl border border-border/50 p-5 space-y-3"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                {browserNotifications ? (
                  <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                    <Bell className="w-5 h-5 text-primary" />
                  </div>
                ) : (
                  <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center">
                    <BellOff className="w-5 h-5 text-muted-foreground" />
                  </div>
                )}
                <div>
                  <p className="text-sm font-bold text-foreground">إشعارات المتصفح</p>
                  <p className="text-xs text-muted-foreground">عرض إشعارات حتى لو التطبيق في الخلفية</p>
                </div>
              </div>
              <Switch checked={browserNotifications} onCheckedChange={handleBrowserChange} />
            </div>

            {notificationPermission !== "granted" && browserNotifications && (
              <button
                onClick={requestPermission}
                className="w-full text-xs text-primary hover:underline text-center py-2 rounded-lg bg-primary/5"
              >
                ⚠️ يجب السماح بالإشعارات من المتصفح — اضغط هنا للتفعيل
              </button>
            )}
          </motion.div>

          {/* Country selection */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 }}
            className="gradient-card rounded-2xl border border-border/50 p-5"
          >
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                <Globe className="w-5 h-5 text-primary" />
              </div>
              <div>
                <p className="text-sm font-bold text-foreground">الدول المراقبة</p>
                <p className="text-xs text-muted-foreground">اختر الدول التي تريد تلقي تنبيهات عنها</p>
              </div>
            </div>

            {isAdmin ? (
              <div className="flex items-center gap-1.5 mb-4 px-3 py-2 rounded-lg bg-primary/10 border border-primary/30">
                <Globe className="w-3.5 h-3.5 text-primary" />
                <p className="text-xs text-primary font-medium">
                  كمسؤول، أنت تراقب جميع الدول تلقائياً ({AVAILABLE_COUNTRIES.length} دول)
                </p>
              </div>
            ) : (
              <div className="flex items-center gap-1.5 mb-4 px-3 py-2 rounded-lg bg-muted/50 border border-border/30">
                <Lock className="w-3.5 h-3.5 text-muted-foreground" />
                <p className="text-xs text-muted-foreground">
                  اشتراكك يسمح بـ <strong className="text-foreground">{maxCountries}</strong> {maxCountries === 1 ? "دولة" : "دول"} كحد أقصى
                  <span className="text-muted-foreground/70"> ({selectedCountries.length}/{maxCountries})</span>
                </p>
              </div>
            )}

            <div className="grid grid-cols-2 gap-2">
              {AVAILABLE_COUNTRIES.map((country) => {
                const isSelected = selectedCountries.includes(country.code);
                const isDisabled = isAdmin || (!isSelected && selectedCountries.length >= maxCountries);
                return (
                  <button
                    key={country.code}
                    onClick={() => !isAdmin && toggleCountry(country.code)}
                    disabled={isDisabled}
                    className={`flex items-center gap-2 p-3 rounded-xl border text-sm font-medium transition-all ${
                      isSelected
                        ? "border-primary/50 bg-primary/10 text-foreground"
                        : isDisabled
                        ? "border-border/30 bg-background/30 text-muted-foreground/40 cursor-not-allowed opacity-50"
                        : "border-border/50 bg-background/50 text-muted-foreground hover:border-border"
                    }`}
                  >
                    <span className="text-lg">{country.flag}</span>
                    <span>{country.name}</span>
                    {isSelected && (
                      <Badge className="mr-auto text-[10px] bg-primary/20 text-primary border-0 px-1.5">
                        ✓
                      </Badge>
                    )}
                    {!isSelected && !isAdmin && isDisabled && (
                      <Lock className="mr-auto w-3 h-3 text-muted-foreground/40" />
                    )}
                  </button>
                );
              })}
            </div>

            {selectedCountries.length === 0 && (
              <p className="text-xs text-destructive mt-3 text-center">
                يجب اختيار دولة واحدة على الأقل
              </p>
            )}
          </motion.div>

          {/* Save */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
          >
            <Button
              onClick={() => saveMutation.mutate()}
              disabled={saveMutation.isPending || selectedCountries.length === 0}
              className="w-full h-12 text-base font-bold rounded-xl"
            >
              {saveMutation.isPending ? (
                "جارٍ الحفظ..."
              ) : (
                <>
                  <Save className="w-4 h-4 ml-2" />
                  حفظ الإعدادات
                </>
              )}
            </Button>
          </motion.div>
        </div>
      </div>
    </Layout>
  );
}