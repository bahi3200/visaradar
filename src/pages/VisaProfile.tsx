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
import { Progress } from "@/components/ui/progress";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Checkbox } from "@/components/ui/checkbox";
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
  Phone, Briefcase, Plane, Users, Loader2, Star, Pencil, ClipboardCopy, AlertTriangle, MessageCircle, FileDown,
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

type FieldRef = { label: string; value: string | number | null | undefined };

const splitFields = (fields: FieldRef[]) => {
  const filled: string[] = [];
  const missing: string[] = [];
  for (const f of fields) {
    const v = f.value === null || f.value === undefined ? "" : String(f.value).trim();
    if (v) filled.push(f.label);
    else missing.push(f.label);
  }
  return { filled: filled.length, total: fields.length, missing };
};

const getTabStats = (p: VisaProfile) => ({
  personal: splitFields([
    { label: "الاسم الكامل (عربي)", value: p.full_name_ar },
    { label: "الاسم الكامل (لاتيني)", value: p.full_name_latin },
    { label: "الجنس", value: p.gender },
    { label: "تاريخ الميلاد", value: p.birth_date },
    { label: "مكان الميلاد", value: p.birth_place },
    { label: "الجنسية", value: p.nationality },
    { label: "الحالة العائلية", value: p.marital_status },
  ]),
  passport: splitFields([
    { label: "رقم جواز السفر", value: p.passport_number },
    { label: "تاريخ الإصدار", value: p.passport_issue_date },
    { label: "تاريخ الانتهاء", value: p.passport_expiry_date },
    { label: "مكان الإصدار", value: p.passport_issue_place },
    { label: "رقم البطاقة الوطنية", value: p.national_id },
  ]),
  contact: splitFields([
    { label: "الهاتف", value: p.phone },
    { label: "البريد الإلكتروني", value: p.email },
    { label: "العنوان", value: p.address },
    { label: "المدينة", value: p.city },
    { label: "الولاية", value: p.wilaya },
    { label: "الرمز البريدي", value: p.postal_code },
  ]),
  profession: splitFields([
    { label: "المهنة", value: p.profession },
    { label: "اسم صاحب العمل", value: p.employer_name },
    { label: "عنوان العمل", value: p.employer_address },
    { label: "هاتف العمل", value: p.employer_phone },
    { label: "الدخل الشهري", value: p.monthly_income },
  ]),
  travel: splitFields([
    { label: "بلد الوجهة", value: p.destination_country },
    { label: "الغرض من الزيارة", value: p.travel_purpose },
    { label: "تاريخ السفر", value: p.travel_date },
    { label: "تاريخ العودة", value: p.return_date },
    { label: "مدة الإقامة (أيام)", value: p.duration_days },
    { label: "الفندق / المضيف", value: p.hotel_or_host },
  ]),
  family: splitFields([
    { label: "اسم الأب", value: p.father_name },
    { label: "اسم الأم", value: p.mother_name },
    { label: "اسم الزوج/الزوجة", value: p.spouse_name },
    { label: "عدد الأطفال", value: p.children_count },
    { label: "بيانات الأطفال", value: p.children_details },
  ]),
});

const TabBadge = ({ filled, total, missing }: { filled: number; total: number; missing: string[] }) => {
  const isComplete = filled === total && total > 0;
  const isEmpty = filled === 0;
  const variant: "default" | "destructive" | "secondary" = isComplete ? "default" : isEmpty ? "destructive" : "secondary";
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge
          variant={variant}
          className="ml-1.5 h-4 px-1.5 text-[10px] leading-none font-medium tabular-nums cursor-help"
          aria-label={`${filled} من ${total} حقل مكتمل`}
        >
          {filled}/{total}
        </Badge>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-[260px]">
        {isComplete ? (
          <p className="text-xs">كل الحقول مكتملة ✓</p>
        ) : (
          <div className="text-xs space-y-1">
            <p className="font-semibold">حقول ناقصة ({missing.length}):</p>
            <ul className="list-disc pr-4 space-y-0.5">
              {missing.map((m) => (
                <li key={m}>{m}</li>
              ))}
            </ul>
          </div>
        )}
      </TooltipContent>
    </Tooltip>
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

const COUNTRY_DIAL_CODES: { code: string; label: string; flag: string }[] = [
  { code: "213", label: "الجزائر", flag: "🇩🇿" },
  { code: "33", label: "فرنسا", flag: "🇫🇷" },
  { code: "966", label: "السعودية", flag: "🇸🇦" },
  { code: "971", label: "الإمارات", flag: "🇦🇪" },
  { code: "974", label: "قطر", flag: "🇶🇦" },
  { code: "973", label: "البحرين", flag: "🇧🇭" },
  { code: "965", label: "الكويت", flag: "🇰🇼" },
  { code: "968", label: "عُمان", flag: "🇴🇲" },
  { code: "20", label: "مصر", flag: "🇪🇬" },
  { code: "212", label: "المغرب", flag: "🇲🇦" },
  { code: "216", label: "تونس", flag: "🇹🇳" },
  { code: "218", label: "ليبيا", flag: "🇱🇾" },
  { code: "962", label: "الأردن", flag: "🇯🇴" },
  { code: "961", label: "لبنان", flag: "🇱🇧" },
  { code: "963", label: "سوريا", flag: "🇸🇾" },
  { code: "964", label: "العراق", flag: "🇮🇶" },
  { code: "967", label: "اليمن", flag: "🇾🇪" },
  { code: "90", label: "تركيا", flag: "🇹🇷" },
  { code: "1", label: "أمريكا/كندا", flag: "🇺🇸" },
  { code: "44", label: "بريطانيا", flag: "🇬🇧" },
  { code: "49", label: "ألمانيا", flag: "🇩🇪" },
  { code: "39", label: "إيطاليا", flag: "🇮🇹" },
  { code: "34", label: "إسبانيا", flag: "🇪🇸" },
  { code: "32", label: "بلجيكا", flag: "🇧🇪" },
  { code: "41", label: "سويسرا", flag: "🇨🇭" },
  { code: "31", label: "هولندا", flag: "🇳🇱" },
  { code: "46", label: "السويد", flag: "🇸🇪" },
  { code: "47", label: "النرويج", flag: "🇳🇴" },
];

const WA_STORAGE_KEY = "visa_profile_wa_recipient_v1";

const ShareWhatsAppButton = ({ profile }: { profile: VisaProfile }) => {
  const [open, setOpen] = useState(false);
  const [dialCode, setDialCode] = useState("213");
  const [phone, setPhone] = useState("");

  // Load last used dial code + phone from localStorage on mount
  useEffect(() => {
    try {
      const raw = localStorage.getItem(WA_STORAGE_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw) as { dialCode?: string; phone?: string };
      if (saved.dialCode && COUNTRY_DIAL_CODES.some((c) => c.code === saved.dialCode)) {
        setDialCode(saved.dialCode);
      }
      if (saved.phone && /^\d{0,15}$/.test(saved.phone)) {
        setPhone(saved.phone);
      }
    } catch {
      // ignore corrupted storage
    }
  }, []);

  const handleShare = () => {
    const sections = getAllSections(profile);
    const { text, totalFields } = buildFullProfileText(profile.profile_label, sections);
    if (!text || totalFields === 0) {
      toast.error("لا توجد بيانات للمشاركة بعد");
      return;
    }

    let target = "";
    const trimmed = phone.trim();
    if (trimmed) {
      // Strip non-digits, remove leading zeros (local format like 0555... → 555...)
      const localDigits = trimmed.replace(/\D/g, "").replace(/^0+/, "");
      if (!/^\d{6,14}$/.test(localDigits)) {
        toast.error("رقم غير صالح. أدخل الرقم بدون رمز الدولة (مثال: 555123456)");
        return;
      }
      const full = `${dialCode}${localDigits}`;
      if (!/^\d{8,15}$/.test(full)) {
        toast.error("الرقم الكامل خارج النطاق المسموح");
        return;
      }
      target = full;
    }

    const url = `https://wa.me/${target}?text=${encodeURIComponent(text)}`;
    window.open(url, "_blank", "noopener,noreferrer");
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button type="button" size="sm" variant="outline" className="h-8">
          <MessageCircle className="w-3.5 h-3.5 ml-1.5" />
          مشاركة واتساب
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80">
        <div className="space-y-3">
          <div>
            <Label className="text-xs">رقم المستلم (اختياري)</Label>
            <div className="flex gap-2 mt-1" dir="ltr">
              <Select value={dialCode} onValueChange={setDialCode}>
                <SelectTrigger className="h-9 w-[120px] shrink-0">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="max-h-64">
                  {COUNTRY_DIAL_CODES.map((c) => (
                    <SelectItem key={c.code} value={c.code}>
                      <span className="inline-flex items-center gap-1.5">
                        <span>{c.flag}</span>
                        <span className="font-mono">+{c.code}</span>
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input
                id="wa-phone"
                dir="ltr"
                inputMode="tel"
                maxLength={15}
                placeholder="555123456"
                value={phone}
                onChange={(e) => setPhone(e.target.value.replace(/\D/g, ""))}
                className="h-9 flex-1"
              />
            </div>
            <p className="text-[11px] text-muted-foreground mt-1">
              اختر رمز الدولة ثم أدخل الرقم بدون الصفر الأول. اتركه فارغاً لاختيار جهة الاتصال يدوياً.
            </p>
          </div>
          <Button type="button" size="sm" className="w-full" onClick={handleShare}>
            <MessageCircle className="w-3.5 h-3.5 ml-1.5" />
            فتح واتساب
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
};

const ALL_PDF_SECTIONS = [
  "بيانات شخصية",
  "بيانات الجواز",
  "بيانات الاتصال",
  "بيانات المهنة",
  "بيانات السفر",
  "بيانات العائلة",
  "ملاحظات",
] as const;

const ExportPdfButton = ({ profile }: { profile: VisaProfile }) => {
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<string[]>([...ALL_PDF_SECTIONS]);
  const [includeQr, setIncludeQr] = useState(true);

  const toggleSection = (name: string, checked: boolean) => {
    setSelected((prev) => (checked ? [...new Set([...prev, name])] : prev.filter((s) => s !== name)));
  };
  const allChecked = selected.length === ALL_PDF_SECTIONS.length;
  const toggleAll = (checked: boolean) => setSelected(checked ? [...ALL_PDF_SECTIONS] : []);


  const fetchLogoDataUrl = async (): Promise<string | null> => {
    try {
      const res = await fetch("/icon-192.png");
      if (!res.ok) return null;
      const blob = await res.blob();
      return await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
    } catch {
      return null;
    }
  };

  const buildPassportQrPayload = (): string | null => {
    const lines: string[] = [];
    if (profile.full_name_latin?.trim()) lines.push(`Name: ${profile.full_name_latin.trim()}`);
    else if (profile.full_name_ar?.trim()) lines.push(`Name: ${profile.full_name_ar.trim()}`);
    if (profile.passport_number?.trim()) lines.push(`Passport: ${profile.passport_number.trim()}`);
    if (profile.nationality?.trim()) lines.push(`Nationality: ${profile.nationality.trim()}`);
    if (profile.birth_date) lines.push(`DOB: ${profile.birth_date}`);
    if (profile.passport_issue_date) lines.push(`Issued: ${profile.passport_issue_date}`);
    if (profile.passport_expiry_date) lines.push(`Expires: ${profile.passport_expiry_date}`);
    if (profile.national_id?.trim()) lines.push(`NID: ${profile.national_id.trim()}`);
    return lines.length ? lines.join("\n") : null;
  };

  const buildHtml = async (selectedSections: string[], withQr: boolean): Promise<string> => {
    const sections = getAllSections(profile).filter((s) => selectedSections.includes(s.title));
    const today = new Date().toLocaleDateString("ar-DZ");
    const logo = await fetchLogoDataUrl();

    const qrPayload = withQr ? buildPassportQrPayload() : null;
    let qrDataUrl: string | null = null;
    if (qrPayload) {
      try {
        const QR = await import("qrcode");
        qrDataUrl = await QR.toDataURL(qrPayload, { margin: 1, width: 220, errorCorrectionLevel: "M" });
      } catch {
        qrDataUrl = null;
      }
    }

    const sectionsHtml = sections
      .map((s) => {
        const rows = s.fields
          .map((f) => {
            const v = f.value === null || f.value === undefined ? "" : String(f.value).trim();
            if (!v) return "";
            return `<tr><td class="lbl">${f.label}</td><td class="val">${v}</td></tr>`;
          })
          .filter(Boolean)
          .join("");
        if (!rows) return "";
        return `<section class="block">
          <h2>${s.title}</h2>
          <table>${rows}</table>
        </section>`;
      })
      .filter(Boolean)
      .join("");

    const logoHtml = logo
      ? `<img src="${logo}" alt="logo" style="width:56px;height:56px;border-radius:12px;object-fit:cover;box-shadow:0 2px 6px rgba(11,29,57,0.15);" />`
      : "";

    const qrHtml = qrDataUrl
      ? `<section class="qr-block" style="margin-top:24px; padding:14px; border:1px dashed #c9a227; border-radius:8px; display:flex; align-items:center; gap:16px; background:#fffdf7; page-break-inside: avoid;">
          <img src="${qrDataUrl}" alt="QR" style="width:110px;height:110px;flex-shrink:0;" />
          <div style="flex:1;">
            <div style="font-size:13px;font-weight:700;color:#0b1d39;margin-bottom:4px;">QR — البيانات الأساسية للجواز</div>
            <div style="font-size:11.5px;color:#475569;line-height:1.6;">امسح الرمز للوصول السريع إلى رقم الجواز، الجنسية، تاريخ الميلاد، تاريخ الإصدار والانتهاء.</div>
          </div>
        </section>`
      : "";

    return `
      <div id="pdf-root" dir="rtl" style="font-family: Cairo, Tajawal, system-ui, sans-serif; background: #fff; color: #0f172a; width: 794px; padding: 48px 40px; box-sizing: border-box;">
        <header style="border-bottom: 3px solid #c9a227; padding-bottom: 16px; margin-bottom: 24px; display: flex; justify-content: space-between; align-items: center; gap: 16px;">
          <div style="display:flex; align-items:center; gap:14px;">
            ${logoHtml}
            <div>
              <h1 style="margin: 0; font-size: 22px; color: #0b1d39; font-weight: 800;">ملف بيانات للفيزا</h1>
              <div style="margin-top: 4px; font-size: 13px; color: #64748b;">${profile.profile_label}</div>
            </div>
          </div>
          <div style="font-size: 12px; color: #64748b; text-align: left;">
            <div>تاريخ التصدير</div>
            <div style="font-weight: 600; color: #0b1d39;">${today}</div>
          </div>
        </header>
        ${sectionsHtml || '<p style="color:#64748b;">لا توجد بيانات معبّأة بعد.</p>'}
        ${qrHtml}
        <footer style="margin-top: 24px; padding-top: 12px; border-top: 1px solid #e2e8f0; font-size: 11px; color: #94a3b8; text-align: center;">
          هذا الملف يُستخدم للمساعدة في تعبئة طلبات التأشيرة. يرجى التحقق من جميع البيانات قبل التقديم.
        </footer>
        <style>
          #pdf-root h2 { font-size: 15px; color: #0b1d39; margin: 0 0 8px; padding: 6px 10px; background: #f1f5f9; border-right: 4px solid #c9a227; border-radius: 4px; }
          #pdf-root .block { margin-bottom: 18px; page-break-inside: avoid; }
          #pdf-root table { width: 100%; border-collapse: collapse; font-size: 12.5px; }
          #pdf-root td { padding: 6px 10px; border-bottom: 1px solid #e2e8f0; vertical-align: top; }
          #pdf-root .lbl { width: 38%; color: #475569; font-weight: 600; background: #fafafa; }
          #pdf-root .val { color: #0f172a; }
        </style>
      </div>`;
  };

  const handleExport = async () => {
    if (selected.length === 0) {
      toast.error("اختر قسماً واحداً على الأقل");
      return;
    }
    setLoading(true);
    try {
      const sections = getAllSections(profile).filter((s) => selected.includes(s.title));
      const hasData = sections.some((s) =>
        s.fields.some((f) => f.value !== null && f.value !== undefined && String(f.value).trim() !== "")
      );
      if (!hasData) {
        toast.error("لا توجد بيانات في الأقسام المختارة");
        setLoading(false);
        return;
      }

      const [{ default: jsPDF }, html2canvasMod] = await Promise.all([
        import("jspdf"),
        import("html2canvas"),
      ]);
      const html2canvas = html2canvasMod.default;

      const container = document.createElement("div");
      container.style.position = "fixed";
      container.style.left = "-10000px";
      container.style.top = "0";
      container.innerHTML = await buildHtml(selected, includeQr);
      document.body.appendChild(container);

      const node = container.querySelector("#pdf-root") as HTMLElement;
      const canvas = await html2canvas(node, { scale: 2, backgroundColor: "#ffffff", useCORS: true });
      document.body.removeChild(container);

      const imgData = canvas.toDataURL("image/jpeg", 0.95);
      const pdf = new jsPDF({ orientation: "p", unit: "mm", format: "a4" });
      const pageW = pdf.internal.pageSize.getWidth();
      const pageH = pdf.internal.pageSize.getHeight();
      const imgW = pageW;
      const imgH = (canvas.height * imgW) / canvas.width;

      let heightLeft = imgH;
      let position = 0;
      pdf.addImage(imgData, "JPEG", 0, position, imgW, imgH);
      heightLeft -= pageH;
      while (heightLeft > 0) {
        position = heightLeft - imgH;
        pdf.addPage();
        pdf.addImage(imgData, "JPEG", 0, position, imgW, imgH);
        heightLeft -= pageH;
      }

      const safeName = profile.profile_label.replace(/[^\p{L}\p{N}_-]+/gu, "_") || "visa-profile";
      pdf.save(`${safeName}.pdf`);
      toast.success("تم تصدير الملف بصيغة PDF");
      setOpen(false);
    } catch (err) {
      console.error(err);
      toast.error("فشل تصدير الـ PDF");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button type="button" size="sm" variant="outline" className="h-8" disabled={loading}>
          {loading ? <Loader2 className="w-3.5 h-3.5 ml-1.5 animate-spin" /> : <FileDown className="w-3.5 h-3.5 ml-1.5" />}
          تصدير PDF
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72">
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label className="text-xs font-semibold">الأقسام المُصدّرة</Label>
            <button
              type="button"
              onClick={() => toggleAll(!allChecked)}
              className="text-[11px] text-primary hover:underline"
            >
              {allChecked ? "إلغاء الكل" : "اختيار الكل"}
            </button>
          </div>
          <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
            {ALL_PDF_SECTIONS.map((name) => (
              <label key={name} className="flex items-center gap-2 cursor-pointer text-sm">
                <Checkbox
                  checked={selected.includes(name)}
                  onCheckedChange={(c) => toggleSection(name, !!c)}
                />
                <span>{name}</span>
              </label>
            ))}
          </div>
          <div className="border-t pt-2">
            <label className="flex items-center gap-2 cursor-pointer text-sm">
              <Checkbox checked={includeQr} onCheckedChange={(c) => setIncludeQr(!!c)} />
              <span>إضافة QR code للجواز</span>
            </label>
          </div>
          <Button
            type="button"
            size="sm"
            className="w-full"
            onClick={handleExport}
            disabled={loading || selected.length === 0}
          >
            {loading ? <Loader2 className="w-3.5 h-3.5 ml-1.5 animate-spin" /> : <FileDown className="w-3.5 h-3.5 ml-1.5" />}
            تصدير ({selected.length} قسم)
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
};

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
                    <ShareWhatsAppButton profile={active} />
                    <ExportPdfButton profile={active} />
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
                {(() => {
                  const stats = getTabStats(active);
                  const filled = Object.values(stats).reduce((a, s) => a + s.filled, 0);
                  const total = Object.values(stats).reduce((a, s) => a + s.total, 0);
                  const pct = total > 0 ? Math.round((filled / total) * 100) : 0;
                  const tone =
                    pct === 100 ? "text-emerald-600 dark:text-emerald-400"
                    : pct >= 50 ? "text-foreground"
                    : "text-muted-foreground";
                  return (
                    <div className="mt-3">
                      <div className="flex items-center justify-between text-xs mb-1.5">
                        <span className="text-muted-foreground">اكتمال الملف</span>
                        <span className={`font-semibold tabular-nums ${tone}`}>
                          {filled}/{total} حقل · {pct}%
                        </span>
                      </div>
                      <Progress value={pct} className="h-2" />
                    </div>
                  );
                })()}
            </CardHeader>
            <CardContent>
              {(() => {
                const stats = getTabStats(active);
                return (
              <Tabs defaultValue="personal" className="w-full">
                <TabsList className="w-full overflow-x-auto flex-nowrap justify-start scrollbar-hide">
                  <TooltipProvider delayDuration={150}>
                  <TabsTrigger value="personal" className="shrink-0">
                    <User className="w-3.5 h-3.5 ml-1.5" />شخصية
                    <TabBadge {...stats.personal} />
                  </TabsTrigger>
                  <TabsTrigger value="passport" className="shrink-0">
                    <BookOpen className="w-3.5 h-3.5 ml-1.5" />جواز
                    <TabBadge {...stats.passport} />
                  </TabsTrigger>
                  <TabsTrigger value="contact" className="shrink-0">
                    <Phone className="w-3.5 h-3.5 ml-1.5" />اتصال
                    <TabBadge {...stats.contact} />
                  </TabsTrigger>
                  <TabsTrigger value="profession" className="shrink-0">
                    <Briefcase className="w-3.5 h-3.5 ml-1.5" />مهنة
                    <TabBadge {...stats.profession} />
                  </TabsTrigger>
                  <TabsTrigger value="travel" className="shrink-0">
                    <Plane className="w-3.5 h-3.5 ml-1.5" />سفر
                    <TabBadge {...stats.travel} />
                  </TabsTrigger>
                  <TabsTrigger value="family" className="shrink-0">
                    <Users className="w-3.5 h-3.5 ml-1.5" />عائلة
                    <TabBadge {...stats.family} />
                  </TabsTrigger>
                  </TooltipProvider>
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
