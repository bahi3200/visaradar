import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { format, addMonths, subMonths, startOfMonth, endOfMonth, eachDayOfInterval, startOfWeek, endOfWeek, isSameMonth, isSameDay, isToday } from "date-fns";
import { ar } from "date-fns/locale";
import { ChevronRight, ChevronLeft, Calendar as CalIcon, MapPin, ExternalLink, Filter } from "lucide-react";
import Layout from "@/components/Layout";
import SEO from "@/components/SEO";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";

interface Appointment {
  id: string;
  country_code: string;
  center_name: string | null;
  provider: string;
  appointment_type: "opening" | "available" | "closed" | "maintenance";
  appointment_date: string;
  appointment_time: string | null;
  notes: string | null;
  booking_url: string | null;
}

const typeStyles: Record<string, { label: string; bg: string; text: string; ring: string }> = {
  opening: { label: "فتح حجز", bg: "bg-emerald-500/15", text: "text-emerald-600 dark:text-emerald-400", ring: "ring-emerald-500/30" },
  available: { label: "متاح", bg: "bg-primary/15", text: "text-primary", ring: "ring-primary/30" },
  closed: { label: "مغلق", bg: "bg-destructive/15", text: "text-destructive", ring: "ring-destructive/30" },
  maintenance: { label: "صيانة", bg: "bg-muted", text: "text-muted-foreground", ring: "ring-border" },
};

const COUNTRIES: Record<string, string> = {
  FR: "🇫🇷 فرنسا",
  IT: "🇮🇹 إيطاليا",
  ES: "🇪🇸 إسبانيا",
  DE: "🇩🇪 ألمانيا",
  PT: "🇵🇹 البرتغال",
  BE: "🇧🇪 بلجيكا",
  NL: "🇳🇱 هولندا",
  CA: "🇨🇦 كندا",
  TR: "🇹🇷 تركيا",
};

export default function VisaCalendar() {
  const [cursor, setCursor] = useState(new Date());
  const [country, setCountry] = useState<string>("all");
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);

  const monthStart = startOfMonth(cursor);
  const monthEnd = endOfMonth(cursor);

  const { data: appointments = [], isLoading } = useQuery({
    queryKey: ["visa_appointments", monthStart.toISOString(), monthEnd.toISOString(), country],
    queryFn: async () => {
      let q = (supabase.from as any)("visa_appointments")
        .select("*")
        .eq("is_active", true)
        .gte("appointment_date", format(monthStart, "yyyy-MM-dd"))
        .lte("appointment_date", format(monthEnd, "yyyy-MM-dd"))
        .order("appointment_date", { ascending: true });
      if (country !== "all") q = q.eq("country_code", country);
      const { data, error } = await q;
      if (error) throw error;
      return (data as Appointment[]) || [];
    },
  });

  const days = useMemo(() => {
    const start = startOfWeek(monthStart, { weekStartsOn: 6 }); // Saturday for Arabic week
    const end = endOfWeek(monthEnd, { weekStartsOn: 6 });
    return eachDayOfInterval({ start, end });
  }, [monthStart, monthEnd]);

  const apptsByDay = useMemo(() => {
    const map = new Map<string, Appointment[]>();
    appointments.forEach((a) => {
      const key = a.appointment_date;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(a);
    });
    return map;
  }, [appointments]);

  const selectedAppts = selectedDay
    ? apptsByDay.get(format(selectedDay, "yyyy-MM-dd")) || []
    : [];

  return (
    <Layout>
      <SEO
        title="تقويم مواعيد التأشيرات | VisaRadar"
        description="تقويم تفاعلي يعرض مواعيد فتح مراكز التأشيرات لكل دولة"
      />
      <div className="container max-w-6xl py-6 md:py-10">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-6"
        >
          <h1 className="font-heading text-2xl md:text-3xl font-bold flex items-center gap-2">
            <CalIcon className="w-6 h-6 text-primary" />
            تقويم مواعيد التأشيرات
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            تابع مواعيد فتح المراكز للدول المختلفة. انقر على أي يوم لرؤية التفاصيل.
          </p>
        </motion.div>

        {/* Toolbar */}
        <Card className="border-border/40 mb-4">
          <CardContent className="p-4 flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="icon"
                onClick={() => setCursor(subMonths(cursor, 1))}
                aria-label="الشهر السابق"
              >
                <ChevronRight className="w-4 h-4" />
              </Button>
              <div className="font-heading text-lg font-bold min-w-[160px] text-center">
                {format(cursor, "MMMM yyyy", { locale: ar })}
              </div>
              <Button
                variant="outline"
                size="icon"
                onClick={() => setCursor(addMonths(cursor, 1))}
                aria-label="الشهر التالي"
              >
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setCursor(new Date())}>
                اليوم
              </Button>
            </div>
            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4 text-muted-foreground" />
              <Select value={country} onValueChange={setCountry}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="جميع الدول" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">جميع الدول</SelectItem>
                  {Object.entries(COUNTRIES).map(([code, label]) => (
                    <SelectItem key={code} value={code}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Legend */}
        <div className="flex flex-wrap gap-2 mb-4">
          {Object.entries(typeStyles).map(([k, s]) => (
            <span
              key={k}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${s.bg} ${s.text}`}
            >
              <span className={`w-1.5 h-1.5 rounded-full bg-current`} />
              {s.label}
            </span>
          ))}
        </div>

        {/* Calendar grid */}
        <Card className="border-border/40">
          <CardContent className="p-2 sm:p-4">
            <div className="grid grid-cols-7 mb-2 text-center text-[10px] sm:text-xs font-medium text-muted-foreground">
              {["السبت", "الأحد", "الإثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة"].map((d) => (
                <div key={d} className="py-1">{d}</div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-1 sm:gap-2">
              {days.map((day) => {
                const key = format(day, "yyyy-MM-dd");
                const dayAppts = apptsByDay.get(key) || [];
                const inMonth = isSameMonth(day, cursor);
                const today = isToday(day);
                const hasItems = dayAppts.length > 0;
                return (
                  <button
                    key={key}
                    onClick={() => hasItems && setSelectedDay(day)}
                    disabled={!hasItems}
                    className={`relative aspect-square rounded-lg border text-[11px] sm:text-sm flex flex-col items-center justify-start p-1 transition-all ${
                      inMonth ? "bg-card" : "bg-muted/30 text-muted-foreground/60"
                    } ${today ? "border-primary ring-1 ring-primary" : "border-border/50"} ${
                      hasItems ? "hover:bg-primary/5 cursor-pointer" : "cursor-default"
                    }`}
                  >
                    <span className={`font-medium ${today ? "text-primary" : ""}`}>
                      {format(day, "d")}
                    </span>
                    {hasItems && (
                      <div className="mt-auto flex flex-wrap gap-0.5 justify-center w-full">
                        {dayAppts.slice(0, 3).map((a) => (
                          <span
                            key={a.id}
                            className={`w-1.5 h-1.5 rounded-full ${typeStyles[a.appointment_type]?.bg.replace("/15", "")}`}
                            style={{
                              backgroundColor: "currentColor",
                              opacity: 0.8,
                            }}
                          />
                        ))}
                        {dayAppts.length > 3 && (
                          <span className="text-[9px] text-muted-foreground">+{dayAppts.length - 3}</span>
                        )}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
            {isLoading && (
              <div className="text-center text-xs text-muted-foreground py-4">
                جاري تحميل المواعيد…
              </div>
            )}
            {!isLoading && appointments.length === 0 && (
              <div className="text-center text-sm text-muted-foreground py-6">
                لا توجد مواعيد مسجّلة لهذا الشهر بعد.
              </div>
            )}
          </CardContent>
        </Card>

        {/* Day detail dialog */}
        <Dialog open={!!selectedDay} onOpenChange={() => setSelectedDay(null)}>
          <DialogContent className="max-w-md" dir="rtl">
            <DialogHeader>
              <DialogTitle>
                مواعيد {selectedDay && format(selectedDay, "EEEE d MMMM yyyy", { locale: ar })}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-3 max-h-[60vh] overflow-y-auto">
              {selectedAppts.map((a) => {
                const style = typeStyles[a.appointment_type];
                return (
                  <div
                    key={a.id}
                    className={`rounded-xl border border-border/50 p-3 ${style.bg}`}
                  >
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div>
                        <div className="font-medium text-sm">
                          {COUNTRIES[a.country_code] || a.country_code}
                        </div>
                        {a.center_name && (
                          <div className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                            <MapPin className="w-3 h-3" />
                            {a.center_name}
                          </div>
                        )}
                      </div>
                      <Badge variant="outline" className={`${style.text} border-current text-[10px]`}>
                        {a.provider}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`text-xs font-medium ${style.text}`}>
                        {style.label}
                      </span>
                      {a.appointment_time && (
                        <span className="text-xs text-muted-foreground">
                          • {a.appointment_time.slice(0, 5)}
                        </span>
                      )}
                    </div>
                    {a.notes && (
                      <p className="text-xs text-foreground/80 leading-relaxed mt-2">
                        {a.notes}
                      </p>
                    )}
                    {a.booking_url && (
                      <a
                        href={a.booking_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-xs text-primary hover:underline mt-2"
                      >
                        <ExternalLink className="w-3 h-3" />
                        رابط الحجز
                      </a>
                    )}
                  </div>
                );
              })}
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  );
}
