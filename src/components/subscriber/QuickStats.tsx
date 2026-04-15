import { forwardRef } from "react";
import { motion } from "framer-motion";
import { Globe, Bell, Shield, Calendar } from "lucide-react";
import { useReducedMotion } from "@/hooks/useReducedMotion";

interface Props {
  countries: string[];
  serviceType: string;
  countryExpiries?: Record<string, string>;
}

const countryNames: Record<string, string> = {
  IT: "🇮🇹 إيطاليا",
  FR: "🇫🇷 فرنسا",
  ES: "🇪🇸 إسبانيا",
  DE: "🇩🇪 ألمانيا",
  GR: "🇬🇷 اليونان",
};

const QuickStats = forwardRef<HTMLElement, Props>(function QuickStats({ countries, serviceType, countryExpiries = {} }, ref) {
  const reduced = useReducedMotion();
  const noMotion = { opacity: 1, y: 0 };

  const hasMultipleExpiries = Object.keys(countryExpiries).length > 0;

  return (
    <section className="container py-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {/* Countries with individual expiry dates */}
        <motion.div
          initial={reduced ? noMotion : { opacity: 0, y: 15, scale: 0.95 }}
          whileInView={{ opacity: 1, y: 0, scale: 1 }}
          viewport={{ once: true }}
          transition={{ type: "spring", stiffness: 200, damping: 20 }}
          className="relative bg-card rounded-2xl border border-primary/20 p-4 overflow-hidden"
        >
          <div className="absolute inset-0 bg-gradient-to-br from-primary/20 to-primary/5 opacity-50" />
          <div className="relative flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-xl gradient-primary flex items-center justify-center shrink-0 shadow-lg">
              <Globe className="w-5 h-5 text-primary-foreground" />
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground/70">الدول المراقبة</p>
              <p className="text-sm font-bold text-foreground">{countries.length} {countries.length === 1 ? "دولة" : "دول"}</p>
            </div>
          </div>
          {hasMultipleExpiries ? (
            <div className="relative space-y-1.5 mt-2 mr-1">
              {countries.map((c) => (
                <div key={c} className="flex items-center justify-between text-xs bg-background/50 rounded-lg px-3 py-1.5">
                  <span className="font-semibold text-foreground">{countryNames[c] || c}</span>
                  {countryExpiries[c] && (
                    <span className="flex items-center gap-1 text-muted-foreground">
                      <Calendar className="w-3 h-3" />
                      {new Date(countryExpiries[c]).toLocaleDateString("ar-DZ", { year: "numeric", month: "short", day: "numeric" })}
                    </span>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="relative text-sm font-bold text-foreground mr-13">
              {countries.map((c) => countryNames[c] || c).join("، ") || "—"}
            </p>
          )}
        </motion.div>

        {/* Service type */}
        <motion.div
          initial={reduced ? noMotion : { opacity: 0, y: 15, scale: 0.95 }}
          whileInView={{ opacity: 1, y: 0, scale: 1 }}
          viewport={{ once: true }}
          transition={{ delay: 0.1, type: "spring", stiffness: 200, damping: 20 }}
          className="relative bg-card rounded-2xl border border-accent/20 p-4 flex items-center gap-3 overflow-hidden"
        >
          <div className="absolute inset-0 bg-gradient-to-br from-accent/20 to-accent/5 opacity-50" />
          <div className="w-10 h-10 rounded-xl gradient-accent flex items-center justify-center shrink-0 shadow-lg relative">
            <Bell className="w-5 h-5 text-accent-foreground" />
          </div>
          <div className="relative">
            <p className="text-[10px] text-muted-foreground/70">نوع الخدمة</p>
            <p className="text-sm font-bold text-foreground">
              {serviceType === "visa" ? "تنبيهات تأشيرات" : serviceType === "jobs" ? "عقود عمل" : "تأشيرات + عقود"}
            </p>
          </div>
        </motion.div>

        {/* Account status */}
        <motion.div
          initial={reduced ? noMotion : { opacity: 0, y: 15, scale: 0.95 }}
          whileInView={{ opacity: 1, y: 0, scale: 1 }}
          viewport={{ once: true }}
          transition={{ delay: 0.2, type: "spring", stiffness: 200, damping: 20 }}
          className="relative bg-card rounded-2xl border border-green-500/20 p-4 flex items-center gap-3 overflow-hidden"
        >
          <div className="absolute inset-0 bg-gradient-to-br from-green-500/20 to-green-500/5 opacity-50" />
          <div className="w-10 h-10 rounded-xl bg-green-500 flex items-center justify-center shrink-0 shadow-lg relative">
            <Shield className="w-5 h-5 text-white" />
          </div>
          <div className="relative">
            <p className="text-[10px] text-muted-foreground/70">حالة الحساب</p>
            <p className="text-sm font-bold text-foreground">نشط ✅</p>
          </div>
        </motion.div>
      </div>
    </section>
  );
});

export default QuickStats;
