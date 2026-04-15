import AdminLayout from "@/components/AdminLayout";
import { motion } from "framer-motion";
import { Send, Bell, ArrowRight, ExternalLink, Globe, History, Activity, RefreshCw, CheckCircle2, XCircle, AlertTriangle, HelpCircle, Power } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";

const countries = [
  {
    code: "IT",
    flag: "🇮🇹",
    name: "إيطاليا",
    provider: "VFS Global",
    officialUrl: "https://visa.vfsglobal.com/dza/ar/ita/",
    color: "border-green-500/40 bg-green-500/5",
  },
  {
    code: "FR",
    flag: "🇫🇷",
    name: "فرنسا",
    provider: "Capago (TLScontact)",
    officialUrl: "https://fr.capago.net/rendez-vous/dz/",
    color: "border-blue-500/40 bg-blue-500/5",
  },
  {
    code: "ES",
    flag: "🇪🇸",
    name: "إسبانيا",
    provider: "BLS International Algeria",
    officialUrl: "https://algeria.blsspainvisa.com/",
    color: "border-yellow-500/40 bg-yellow-500/5",
  },
  {
    code: "DE",
    flag: "🇩🇪",
    name: "ألمانيا",
    provider: "VFS Global",
    officialUrl: "https://visa.vfsglobal.com/dza/ar/deu/",
    color: "border-red-500/40 bg-red-500/5",
  },
  {
    code: "GR",
    flag: "🇬🇷",
    name: "اليونان",
    provider: "VFS Global",
    officialUrl: "https://visa.vfsglobal.com/dza/ar/grc/",
    color: "border-cyan-500/40 bg-cyan-500/5",
  },
];

const statusConfig: Record<string, { icon: any; text: string; cls: string }> = {
  open: { icon: CheckCircle2, text: "مواعيد مفتوحة", cls: "text-green-400 bg-green-500/10 border-green-500/30" },
  closed: { icon: XCircle, text: "مغلق", cls: "text-red-400 bg-red-500/10 border-red-500/30" },
  error: { icon: AlertTriangle, text: "خطأ في الفحص", cls: "text-yellow-400 bg-yellow-500/10 border-yellow-500/30" },
  unknown: { icon: HelpCircle, text: "غير محدد", cls: "text-muted-foreground bg-muted/50 border-border/50" },
};

export default function SendNotificationPage() {
  const queryClient = useQueryClient();
  const [selectedCountry, setSelectedCountry] = useState("IT");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [checking, setChecking] = useState(false);
  const [togglingMonitor, setTogglingMonitor] = useState(false);

  const { data: monitorEnabled, refetch: refetchMonitorStatus } = useQuery({
    queryKey: ["auto-monitor-enabled"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("site_settings")
        .select("value")
        .eq("key", "auto_monitor_enabled")
        .maybeSingle();
      if (error) throw error;
      return data?.value !== "false"; // default true
    },
  });

  const handleToggleMonitor = async () => {
    setTogglingMonitor(true);
    try {
      const newValue = monitorEnabled ? "false" : "true";
      const { error } = await supabase
        .from("site_settings")
        .update({ value: newValue })
        .eq("key", "auto_monitor_enabled");
      if (error) throw error;
      toast.success(newValue === "true" ? "تم تفعيل المراقبة التلقائية" : "تم إيقاف المراقبة التلقائية");
      refetchMonitorStatus();
    } catch (err: any) {
      toast.error(err.message || "حدث خطأ");
    } finally {
      setTogglingMonitor(false);
    }
  };

  const selectedInfo = countries.find((c) => c.code === selectedCountry)!;

  const { data: recentNotifications } = useQuery({
    queryKey: ["recent-notifications"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("visa_notifications")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(5);
      if (error) throw error;
      return data;
    },
  });

  const { data: monitorChecks } = useQuery({
    queryKey: ["monitor-checks"],
    queryFn: async () => {
      // Get latest check for each country
      const results: Record<string, any> = {};
      for (const c of countries) {
        const { data } = await supabase
          .from("visa_monitor_checks")
          .select("*")
          .eq("country_code", c.code)
          .order("checked_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (data) results[c.code] = data;
      }
      return results;
    },
    refetchInterval: 60000, // refresh every minute
  });

  const handleManualCheck = async () => {
    setChecking(true);
    try {
      const { data, error } = await supabase.functions.invoke("monitor-visa-sites", {
        body: { force: true },
      });
      if (error) throw error;
      toast.success(`تم فحص ${data?.checked?.length || 0} مواقع بنجاح`);
      queryClient.invalidateQueries({ queryKey: ["monitor-checks"] });

      if (data?.alertsSent > 0) {
        toast.success(`🚨 تم إرسال ${data.alertsSent} تنبيه تلقائي!`);
      }
    } catch (err: any) {
      toast.error(err.message || "فشل الفحص");
    } finally {
      setChecking(false);
    }
  };

  const handleQuickMessage = () => {
    setMessage(
      `تم فتح مواعيد تأشيرة ${selectedInfo.name} ${selectedInfo.flag} على موقع ${selectedInfo.provider}.\n\nسارع بالحجز الآن عبر الرابط الرسمي:\n${selectedInfo.officialUrl}`
    );
  };

  const handleSend = async () => {
    if (!message.trim()) {
      toast.error("يرجى كتابة رسالة الإشعار");
      return;
    }
    setSending(true);
    try {
      const { data, error } = await supabase.functions.invoke("send-visa-notification", {
        body: { countryCode: selectedCountry, messageAr: message },
      });
      if (error) throw error;
      toast.success(
        `تم إرسال الإشعار بنجاح عبر ${selectedInfo.provider} لمشتركي ${selectedInfo.name} (${data?.sentCount || 0}/${data?.totalSubscribers || 0} مشترك)`
      );
      setMessage("");
      queryClient.invalidateQueries({ queryKey: ["recent-notifications"] });
    } catch (err: any) {
      toast.error(err.message || "حدث خطأ أثناء الإرسال");
    } finally {
      setSending(false);
    }
  };

  const getCountryName = (code: string) => countries.find((c) => c.code === code)?.name || code;
  const getCountryFlag = (code: string) => countries.find((c) => c.code === code)?.flag || "";

  return (
    <AdminLayout title="إشعارات التأشيرات" subtitle="مراقبة تلقائية وإرسال تنبيهات فتح المواعيد">
      <div className="max-w-3xl">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>

          {/* Live Monitor Status */}
          <div className="gradient-card rounded-2xl border border-border/50 p-6 mb-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-heading text-lg font-bold text-foreground flex items-center gap-2">
                <Activity className="w-5 h-5 text-primary" />
                المراقبة التلقائية
              </h2>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleToggleMonitor}
                  disabled={togglingMonitor}
                  className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium transition-colors disabled:opacity-50 ${
                    monitorEnabled
                      ? "bg-green-500/10 text-green-400 hover:bg-green-500/20 border border-green-500/30"
                      : "bg-red-500/10 text-red-400 hover:bg-red-500/20 border border-red-500/30"
                  }`}
                >
                  <Power className="w-4 h-4" />
                  {togglingMonitor ? "..." : monitorEnabled ? "مفعّل" : "متوقف"}
                </button>
                <button
                  onClick={handleManualCheck}
                  disabled={checking}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-primary/10 text-primary text-sm font-medium hover:bg-primary/20 transition-colors disabled:opacity-50"
                >
                  <RefreshCw className={`w-4 h-4 ${checking ? "animate-spin" : ""}`} />
                  {checking ? "جاري الفحص..." : "فحص الآن"}
                </button>
              </div>
            </div>

            <div className="grid gap-3">
              {countries.map((c) => {
                const check = monitorChecks?.[c.code];
                const st = statusConfig[check?.status || "unknown"];
                const StIcon = st.icon;

                return (
                  <div key={c.code} className={`flex items-center justify-between p-4 rounded-xl border ${st.cls}`}>
                    <div className="flex items-center gap-3">
                      <span className="text-2xl">{c.flag}</span>
                      <div>
                        <p className="font-medium text-foreground">{c.name}</p>
                        <p className="text-xs text-muted-foreground">{c.provider}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="text-left">
                        <div className="flex items-center gap-1.5">
                          <StIcon className="w-4 h-4" />
                          <span className="text-sm font-medium">{st.text}</span>
                        </div>
                        {check && (
                          <p className="text-xs text-muted-foreground/60 mt-0.5">
                            {new Date(check.checked_at).toLocaleTimeString("ar", { hour: "2-digit", minute: "2-digit" })}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            <p className={`text-xs mt-3 flex items-center gap-1 ${monitorEnabled ? "text-muted-foreground" : "text-red-400/70"}`}>
              <Activity className="w-3 h-3" />
              {monitorEnabled
                ? "يتم الفحص تلقائياً كل 5 دقائق وإرسال تنبيه فوري عند اكتشاف فتح مواعيد"
                : "المراقبة التلقائية متوقفة — يمكنك الفحص يدوياً فقط"}
            </p>
          </div>

          {/* Official Sources & Send Manual Notification */}
          <div className="gradient-card rounded-2xl border border-border/50 p-6 mb-6">
            <h2 className="font-heading text-lg font-bold text-foreground mb-4 flex items-center gap-2">
              <Globe className="w-5 h-5 text-primary" />
              إرسال إشعار يدوي
            </h2>
            <div className="grid gap-3 mb-5">
              {countries.map((c) => (
                <div
                  key={c.code}
                  onClick={() => setSelectedCountry(c.code)}
                  className={`flex items-center justify-between p-4 rounded-xl border cursor-pointer transition-all ${
                    selectedCountry === c.code
                      ? "border-primary bg-primary/5 ring-1 ring-primary/30"
                      : "border-border/50 hover:border-primary/30"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">{c.flag}</span>
                    <div>
                      <p className="font-medium text-foreground">{c.name}</p>
                      <p className="text-xs text-muted-foreground">{c.provider}</p>
                    </div>
                  </div>
                  <a
                    href={c.officialUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="flex items-center gap-1 text-xs text-primary hover:underline"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    الموقع
                  </a>
                </div>
              ))}
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium text-foreground">رسالة الإشعار</label>
                <button onClick={handleQuickMessage} className="text-xs text-primary hover:underline">
                  رسالة سريعة
                </button>
              </div>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={4}
                placeholder={`مثال: تم فتح مواعيد تأشيرة ${selectedInfo.name}...`}
                className="w-full rounded-xl border border-border/50 bg-secondary/30 px-4 py-3 text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none"
              />

              {message && (
                <div className="rounded-xl bg-secondary/50 border border-border/30 p-4 text-sm space-y-1">
                  <p className="font-bold text-foreground">🔔 تنبيه - {selectedInfo.flag} {selectedInfo.name}</p>
                  <p className="text-muted-foreground whitespace-pre-wrap text-xs">{message}</p>
                </div>
              )}

              <button
                onClick={handleSend}
                disabled={sending || !message.trim()}
                className="w-full py-3.5 rounded-xl font-bold gradient-primary text-primary-foreground hover:opacity-90 flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {sending ? (
                  <div className="w-5 h-5 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
                ) : (
                  <Send className="w-4 h-4" />
                )}
                {sending ? "جاري الإرسال..." : `إرسال لمشتركي ${selectedInfo.name}`}
              </button>
            </div>
          </div>

          {/* Recent Notifications */}
          {recentNotifications && recentNotifications.length > 0 && (
            <div className="gradient-card rounded-2xl border border-border/50 p-6">
              <h3 className="font-heading text-lg font-bold text-foreground mb-4 flex items-center gap-2">
                <History className="w-5 h-5 text-primary" />
                آخر الإشعارات
              </h3>
              <div className="space-y-3">
                {recentNotifications.map((n) => (
                  <div key={n.id} className="flex items-start gap-3 p-3 rounded-xl bg-secondary/30 border border-border/30">
                    <span className="text-lg">{getCountryFlag(n.country_code)}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-sm font-medium text-foreground">{getCountryName(n.country_code)}</span>
                        <span className="text-xs text-muted-foreground">• {n.sent_count} مشترك</span>
                      </div>
                      <p className="text-xs text-muted-foreground truncate">{n.message_ar}</p>
                      <p className="text-xs text-muted-foreground/60 mt-1">
                        {new Date(n.created_at).toLocaleDateString("ar", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </motion.div>
      </div>
    </AdminLayout>
  );
}
