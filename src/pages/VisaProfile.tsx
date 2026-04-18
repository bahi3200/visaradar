import { forwardRef, useEffect, useMemo, useState } from "react";
import { z } from "zod";
import Layout from "@/components/Layout";
import BackButton from "@/components/BackButton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Copy, Check, Plus, Trash2, Save, FileText, User, BookOpen,
  Phone, Briefcase, Plane, Users, Loader2, Star, Pencil, ClipboardCopy, AlertTriangle, MessageCircle,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

interface VisaProfile {
  id: string;
  user_id: string;
  profile_label: string;
  is_primary: boolean;
  // Personal
  full_name_ar: string | null;
  full_name_latin: string | null;
  gender: string | null;
  birth_date: string | null;
  birth_place: string | null;
  nationality: string | null;
  marital_status: string | null;
  // Passport
  passport_number: string | null;
  passport_issue_date: string | null;
  passport_expiry_date: string | null;
  passport_issue_place: string | null;
  national_id: string | null;
  // Contact
  phone: string | null;
  email: string | null;
  address: string | null;
  city: string | null;
  wilaya: string | null;
  postal_code: string | null;
  // Profession
  profession: string | null;
  employer_name: string | null;
  employer_address: string | null;
  employer_phone: string | null;
  monthly_income: string | null;
  // Travel
  destination_country: string | null;
  travel_purpose: string | null;
  travel_date: string | null;
  return_date: string | null;
  duration_days: number | null;
  hotel_or_host: string | null;
  // Family
  father_name: string | null;
  mother_name: string | null;
  spouse_name: string | null;
  children_count: number | null;
  children_details: string | null;
  // Notes
  notes: string | null;
}

type FormState = Omit<VisaProfile, "id" | "user_id">;

const EMPTY: FormState = {
  profile_label: "ملفي",
  is_primary: false,
  full_name_ar: "", full_name_latin: "", gender: "", birth_date: "", birth_place: "",
  nationality: "", marital_status: "",
  passport_number: "", passport_issue_date: "", passport_expiry_date: "",
  passport_issue_place: "", national_id: "",
  phone: "", email: "", address: "", city: "", wilaya: "", postal_code: "",
  profession: "", employer_name: "", employer_address: "", employer_phone: "", monthly_income: "",
  destination_country: "", travel_purpose: "", travel_date: "", return_date: "",
  duration_days: null, hotel_or_host: "",
  father_name: "", mother_name: "", spouse_name: "", children_count: null, children_details: "",
  notes: "",
};

const profileSchema = z.object({
  profile_label: z.string().trim().min(1, "اسم الملف مطلوب").max(50, "أقصى 50 حرف"),
  full_name_ar: z.string().max(100).nullable().optional(),
  full_name_latin: z.string().max(100).nullable().optional(),
  email: z.string().trim().max(255).email("بريد غير صحيح").or(z.literal("")).nullable().optional(),
  phone: z.string().max(30).nullable().optional(),
  passport_number: z.string().max(30).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
});

const CopyField = ({ label, value, type = "text", multiline = false }: {
  label: string; value: string | null | undefined; type?: string; multiline?: boolean;
}) => {
  const [copied, setCopied] = useState(false);
  const text = (value ?? "").toString().trim();
  const handleCopy = async () => {
    if (!text) {
      toast.error("لا يوجد قيمة للنسخ");
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      toast.success(`تم نسخ: ${label}`);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("فشل النسخ");
    }
  };
  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <div className="flex items-stretch gap-1.5">
        {multiline ? (
          <Textarea readOnly value={text} className="min-h-[60px] bg-muted/30 text-sm" />
        ) : (
          <Input readOnly value={text} type={type} className="bg-muted/30 text-sm" dir={type === "email" ? "ltr" : undefined} />
        )}
        <Button
          type="button"
          size="icon"
          variant={copied ? "default" : "outline"}
          onClick={handleCopy}
          className="shrink-0"
          title="نسخ"
        >
          {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
        </Button>
      </div>
    </div>
  );
};

const FormField = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div className="space-y-1.5">
    <Label className="text-xs text-muted-foreground">{label}</Label>
    {children}
  </div>
);

type SectionField = { label: string; value: string | number | null | undefined };

const CopySectionButton = forwardRef<
  HTMLButtonElement,
  { title: string; fields: SectionField[] }
>(({ title, fields }, ref) => {
  const [copied, setCopied] = useState(false);
  const handleCopy = async () => {
    const lines = fields
      .map((f) => {
        const v = f.value === null || f.value === undefined ? "" : String(f.value).trim();
        return v ? `${f.label}: ${v}` : null;
      })
      .filter(Boolean) as string[];

    if (lines.length === 0) {
      toast.error("لا توجد بيانات للنسخ في هذا القسم");
      return;
    }
    const text = `— ${title} —\n${lines.join("\n")}`;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      toast.success(`تم نسخ قسم: ${title} (${lines.length} حقل)`);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("فشل النسخ");
    }
  };
  return (
    <div className="flex items-center justify-between pt-4 pb-1">
      <span className="text-xs text-muted-foreground">{fields.length} حقل في هذا القسم</span>
      <Button
        ref={ref}
        type="button"
        size="sm"
        variant={copied ? "default" : "outline"}
        onClick={handleCopy}
        className="h-8"
      >
        {copied ? <Check className="w-3.5 h-3.5 ml-1.5" /> : <ClipboardCopy className="w-3.5 h-3.5 ml-1.5" />}
        نسخ كل القسم
      </Button>
    </div>
  );
});
CopySectionButton.displayName = "CopySectionButton";

type ProfileSection = { title: string; fields: SectionField[] };

const buildFullProfileText = (profileLabel: string, sections: ProfileSection[]) => {
  const blocks: string[] = [];
  let totalFields = 0;
  for (const section of sections) {
    const lines = section.fields
      .map((f) => {
        const v = f.value === null || f.value === undefined ? "" : String(f.value).trim();
        return v ? `${f.label}: ${v}` : null;
      })
      .filter(Boolean) as string[];
    if (lines.length === 0) continue;
    totalFields += lines.length;
    blocks.push(`━━━ ${section.title} ━━━\n${lines.join("\n")}`);
  }
  const header = `📋 ${profileLabel}\n`;
  return { text: blocks.length ? `${header}\n${blocks.join("\n\n")}` : "", totalFields };
};

const getAllSections = (p: VisaProfile): ProfileSection[] => [
  {
    title: "بيانات شخصية",
    fields: [
      { label: "الاسم الكامل (عربي)", value: p.full_name_ar },
      { label: "الاسم الكامل (لاتيني)", value: p.full_name_latin },
      { label: "الجنس", value: p.gender },
      { label: "تاريخ الميلاد", value: p.birth_date },
      { label: "مكان الميلاد", value: p.birth_place },
      { label: "الجنسية", value: p.nationality },
      { label: "الحالة العائلية", value: p.marital_status },
    ],
  },
  {
    title: "بيانات الجواز",
    fields: [
      { label: "رقم جواز السفر", value: p.passport_number },
      { label: "تاريخ الإصدار", value: p.passport_issue_date },
      { label: "تاريخ الانتهاء", value: p.passport_expiry_date },
      { label: "مكان الإصدار", value: p.passport_issue_place },
      { label: "رقم البطاقة الوطنية", value: p.national_id },
    ],
  },
  {
    title: "بيانات الاتصال",
    fields: [
      { label: "الهاتف", value: p.phone },
      { label: "البريد الإلكتروني", value: p.email },
      { label: "العنوان", value: p.address },
      { label: "المدينة", value: p.city },
      { label: "الولاية", value: p.wilaya },
      { label: "الرمز البريدي", value: p.postal_code },
    ],
  },
  {
    title: "بيانات المهنة",
    fields: [
      { label: "المهنة", value: p.profession },
      { label: "اسم صاحب العمل", value: p.employer_name },
      { label: "عنوان العمل", value: p.employer_address },
      { label: "هاتف العمل", value: p.employer_phone },
      { label: "الدخل الشهري", value: p.monthly_income },
    ],
  },
  {
    title: "بيانات السفر",
    fields: [
      { label: "بلد الوجهة", value: p.destination_country },
      { label: "الغرض من الزيارة", value: p.travel_purpose },
      { label: "تاريخ السفر", value: p.travel_date },
      { label: "تاريخ العودة", value: p.return_date },
      { label: "مدة الإقامة (أيام)", value: p.duration_days },
      { label: "الفندق / المضيف", value: p.hotel_or_host },
    ],
  },
  {
    title: "بيانات العائلة",
    fields: [
      { label: "اسم الأب", value: p.father_name },
      { label: "اسم الأم", value: p.mother_name },
      { label: "اسم الزوج/الزوجة", value: p.spouse_name },
      { label: "عدد الأطفال", value: p.children_count },
      { label: "بيانات الأطفال", value: p.children_details },
    ],
  },
  {
    title: "ملاحظات",
    fields: [{ label: "ملاحظات", value: p.notes }],
  },
];

const countFilled = (vals: Array<string | number | null | undefined>) =>
  vals.filter((v) => v !== null && v !== undefined && String(v).trim() !== "").length;

const getTabStats = (p: VisaProfile) => ({
  personal: {
    filled: countFilled([p.full_name_ar, p.full_name_latin, p.gender, p.birth_date, p.birth_place, p.nationality, p.marital_status]),
    total: 7,
  },
  passport: {
    filled: countFilled([p.passport_number, p.passport_issue_date, p.passport_expiry_date, p.passport_issue_place, p.national_id]),
    total: 5,
  },
  contact: {
    filled: countFilled([p.phone, p.email, p.address, p.city, p.wilaya, p.postal_code]),
    total: 6,
  },
  profession: {
    filled: countFilled([p.profession, p.employer_name, p.employer_address, p.employer_phone, p.monthly_income]),
    total: 5,
  },
  travel: {
    filled: countFilled([p.destination_country, p.travel_purpose, p.travel_date, p.return_date, p.duration_days, p.hotel_or_host]),
    total: 6,
  },
  family: {
    filled: countFilled([p.father_name, p.mother_name, p.spouse_name, p.children_count, p.children_details]),
    total: 5,
  },
});

const TabBadge = ({ filled, total }: { filled: number; total: number }) => {
  const isComplete = filled === total && total > 0;
  const isEmpty = filled === 0;
  const variant: "default" | "destructive" | "secondary" = isComplete ? "default" : isEmpty ? "destructive" : "secondary";
  return (
    <Badge
      variant={variant}
      className="ml-1.5 h-4 px-1.5 text-[10px] leading-none font-medium tabular-nums"
      aria-label={`${filled} من ${total} حقل مكتمل`}
    >
      {filled}/{total}
    </Badge>
  );
};

const CopyFullProfileButton = forwardRef<
  HTMLButtonElement,
  { profile: VisaProfile }
>(({ profile }, ref) => {
  const [copied, setCopied] = useState(false);
  const handleCopy = async () => {
    const sections = getAllSections(profile);
    const { text, totalFields } = buildFullProfileText(profile.profile_label, sections);
    if (!text) {
      toast.error("لا توجد بيانات لنسخها بعد");
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      toast.success(`تم نسخ كامل الملف (${totalFields} حقل)`);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      toast.error("فشل النسخ");
    }
  };
  return (
    <Button
      ref={ref}
      type="button"
      size="sm"
      variant={copied ? "default" : "secondary"}
      onClick={handleCopy}
      className="h-8"
    >
      {copied ? <Check className="w-3.5 h-3.5 ml-1.5" /> : <ClipboardCopy className="w-3.5 h-3.5 ml-1.5" />}
      نسخ كل الملف
    </Button>
  );
});
CopyFullProfileButton.displayName = "CopyFullProfileButton";

export default function VisaProfile() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [profiles, setProfiles] = useState<VisaProfile[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const fetchPrefillFromProfile = async (): Promise<Partial<FormState>> => {
    if (!user) return {};
    const { data } = await supabase
      .from("profiles")
      .select("full_name, phone")
      .eq("user_id", user.id)
      .maybeSingle();
    return {
      full_name_ar: data?.full_name?.trim() || "",
      phone: data?.phone?.trim() || "",
      email: user.email || "",
    };
  };

  const fetchProfiles = async () => {
    if (!user) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("visa_profiles")
      .select("*")
      .order("is_primary", { ascending: false })
      .order("created_at", { ascending: true });
    if (error) {
      toast.error(error.message);
      setLoading(false);
      return;
    }
    const list = (data || []) as VisaProfile[];
    setProfiles(list);
    if (list.length > 0 && !activeId) {
      setActiveId(list[0].id);
    } else if (list.length === 0) {
      // Auto-open new form if no profiles, with prefill from profiles table
      const prefill = await fetchPrefillFromProfile();
      setEditing(true);
      setForm({ ...EMPTY, is_primary: true, ...prefill });
      const prefilledCount = Object.values(prefill).filter((v) => v && String(v).trim()).length;
      if (prefilledCount > 0) {
        toast.success(`تم تعبئة ${prefilledCount} حقل تلقائياً من ملفك الشخصي`);
      }
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchProfiles();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const active = useMemo(
    () => profiles.find((p) => p.id === activeId) || null,
    [profiles, activeId]
  );

  const startEdit = () => {
    if (!active) return;
    const { id, user_id, ...rest } = active;
    setForm(rest as FormState);
    setEditing(true);
  };

  const startNew = async () => {
    setActiveId(null);
    const prefill = await fetchPrefillFromProfile();
    setForm({ ...EMPTY, is_primary: profiles.length === 0, ...prefill });
    setEditing(true);
  };

  const cancelEdit = () => {
    setEditing(false);
    if (profiles.length > 0 && !activeId) {
      setActiveId(profiles[0].id);
    }
  };

  const handleSave = async () => {
    if (!user) return;
    const result = profileSchema.safeParse(form);
    if (!result.success) {
      toast.error(result.error.issues[0]?.message || "يرجى مراجعة الحقول");
      return;
    }
    setSaving(true);
    try {
      // Build typed payload, normalizing empty strings to null
      const normalize = <T,>(v: T): T | null =>
        (typeof v === "string" && v.trim() === "" ? null : v) as T | null;

      const payload = {
        user_id: user.id,
        profile_label: form.profile_label.trim() || "ملفي",
        is_primary: form.is_primary,
        full_name_ar: normalize(form.full_name_ar),
        full_name_latin: normalize(form.full_name_latin),
        gender: normalize(form.gender),
        birth_date: normalize(form.birth_date),
        birth_place: normalize(form.birth_place),
        nationality: normalize(form.nationality),
        marital_status: normalize(form.marital_status),
        passport_number: normalize(form.passport_number),
        passport_issue_date: normalize(form.passport_issue_date),
        passport_expiry_date: normalize(form.passport_expiry_date),
        passport_issue_place: normalize(form.passport_issue_place),
        national_id: normalize(form.national_id),
        phone: normalize(form.phone),
        email: normalize(form.email),
        address: normalize(form.address),
        city: normalize(form.city),
        wilaya: normalize(form.wilaya),
        postal_code: normalize(form.postal_code),
        profession: normalize(form.profession),
        employer_name: normalize(form.employer_name),
        employer_address: normalize(form.employer_address),
        employer_phone: normalize(form.employer_phone),
        monthly_income: normalize(form.monthly_income),
        destination_country: normalize(form.destination_country),
        travel_purpose: normalize(form.travel_purpose),
        travel_date: normalize(form.travel_date),
        return_date: normalize(form.return_date),
        duration_days: form.duration_days,
        hotel_or_host: normalize(form.hotel_or_host),
        father_name: normalize(form.father_name),
        mother_name: normalize(form.mother_name),
        spouse_name: normalize(form.spouse_name),
        children_count: form.children_count,
        children_details: normalize(form.children_details),
        notes: normalize(form.notes),
      };

      let savedId = activeId;
      if (activeId) {
        const { error } = await supabase
          .from("visa_profiles")
          .update(payload)
          .eq("id", activeId);
        if (error) throw error;
        toast.success("تم حفظ التعديلات");
      } else {
        const { data, error } = await supabase
          .from("visa_profiles")
          .insert(payload)
          .select()
          .single();
        if (error) throw error;
        if (data) {
          savedId = data.id;
          setActiveId(data.id);
        }
        toast.success("تم إنشاء الملف");
      }

      // If marking primary, unmark others
      if (form.is_primary && savedId) {
        await supabase
          .from("visa_profiles")
          .update({ is_primary: false })
          .eq("user_id", user.id)
          .neq("id", savedId);
      }

      setEditing(false);
      await fetchProfiles();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "فشل الحفظ");
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteId) return;
    const { error } = await supabase.from("visa_profiles").delete().eq("id", deleteId);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("تم حذف الملف");
    if (activeId === deleteId) setActiveId(null);
    setDeleteId(null);
    await fetchProfiles();
  };

  if (loading) {
    return (
      <Layout>
        <div className="container py-12 flex items-center justify-center">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="container py-6 max-w-5xl" dir="rtl">
        <BackButton />

        <div className="flex items-center justify-between mt-4 mb-6 flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <FileText className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">ملفي للفيزا</h1>
              <p className="text-xs text-muted-foreground">
                احفظ بياناتك مرة واحدة وانسخها بنقرة عند التسجيل في مواقع الفيزا
              </p>
            </div>
          </div>
          {!editing && (
            <Button onClick={startNew} size="sm">
              <Plus className="w-4 h-4 ml-2" />
              ملف جديد
            </Button>
          )}
        </div>

        {/* Profile selector */}
        {profiles.length > 0 && !editing && (
          <div className="mb-4 flex flex-wrap gap-2">
            {profiles.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setActiveId(p.id)}
                className={`inline-flex items-center gap-2 px-3 h-9 rounded-full text-sm border transition-colors ${
                  activeId === p.id
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-background text-muted-foreground border-border hover:bg-muted"
                }`}
              >
                {p.is_primary && <Star className="w-3.5 h-3.5 fill-current" />}
                <span className="truncate max-w-[180px]">{p.profile_label}</span>
              </button>
            ))}
          </div>
        )}

        {/* View mode */}
        {!editing && active && (
          <Card>
            <CardHeader>
                <div className="flex items-center justify-between flex-wrap gap-3">
                  <div className="flex items-center gap-2">
                    <CardTitle className="text-lg">{active.profile_label}</CardTitle>
                    {active.is_primary && (
                      <Badge className="bg-amber-500/15 text-amber-600 border-amber-500/30">
                        <Star className="w-3 h-3 ml-1 fill-current" />
                        أساسي
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <CopyFullProfileButton profile={active} />
                    <Button size="sm" variant="outline" onClick={startEdit}>
                      <Pencil className="w-3.5 h-3.5 ml-1.5" />
                      تعديل
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-destructive border-destructive/40 hover:bg-destructive/10"
                      onClick={() => setDeleteId(active.id)}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
            </CardHeader>
            <CardContent>
              {(() => {
                const stats = getTabStats(active);
                return (
              <Tabs defaultValue="personal" className="w-full">
                <TabsList className="w-full overflow-x-auto flex-nowrap justify-start scrollbar-hide">
                  <TabsTrigger value="personal" className="shrink-0">
                    <User className="w-3.5 h-3.5 ml-1.5" />شخصية
                    <TabBadge filled={stats.personal.filled} total={stats.personal.total} />
                  </TabsTrigger>
                  <TabsTrigger value="passport" className="shrink-0">
                    <BookOpen className="w-3.5 h-3.5 ml-1.5" />جواز
                    <TabBadge filled={stats.passport.filled} total={stats.passport.total} />
                  </TabsTrigger>
                  <TabsTrigger value="contact" className="shrink-0">
                    <Phone className="w-3.5 h-3.5 ml-1.5" />اتصال
                    <TabBadge filled={stats.contact.filled} total={stats.contact.total} />
                  </TabsTrigger>
                  <TabsTrigger value="profession" className="shrink-0">
                    <Briefcase className="w-3.5 h-3.5 ml-1.5" />مهنة
                    <TabBadge filled={stats.profession.filled} total={stats.profession.total} />
                  </TabsTrigger>
                  <TabsTrigger value="travel" className="shrink-0">
                    <Plane className="w-3.5 h-3.5 ml-1.5" />سفر
                    <TabBadge filled={stats.travel.filled} total={stats.travel.total} />
                  </TabsTrigger>
                  <TabsTrigger value="family" className="shrink-0">
                    <Users className="w-3.5 h-3.5 ml-1.5" />عائلة
                    <TabBadge filled={stats.family.filled} total={stats.family.total} />
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="personal" className="pt-2">
                  <CopySectionButton
                    title="بيانات شخصية"
                    fields={[
                      { label: "الاسم الكامل (عربي)", value: active.full_name_ar },
                      { label: "الاسم الكامل (لاتيني)", value: active.full_name_latin },
                      { label: "الجنس", value: active.gender },
                      { label: "تاريخ الميلاد", value: active.birth_date },
                      { label: "مكان الميلاد", value: active.birth_place },
                      { label: "الجنسية", value: active.nationality },
                      { label: "الحالة العائلية", value: active.marital_status },
                    ]}
                  />
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                    <CopyField label="الاسم الكامل (عربي)" value={active.full_name_ar} />
                    <CopyField label="الاسم الكامل (لاتيني)" value={active.full_name_latin} />
                    <CopyField label="الجنس" value={active.gender} />
                    <CopyField label="تاريخ الميلاد" value={active.birth_date} />
                    <CopyField label="مكان الميلاد" value={active.birth_place} />
                    <CopyField label="الجنسية" value={active.nationality} />
                    <CopyField label="الحالة العائلية" value={active.marital_status} />
                  </div>
                </TabsContent>

                <TabsContent value="passport" className="pt-2">
                  {(() => {
                    if (!active.passport_expiry_date) return null;
                    const expiry = new Date(active.passport_expiry_date);
                    if (Number.isNaN(expiry.getTime())) return null;
                    const today = new Date();
                    today.setHours(0, 0, 0, 0);
                    const msPerDay = 1000 * 60 * 60 * 24;
                    const daysLeft = Math.ceil((expiry.getTime() - today.getTime()) / msPerDay);
                    const sixMonthsMs = 1000 * 60 * 60 * 24 * 30 * 6;
                    const isExpired = daysLeft < 0;
                    const isExpiringSoon = !isExpired && expiry.getTime() - today.getTime() < sixMonthsMs;
                    if (!isExpired && !isExpiringSoon) return null;
                    return (
                      <div
                        role="alert"
                        className="mt-3 flex items-start gap-3 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-destructive"
                      >
                        <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
                        <div className="flex-1 text-sm leading-relaxed">
                          {isExpired ? (
                            <>
                              <strong className="font-semibold">جوازك منتهي الصلاحية!</strong>{" "}
                              انتهى منذ {Math.abs(daysLeft)} يوماً ({expiry.toLocaleDateString("ar-DZ")}). معظم الدول تشترط صلاحية 6 أشهر متبقية على الأقل لقبول طلب الفيزا.
                            </>
                          ) : (
                            <>
                              <strong className="font-semibold">تنبيه: جوازك يقترب من الانتهاء</strong>{" "}
                              — متبقّي {daysLeft} يوماً فقط (ينتهي في {expiry.toLocaleDateString("ar-DZ")}). معظم الدول تشترط صلاحية 6 أشهر متبقية على الأقل، يُنصح بتجديده قبل التقديم.
                            </>
                          )}
                        </div>
                      </div>
                    );
                  })()}
                  <CopySectionButton
                    title="بيانات الجواز"
                    fields={[
                      { label: "رقم جواز السفر", value: active.passport_number },
                      { label: "تاريخ الإصدار", value: active.passport_issue_date },
                      { label: "تاريخ الانتهاء", value: active.passport_expiry_date },
                      { label: "مكان الإصدار", value: active.passport_issue_place },
                      { label: "رقم البطاقة الوطنية", value: active.national_id },
                    ]}
                  />
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                    <CopyField label="رقم جواز السفر" value={active.passport_number} />
                    <CopyField label="تاريخ الإصدار" value={active.passport_issue_date} />
                    <CopyField label="تاريخ الانتهاء" value={active.passport_expiry_date} />
                    <CopyField label="مكان الإصدار" value={active.passport_issue_place} />
                    <CopyField label="رقم البطاقة الوطنية" value={active.national_id} />
                  </div>
                </TabsContent>

                <TabsContent value="contact" className="pt-2">
                  <CopySectionButton
                    title="بيانات الاتصال"
                    fields={[
                      { label: "الهاتف", value: active.phone },
                      { label: "البريد الإلكتروني", value: active.email },
                      { label: "العنوان", value: active.address },
                      { label: "المدينة", value: active.city },
                      { label: "الولاية", value: active.wilaya },
                      { label: "الرمز البريدي", value: active.postal_code },
                    ]}
                  />
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                    <CopyField label="الهاتف" value={active.phone} />
                    <CopyField label="البريد الإلكتروني" value={active.email} type="email" />
                    <CopyField label="العنوان" value={active.address} multiline />
                    <CopyField label="المدينة" value={active.city} />
                    <CopyField label="الولاية" value={active.wilaya} />
                    <CopyField label="الرمز البريدي" value={active.postal_code} />
                  </div>
                </TabsContent>

                <TabsContent value="profession" className="pt-2">
                  <CopySectionButton
                    title="بيانات المهنة"
                    fields={[
                      { label: "المهنة", value: active.profession },
                      { label: "اسم صاحب العمل", value: active.employer_name },
                      { label: "عنوان العمل", value: active.employer_address },
                      { label: "هاتف العمل", value: active.employer_phone },
                      { label: "الدخل الشهري", value: active.monthly_income },
                    ]}
                  />
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                    <CopyField label="المهنة" value={active.profession} />
                    <CopyField label="اسم صاحب العمل" value={active.employer_name} />
                    <CopyField label="عنوان العمل" value={active.employer_address} multiline />
                    <CopyField label="هاتف العمل" value={active.employer_phone} />
                    <CopyField label="الدخل الشهري" value={active.monthly_income} />
                  </div>
                </TabsContent>

                <TabsContent value="travel" className="pt-2">
                  <CopySectionButton
                    title="بيانات السفر"
                    fields={[
                      { label: "بلد الوجهة", value: active.destination_country },
                      { label: "الغرض من الزيارة", value: active.travel_purpose },
                      { label: "تاريخ السفر", value: active.travel_date },
                      { label: "تاريخ العودة", value: active.return_date },
                      { label: "مدة الإقامة (أيام)", value: active.duration_days },
                      { label: "الفندق / المضيف", value: active.hotel_or_host },
                    ]}
                  />
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                    <CopyField label="بلد الوجهة" value={active.destination_country} />
                    <CopyField label="الغرض من الزيارة" value={active.travel_purpose} />
                    <CopyField label="تاريخ السفر" value={active.travel_date} />
                    <CopyField label="تاريخ العودة" value={active.return_date} />
                    <CopyField label="مدة الإقامة (أيام)" value={active.duration_days?.toString() || ""} />
                    <CopyField label="الفندق / المضيف" value={active.hotel_or_host} multiline />
                  </div>
                </TabsContent>

                <TabsContent value="family" className="pt-2">
                  <CopySectionButton
                    title="بيانات العائلة"
                    fields={[
                      { label: "اسم الأب", value: active.father_name },
                      { label: "اسم الأم", value: active.mother_name },
                      { label: "اسم الزوج/الزوجة", value: active.spouse_name },
                      { label: "عدد الأطفال", value: active.children_count },
                      { label: "بيانات الأطفال", value: active.children_details },
                    ]}
                  />
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                    <CopyField label="اسم الأب" value={active.father_name} />
                    <CopyField label="اسم الأم" value={active.mother_name} />
                    <CopyField label="اسم الزوج/الزوجة" value={active.spouse_name} />
                    <CopyField label="عدد الأطفال" value={active.children_count?.toString() || ""} />
                    <div className="sm:col-span-2">
                      <CopyField label="بيانات الأطفال (الأسماء وتواريخ الميلاد)" value={active.children_details} multiline />
                    </div>
                  </div>
                </TabsContent>
              </Tabs>
                );
              })()}

              {active.notes && (
                <div className="mt-6 pt-4 border-t">
                  <CopyField label="ملاحظات" value={active.notes} multiline />
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Edit / New mode */}
        {editing && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">
                {activeId ? "تعديل الملف" : "ملف جديد"}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <FormField label="اسم الملف *">
                  <Input
                    value={form.profile_label}
                    onChange={(e) => setForm({ ...form, profile_label: e.target.value })}
                    placeholder="مثال: ملفي / ابنتي سارة"
                    maxLength={50}
                  />
                </FormField>
                <FormField label="ملف أساسي">
                  <label className="flex items-center gap-2 h-10 px-3 rounded-md border bg-muted/30 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={form.is_primary}
                      onChange={(e) => setForm({ ...form, is_primary: e.target.checked })}
                      className="w-4 h-4"
                    />
                    <span className="text-sm">جعله الملف الأساسي</span>
                  </label>
                </FormField>
              </div>

              <Tabs defaultValue="personal" className="w-full">
                <TabsList className="w-full overflow-x-auto flex-nowrap justify-start scrollbar-hide">
                  <TabsTrigger value="personal" className="shrink-0">شخصية</TabsTrigger>
                  <TabsTrigger value="passport" className="shrink-0">جواز</TabsTrigger>
                  <TabsTrigger value="contact" className="shrink-0">اتصال</TabsTrigger>
                  <TabsTrigger value="profession" className="shrink-0">مهنة</TabsTrigger>
                  <TabsTrigger value="travel" className="shrink-0">سفر</TabsTrigger>
                  <TabsTrigger value="family" className="shrink-0">عائلة</TabsTrigger>
                </TabsList>

                <TabsContent value="personal" className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-4">
                  <FormField label="الاسم الكامل (عربي)">
                    <Input value={form.full_name_ar || ""} onChange={(e) => setForm({ ...form, full_name_ar: e.target.value })} maxLength={100} />
                  </FormField>
                  <FormField label="الاسم الكامل (لاتيني)">
                    <Input value={form.full_name_latin || ""} onChange={(e) => setForm({ ...form, full_name_latin: e.target.value })} dir="ltr" maxLength={100} />
                  </FormField>
                  <FormField label="الجنس">
                    <Select value={form.gender || ""} onValueChange={(v) => setForm({ ...form, gender: v })}>
                      <SelectTrigger><SelectValue placeholder="اختر..." /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ذكر">ذكر</SelectItem>
                        <SelectItem value="أنثى">أنثى</SelectItem>
                      </SelectContent>
                    </Select>
                  </FormField>
                  <FormField label="تاريخ الميلاد">
                    <Input type="date" value={form.birth_date || ""} onChange={(e) => setForm({ ...form, birth_date: e.target.value })} />
                  </FormField>
                  <FormField label="مكان الميلاد">
                    <Input value={form.birth_place || ""} onChange={(e) => setForm({ ...form, birth_place: e.target.value })} />
                  </FormField>
                  <FormField label="الجنسية">
                    <Input value={form.nationality || ""} onChange={(e) => setForm({ ...form, nationality: e.target.value })} placeholder="جزائرية" />
                  </FormField>
                  <FormField label="الحالة العائلية">
                    <Select value={form.marital_status || ""} onValueChange={(v) => setForm({ ...form, marital_status: v })}>
                      <SelectTrigger><SelectValue placeholder="اختر..." /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="أعزب">أعزب</SelectItem>
                        <SelectItem value="متزوج">متزوج</SelectItem>
                        <SelectItem value="مطلق">مطلق</SelectItem>
                        <SelectItem value="أرمل">أرمل</SelectItem>
                      </SelectContent>
                    </Select>
                  </FormField>
                </TabsContent>

                <TabsContent value="passport" className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-4">
                  <FormField label="رقم جواز السفر">
                    <Input value={form.passport_number || ""} onChange={(e) => setForm({ ...form, passport_number: e.target.value })} dir="ltr" maxLength={30} />
                  </FormField>
                  <FormField label="رقم البطاقة الوطنية">
                    <Input value={form.national_id || ""} onChange={(e) => setForm({ ...form, national_id: e.target.value })} dir="ltr" />
                  </FormField>
                  <FormField label="تاريخ الإصدار">
                    <Input type="date" value={form.passport_issue_date || ""} onChange={(e) => setForm({ ...form, passport_issue_date: e.target.value })} />
                  </FormField>
                  <FormField label="تاريخ الانتهاء">
                    <Input type="date" value={form.passport_expiry_date || ""} onChange={(e) => setForm({ ...form, passport_expiry_date: e.target.value })} />
                  </FormField>
                  <FormField label="مكان الإصدار">
                    <Input value={form.passport_issue_place || ""} onChange={(e) => setForm({ ...form, passport_issue_place: e.target.value })} />
                  </FormField>
                </TabsContent>

                <TabsContent value="contact" className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-4">
                  <FormField label="الهاتف">
                    <Input value={form.phone || ""} onChange={(e) => setForm({ ...form, phone: e.target.value })} dir="ltr" />
                  </FormField>
                  <FormField label="البريد الإلكتروني">
                    <Input type="email" value={form.email || ""} onChange={(e) => setForm({ ...form, email: e.target.value })} dir="ltr" />
                  </FormField>
                  <div className="sm:col-span-2">
                    <FormField label="العنوان الكامل">
                      <Textarea value={form.address || ""} onChange={(e) => setForm({ ...form, address: e.target.value })} rows={2} />
                    </FormField>
                  </div>
                  <FormField label="المدينة">
                    <Input value={form.city || ""} onChange={(e) => setForm({ ...form, city: e.target.value })} />
                  </FormField>
                  <FormField label="الولاية">
                    <Input value={form.wilaya || ""} onChange={(e) => setForm({ ...form, wilaya: e.target.value })} />
                  </FormField>
                  <FormField label="الرمز البريدي">
                    <Input value={form.postal_code || ""} onChange={(e) => setForm({ ...form, postal_code: e.target.value })} dir="ltr" />
                  </FormField>
                </TabsContent>

                <TabsContent value="profession" className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-4">
                  <FormField label="المهنة">
                    <Input value={form.profession || ""} onChange={(e) => setForm({ ...form, profession: e.target.value })} />
                  </FormField>
                  <FormField label="اسم صاحب العمل">
                    <Input value={form.employer_name || ""} onChange={(e) => setForm({ ...form, employer_name: e.target.value })} />
                  </FormField>
                  <div className="sm:col-span-2">
                    <FormField label="عنوان العمل">
                      <Textarea value={form.employer_address || ""} onChange={(e) => setForm({ ...form, employer_address: e.target.value })} rows={2} />
                    </FormField>
                  </div>
                  <FormField label="هاتف العمل">
                    <Input value={form.employer_phone || ""} onChange={(e) => setForm({ ...form, employer_phone: e.target.value })} dir="ltr" />
                  </FormField>
                  <FormField label="الدخل الشهري">
                    <Input value={form.monthly_income || ""} onChange={(e) => setForm({ ...form, monthly_income: e.target.value })} placeholder="مثال: 80000 دج" />
                  </FormField>
                </TabsContent>

                <TabsContent value="travel" className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-4">
                  <FormField label="بلد الوجهة">
                    <Input value={form.destination_country || ""} onChange={(e) => setForm({ ...form, destination_country: e.target.value })} />
                  </FormField>
                  <FormField label="الغرض من الزيارة">
                    <Input value={form.travel_purpose || ""} onChange={(e) => setForm({ ...form, travel_purpose: e.target.value })} placeholder="سياحة / دراسة / عمل..." />
                  </FormField>
                  <FormField label="تاريخ السفر">
                    <Input type="date" value={form.travel_date || ""} onChange={(e) => setForm({ ...form, travel_date: e.target.value })} />
                  </FormField>
                  <FormField label="تاريخ العودة">
                    <Input type="date" value={form.return_date || ""} onChange={(e) => setForm({ ...form, return_date: e.target.value })} />
                  </FormField>
                  <FormField label="مدة الإقامة (أيام)">
                    <Input
                      type="number"
                      min={0}
                      value={form.duration_days ?? ""}
                      onChange={(e) => setForm({ ...form, duration_days: e.target.value === "" ? null : Number(e.target.value) })}
                    />
                  </FormField>
                  <div className="sm:col-span-2">
                    <FormField label="الفندق / المضيف">
                      <Textarea value={form.hotel_or_host || ""} onChange={(e) => setForm({ ...form, hotel_or_host: e.target.value })} rows={2} />
                    </FormField>
                  </div>
                </TabsContent>

                <TabsContent value="family" className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-4">
                  <FormField label="اسم الأب">
                    <Input value={form.father_name || ""} onChange={(e) => setForm({ ...form, father_name: e.target.value })} />
                  </FormField>
                  <FormField label="اسم الأم">
                    <Input value={form.mother_name || ""} onChange={(e) => setForm({ ...form, mother_name: e.target.value })} />
                  </FormField>
                  <FormField label="اسم الزوج/الزوجة">
                    <Input value={form.spouse_name || ""} onChange={(e) => setForm({ ...form, spouse_name: e.target.value })} />
                  </FormField>
                  <FormField label="عدد الأطفال">
                    <Input
                      type="number"
                      min={0}
                      value={form.children_count ?? ""}
                      onChange={(e) => setForm({ ...form, children_count: e.target.value === "" ? null : Number(e.target.value) })}
                    />
                  </FormField>
                  <div className="sm:col-span-2">
                    <FormField label="بيانات الأطفال (الأسماء وتواريخ الميلاد)">
                      <Textarea value={form.children_details || ""} onChange={(e) => setForm({ ...form, children_details: e.target.value })} rows={3} />
                    </FormField>
                  </div>
                </TabsContent>
              </Tabs>

              <FormField label="ملاحظات إضافية">
                <Textarea value={form.notes || ""} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={3} maxLength={2000} />
              </FormField>

              <div className="flex items-center justify-end gap-2 pt-2 border-t">
                {profiles.length > 0 && (
                  <Button variant="outline" onClick={cancelEdit} disabled={saving}>
                    إلغاء
                  </Button>
                )}
                <Button onClick={handleSave} disabled={saving}>
                  {saving ? <Loader2 className="w-4 h-4 ml-2 animate-spin" /> : <Save className="w-4 h-4 ml-2" />}
                  حفظ
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        <AlertDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>حذف الملف؟</AlertDialogTitle>
              <AlertDialogDescription>
                لا يمكن التراجع عن هذا الإجراء. سيتم حذف بيانات هذا الملف نهائياً.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>إلغاء</AlertDialogCancel>
              <AlertDialogAction onClick={confirmDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                حذف
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </Layout>
  );
}
