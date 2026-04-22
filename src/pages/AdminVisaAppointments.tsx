import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { Plus, Trash2, Calendar as CalIcon, Edit3 } from "lucide-react";
import { toast } from "sonner";
import AdminLayout from "@/components/AdminLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

const PROVIDERS = ["VFS", "TLS", "BLS", "EMBASSY", "OTHER"];
const TYPES = [
  { value: "opening", label: "فتح حجز" },
  { value: "available", label: "متاح" },
  { value: "closed", label: "مغلق" },
  { value: "maintenance", label: "صيانة" },
];
const COUNTRIES = ["FR", "IT", "ES", "DE", "PT", "BE", "NL", "CA", "TR"];

interface FormState {
  id?: string;
  country_code: string;
  center_name: string;
  provider: string;
  appointment_type: string;
  appointment_date: string;
  appointment_time: string;
  notes: string;
  booking_url: string;
}

const emptyForm: FormState = {
  country_code: "FR",
  center_name: "",
  provider: "VFS",
  appointment_type: "opening",
  appointment_date: format(new Date(), "yyyy-MM-dd"),
  appointment_time: "",
  notes: "",
  booking_url: "",
};

export default function AdminVisaAppointments() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm);

  const { data: appointments = [], isLoading } = useQuery({
    queryKey: ["admin_visa_appointments"],
    queryFn: async () => {
      const { data, error } = await (supabase.from as any)("visa_appointments")
        .select("*")
        .order("appointment_date", { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data as any[]) || [];
    },
  });

  const save = useMutation({
    mutationFn: async (f: FormState) => {
      const payload = {
        country_code: f.country_code,
        center_name: f.center_name || null,
        provider: f.provider,
        appointment_type: f.appointment_type,
        appointment_date: f.appointment_date,
        appointment_time: f.appointment_time || null,
        notes: f.notes || null,
        booking_url: f.booking_url || null,
        created_by: user?.id,
      };
      if (f.id) {
        const { error } = await (supabase.from as any)("visa_appointments")
          .update(payload).eq("id", f.id);
        if (error) throw error;
      } else {
        const { error } = await (supabase.from as any)("visa_appointments")
          .insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(form.id ? "تم تحديث الموعد" : "تمت إضافة الموعد");
      queryClient.invalidateQueries({ queryKey: ["admin_visa_appointments"] });
      queryClient.invalidateQueries({ queryKey: ["visa_appointments"] });
      setOpen(false);
      setForm(emptyForm);
    },
    onError: (e: any) => toast.error(e.message || "فشل الحفظ"),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase.from as any)("visa_appointments")
        .delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("تم الحذف");
      queryClient.invalidateQueries({ queryKey: ["admin_visa_appointments"] });
      queryClient.invalidateQueries({ queryKey: ["visa_appointments"] });
    },
    onError: () => toast.error("فشل الحذف"),
  });

  const handleEdit = (a: any) => {
    setForm({
      id: a.id,
      country_code: a.country_code,
      center_name: a.center_name || "",
      provider: a.provider,
      appointment_type: a.appointment_type,
      appointment_date: a.appointment_date,
      appointment_time: a.appointment_time || "",
      notes: a.notes || "",
      booking_url: a.booking_url || "",
    });
    setOpen(true);
  };

  return (
    <AdminLayout title="تقويم مواعيد التأشيرات" subtitle="إدارة مواعيد فتح المراكز للدول">
      <div className="flex justify-end mb-4">
        <Button onClick={() => { setForm(emptyForm); setOpen(true); }} className="gap-2">
          <Plus className="w-4 h-4" />
          إضافة موعد
        </Button>
      </div>

      <Card className="border-border/40">
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-8 text-center text-muted-foreground">جارٍ التحميل…</div>
          ) : appointments.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground flex flex-col items-center gap-2">
              <CalIcon className="w-8 h-8 text-muted-foreground/40" />
              لا توجد مواعيد مسجّلة بعد
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right">التاريخ</TableHead>
                    <TableHead className="text-right">الدولة</TableHead>
                    <TableHead className="text-right">المركز</TableHead>
                    <TableHead className="text-right">النوع</TableHead>
                    <TableHead className="text-right">المزود</TableHead>
                    <TableHead className="text-right">إجراء</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {appointments.map((a: any) => (
                    <TableRow key={a.id}>
                      <TableCell className="text-sm whitespace-nowrap">
                        {a.appointment_date}
                        {a.appointment_time && (
                          <span className="text-xs text-muted-foreground mr-1">
                            {a.appointment_time.slice(0, 5)}
                          </span>
                        )}
                      </TableCell>
                      <TableCell>{a.country_code}</TableCell>
                      <TableCell className="text-xs">{a.center_name || "—"}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs">
                          {TYPES.find((t) => t.value === a.appointment_type)?.label || a.appointment_type}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs">{a.provider}</TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button size="icon" variant="ghost" onClick={() => handleEdit(a)}>
                            <Edit3 className="w-4 h-4" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => {
                              if (confirm("حذف هذا الموعد؟")) remove.mutate(a.id);
                            }}
                          >
                            <Trash2 className="w-4 h-4 text-destructive" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md" dir="rtl">
          <DialogHeader>
            <DialogTitle>{form.id ? "تعديل موعد" : "إضافة موعد جديد"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">الدولة</Label>
                <Select value={form.country_code} onValueChange={(v) => setForm({ ...form, country_code: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {COUNTRIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">المزود</Label>
                <Select value={form.provider} onValueChange={(v) => setForm({ ...form, provider: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PROVIDERS.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label className="text-xs">اسم المركز</Label>
              <Input value={form.center_name} onChange={(e) => setForm({ ...form, center_name: e.target.value })} placeholder="مثلاً: VFS Algiers" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">التاريخ</Label>
                <Input type="date" value={form.appointment_date} onChange={(e) => setForm({ ...form, appointment_date: e.target.value })} />
              </div>
              <div>
                <Label className="text-xs">الوقت (اختياري)</Label>
                <Input type="time" value={form.appointment_time} onChange={(e) => setForm({ ...form, appointment_time: e.target.value })} />
              </div>
            </div>
            <div>
              <Label className="text-xs">النوع</Label>
              <Select value={form.appointment_type} onValueChange={(v) => setForm({ ...form, appointment_type: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">رابط الحجز (اختياري)</Label>
              <Input dir="ltr" value={form.booking_url} onChange={(e) => setForm({ ...form, booking_url: e.target.value })} placeholder="https://..." />
            </div>
            <div>
              <Label className="text-xs">ملاحظات</Label>
              <Textarea rows={3} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>إلغاء</Button>
            <Button onClick={() => save.mutate(form)} disabled={save.isPending}>
              {save.isPending ? "جارٍ الحفظ…" : "حفظ"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}
