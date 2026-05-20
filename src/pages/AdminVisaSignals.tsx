import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Megaphone, Send, AlertTriangle, CheckCircle2, Loader2, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import AdminLayout from "@/components/AdminLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

const COUNTRIES = [
  { code: "IT", name: "إيطاليا 🇮🇹" },
  { code: "FR", name: "فرنسا 🇫🇷" },
  { code: "ES", name: "إسبانيا 🇪🇸" },
  { code: "DE", name: "ألمانيا 🇩🇪" },
  { code: "GR", name: "اليونان 🇬🇷" },
  { code: "PT", name: "البرتغال 🇵🇹" },
  { code: "BE", name: "بلجيكا 🇧🇪" },
  { code: "NL", name: "هولندا 🇳🇱" },
  { code: "CA", name: "كندا 🇨🇦" },
  { code: "TR", name: "تركيا 🇹🇷" },
];

const CATEGORIES = [
  { value: "study", label: "دراسة" },
  { value: "tourism", label: "سياحة" },
  { value: "business", label: "أعمال" },
  { value: "work", label: "عمل" },
  { value: "family", label: "زيارة عائلية" },
  { value: "medical", label: "علاج" },
  { value: "short_stay", label: "إقامة قصيرة (شنغن)" },
  { value: "long_stay", label: "إقامة طويلة" },
  { value: "all", label: "كل الفئات" },
];

const STATUSES = [
  { value: "open", label: "🟢 فُتح موعد" },
  { value: "closed", label: "🔴 أُغلق" },
  { value: "info", label: "ℹ️ معلومة" },
];

interface FormState {
  country_code: string;
  category: string;
  status: string;
  title_ar: string;
  message_ar: string;
  source: string;
  source_url: string;
  broadcast: boolean;
}

const emptyForm: FormState = {
  country_code: "IT",
  category: "study",
  status: "open",
  title_ar: "",
  message_ar: "",
  source: "",
  source_url: "",
  broadcast: true,
};

export default function AdminVisaSignals() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [form, setForm] = useState<FormState>(emptyForm);

  const { data: signals = [], isLoading } = useQuery({
    queryKey: ["visa_external_signals"],
    queryFn: async () => {
      const { data, error } = await (supabase.from as any)("visa_external_signals")
        .select("*").order("created_at", { ascending: false }).limit(50);
      if (error) throw error;
      return (data as any[]) || [];
    },
  });

  const save = useMutation({
    mutationFn: async (f: FormState) => {
      if (!user?.id) throw new Error("Not authenticated");
      if (!f.title_ar.trim()) throw new Error("العنوان مطلوب");

      const { data: inserted, error } = await (supabase.from as any)("visa_external_signals")
        .insert({
          country_code: f.country_code,
          category: f.category === "all" ? null : f.category,
          status: f.status,
          title_ar: f.title_ar.trim(),
          message_ar: f.message_ar.trim() || null,
          source: f.source.trim() || null,
          source_url: f.source_url.trim() || null,
          posted_by: user.id,
          broadcast_status: f.broadcast ? "pending" : "skipped",
        })
        .select()
        .single();
      if (error) throw error;

      if (f.broadcast && inserted?.id) {
        const { data: result, error: bErr } = await supabase.functions.invoke(
          "broadcast-visa-signal",
          { body: { signal_id: inserted.id } },
        );
        if (bErr) throw new Error(`نُشِرت الإشارة لكن فشل البث: ${bErr.message}`);
        return { inserted, broadcast: result };
      }
      return { inserted };
    },
    onSuccess: (res: any) => {
      const sent = res?.broadcast?.sent;
      toast.success(
        typeof sent === "number"
          ? `تم النشر — أُرسل التنبيه إلى ${sent} مشترك عبر تيليغرام`
          : "تم تسجيل الإشارة",
      );
      setForm(emptyForm);
      queryClient.invalidateQueries({ queryKey: ["visa_external_signals"] });
    },
    onError: (e: any) => toast.error(e?.message || "فشلت العملية"),
  });

  const rebroadcast = useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await supabase.functions.invoke("broadcast-visa-signal", {
        body: { signal_id: id },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (data: any) => {
      toast.success(`أُعيد البث إلى ${data?.sent ?? 0} مشترك`);
      queryClient.invalidateQueries({ queryKey: ["visa_external_signals"] });
    },
    onError: (e: any) => toast.error(e?.message || "فشل البث"),
  });

  return (
    <AdminLayout title="إشارات الفتح اليدوية" subtitle="ابثّ تنبيهاً فورياً عند فتح موعد لفئة معينة (دراسة، سياحة...)">
      <div className="grid lg:grid-cols-2 gap-6">
        {/* Form */}
        <Card className="border-border/40">
          <CardContent className="p-5 space-y-4">
            <div className="flex items-center gap-2 mb-2">
              <Megaphone className="w-5 h-5 text-primary" />
              <h2 className="text-base font-bold font-heading">إشارة جديدة</h2>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">الدولة</Label>
                <Select value={form.country_code} onValueChange={(v) => setForm({ ...form, country_code: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {COUNTRIES.map((c) => <SelectItem key={c.code} value={c.code}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">الفئة</Label>
                <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <Label className="text-xs">الحالة</Label>
              <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {STATUSES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="text-xs">العنوان *</Label>
              <Input
                value={form.title_ar}
                onChange={(e) => setForm({ ...form, title_ar: e.target.value })}
                placeholder="مثلاً: فتح مواعيد تأشيرة الدراسة لإيطاليا"
                maxLength={120}
              />
            </div>

            <div>
              <Label className="text-xs">تفاصيل (اختياري)</Label>
              <Textarea
                rows={3}
                value={form.message_ar}
                onChange={(e) => setForm({ ...form, message_ar: e.target.value })}
                placeholder="معلومات إضافية للمشتركين: المركز، التاريخ، شروط..."
                maxLength={800}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">المصدر</Label>
                <Input
                  value={form.source}
                  onChange={(e) => setForm({ ...form, source: e.target.value })}
                  placeholder="VFS / مستخدم / موقع رسمي"
                />
              </div>
              <div>
                <Label className="text-xs">الرابط</Label>
                <Input
                  dir="ltr"
                  value={form.source_url}
                  onChange={(e) => setForm({ ...form, source_url: e.target.value })}
                  placeholder="https://..."
                />
              </div>
            </div>

            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={form.broadcast}
                onChange={(e) => setForm({ ...form, broadcast: e.target.checked })}
                className="w-4 h-4"
              />
              <span>بثّ فوري عبر تيليغرام لكل المشتركين النشطين في هذه الدولة</span>
            </label>

            <Button
              className="w-full gap-2"
              onClick={() => save.mutate(form)}
              disabled={save.isPending}
            >
              {save.isPending ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> جارٍ النشر...</>
              ) : (
                <><Send className="w-4 h-4" /> نشر الإشارة{form.broadcast ? " وبث التنبيه" : ""}</>
              )}
            </Button>
          </CardContent>
        </Card>

        {/* History */}
        <Card className="border-border/40">
          <CardContent className="p-5">
            <h2 className="text-base font-bold font-heading mb-3">آخر الإشارات</h2>
            {isLoading ? (
              <div className="text-sm text-muted-foreground">جارٍ التحميل…</div>
            ) : signals.length === 0 ? (
              <div className="text-sm text-muted-foreground text-center py-8 flex flex-col items-center gap-2">
                <Megaphone className="w-8 h-8 text-muted-foreground/40" />
                لا توجد إشارات بعد
              </div>
            ) : (
              <div className="space-y-3 max-h-[600px] overflow-y-auto">
                {signals.map((s: any) => {
                  const country = COUNTRIES.find((c) => c.code === s.country_code);
                  const category = CATEGORIES.find((c) => c.value === s.category);
                  const statusBadge = s.status === "open"
                    ? <Badge className="bg-emerald-500/15 text-emerald-600 border-emerald-500/30">🟢 فُتح</Badge>
                    : s.status === "closed"
                      ? <Badge variant="destructive">🔴 أُغلق</Badge>
                      : <Badge variant="secondary">ℹ️</Badge>;

                  return (
                    <div key={s.id} className="rounded-lg border border-border/50 p-3 space-y-2">
                      <div className="flex items-start justify-between gap-2 flex-wrap">
                        <div className="flex items-center gap-2 flex-wrap">
                          {statusBadge}
                          <span className="text-sm font-medium">{country?.name || s.country_code}</span>
                          {category && <Badge variant="outline" className="text-xs">{category.label}</Badge>}
                        </div>
                        <span className="text-[10px] text-muted-foreground">
                          {new Date(s.created_at).toLocaleString("ar-DZ")}
                        </span>
                      </div>
                      <p className="text-sm font-semibold">{s.title_ar}</p>
                      {s.message_ar && (
                        <p className="text-xs text-muted-foreground whitespace-pre-wrap">{s.message_ar}</p>
                      )}
                      <div className="flex items-center justify-between gap-2 flex-wrap pt-1 border-t border-border/30">
                        <div className="flex items-center gap-2 text-xs">
                          {s.broadcast_status === "sent" && (
                            <span className="flex items-center gap-1 text-emerald-600">
                              <CheckCircle2 className="w-3.5 h-3.5" /> أُرسل إلى {s.recipients_count} مشترك
                            </span>
                          )}
                          {s.broadcast_status === "failed" && (
                            <span className="flex items-center gap-1 text-destructive">
                              <AlertTriangle className="w-3.5 h-3.5" /> فشل البث
                            </span>
                          )}
                          {s.broadcast_status === "pending" && (
                            <span className="text-muted-foreground">قيد البث…</span>
                          )}
                          {s.broadcast_status === "skipped" && (
                            <span className="text-muted-foreground">لم يُبثّ</span>
                          )}
                          {s.source_url && (
                            <a href={s.source_url} target="_blank" rel="noopener noreferrer"
                               className="flex items-center gap-1 text-primary hover:underline">
                              <ExternalLink className="w-3 h-3" /> رابط
                            </a>
                          )}
                        </div>
                        <Button
                          size="sm" variant="outline"
                          onClick={() => rebroadcast.mutate(s.id)}
                          disabled={rebroadcast.isPending}
                          className="h-7 text-xs gap-1"
                        >
                          <Send className="w-3 h-3" /> إعادة بث
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
}