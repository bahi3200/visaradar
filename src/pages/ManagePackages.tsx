import { useState, useEffect } from "react";
import AdminLayout from "@/components/AdminLayout";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { z } from "zod";
import { motion } from "framer-motion";
import {
  Plus, Edit2, Trash2, Crown, Package as PackageIcon,
  Eye, EyeOff, Save, X, Loader2, Calendar, Globe, Sparkles, AlertTriangle
} from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import PromoAuditLog from "@/components/pricing/PromoAuditLog";
import PromoStatusBadge from "@/components/pricing/PromoStatusBadge";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { getPromoState } from "@/lib/promoUtils";

/** Convert ISO string → "YYYY-MM-DDTHH:mm" for <input type="datetime-local">. */
function toLocalInput(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Build a "YYYY-MM-DDTHH:mm" string from a Date (local time). */
function dateToLocalInput(d: Date): string {
  return toLocalInput(d.toISOString());
}

type Package = {
  id: string;
  name_ar: string;
  name_en: string;
  duration_months: number;
  price: number | null;
  max_countries: number;
  is_golden: boolean;
  is_active: boolean;
  service_type: string;
  sort_order: number;
  features_ar: string[] | null;
  promo_price: number | null;
  promo_starts_at: string | null;
  promo_ends_at: string | null;
};

/**
 * Canonical validation messages for promo pricing.
 * Used in: zod schema, onChange input handler, and the Save-time guard,
 * so the user sees the same wording everywhere.
 */
const PROMO_PRICE_INVALID_MSG = "السعر الترويجي يجب أن يكون أقل من السعر الأصلي";
const buildPromoPriceSaveError = (promo: number, price: number) =>
  `${PROMO_PRICE_INVALID_MSG} — لا يمكن الحفظ: ${promo.toLocaleString()} د.ج ≥ ${price.toLocaleString()} د.ج`;

const packageSchema = z.object({
  name_ar: z.string().trim().min(1, "الاسم بالعربية مطلوب").max(100, "الحد الأقصى 100 حرف"),
  name_en: z.string().trim().min(1, "الاسم بالإنجليزية مطلوب").max(100, "الحد الأقصى 100 حرف"),
  duration_months: z.coerce.number().int().min(1, "المدة على الأقل شهر").max(60, "الحد الأقصى 60 شهراً"),
  price: z.coerce.number().min(0, "السعر لا يمكن أن يكون سالباً").max(1000000, "السعر مرتفع جداً").nullable(),
  max_countries: z.coerce.number().int().min(1, "على الأقل دولة واحدة").max(50, "الحد الأقصى 50 دولة"),
  service_type: z.enum(["visa", "jobs", "both"]),
  sort_order: z.coerce.number().int().min(0).max(999),
  is_golden: z.boolean(),
  is_active: z.boolean(),
  features_text: z.string().max(2000, "الميزات طويلة جداً"),
  promo_price: z.coerce.number().min(0).max(1000000).nullable(),
  promo_starts_at: z.string(),
  promo_ends_at: z.string(),
}).refine(
  (d) => {
    if (d.promo_price === null || d.promo_price === 0) return true;
    if (d.price === null || d.price === 0) return false;
    return d.promo_price < d.price;
  },
  { message: PROMO_PRICE_INVALID_MSG, path: ["promo_price"] },
).refine(
  (d) => {
    // Skip date validation when no promo price is set.
    if (d.promo_price === null || d.promo_price === 0) return true;
    // When promo is set, both dates must be filled.
    if (!d.promo_starts_at || !d.promo_ends_at) return false;
    return true;
  },
  { message: "يجب تحديد تاريخ البداية وتاريخ النهاية للعرض الترويجي", path: ["promo_starts_at"] },
).refine(
  (d) => {
    if (!d.promo_starts_at || !d.promo_ends_at) return true;
    const start = new Date(d.promo_starts_at);
    const end = new Date(d.promo_ends_at);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return false;
    return start < end;
  },
  { message: "تاريخ نهاية العرض يجب أن يكون بعد تاريخ البداية", path: ["promo_ends_at"] },
);

const emptyForm = {
  name_ar: "",
  name_en: "",
  duration_months: 3,
  price: 1500,
  max_countries: 1,
  service_type: "visa" as "visa" | "jobs" | "both",
  sort_order: 10,
  is_golden: false,
  is_active: true,
  features_text: "",
  promo_price: 0,
  promo_starts_at: "",
  promo_ends_at: "",
};

export default function ManagePackages() {
  const qc = useQueryClient();
  const [editing, setEditing] = useState<Package | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Package | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  // Which field drives the promo: "pct" updates promo_price, "price" updates pct (read-only).
  const [promoInputMode, setPromoInputMode] = useState<"pct" | "price">("pct");
  // Last rejected percentage attempt (≥ 100). Cleared when admin types a valid value.
  const [rejectedPct, setRejectedPct] = useState<number | null>(null);
  const [rejectedPromoPrice, setRejectedPromoPrice] = useState<number | null>(null);

  // Auto-clear the rejected-promo-price alert as soon as the current state
  // becomes valid (promo_price < price), without requiring the user to
  // dismiss it manually. Covers both: editing promo_price downwards, and
  // raising the original price so the previously-rejected value is no longer
  // greater-or-equal.
  useEffect(() => {
    if (rejectedPromoPrice === null) return;
    // Only auto-clear while the user is editing the fixed-price field.
    // In percentage or date modes, the rejection (which is bound to the
    // price-input flow) must not be silently dismissed by unrelated changes.
    if (promoInputMode !== "price") return;
    if (form.price > 0 && form.promo_price > 0 && form.promo_price < form.price) {
      setRejectedPromoPrice(null);
    }
  }, [form.price, form.promo_price, rejectedPromoPrice, promoInputMode]);

  /**
   * Debounced promo_price validation side-effects.
   *
   * The input itself updates `form.promo_price` synchronously so typing stays
   * responsive and the inline (derived) error stays in sync without flicker.
   * Side-effects that DO flicker noisily on every keystroke — the banner
   * `rejectedPromoPrice` state and the toast — are deferred by 350ms, so
   * intermediate values during fast typing (e.g. "1" → "10" → "100" → "1000")
   * don't fire a toast-storm or repeatedly toggle the banner.
   */
  useEffect(() => {
    if (promoInputMode !== "price") return;
    const promo = form.promo_price;
    const price = form.price;
    const handle = setTimeout(() => {
      if (promo > 0 && price > 0 && promo >= price) {
        setRejectedPromoPrice(promo);
        toast.error(PROMO_PRICE_INVALID_MSG);
      }
    }, 350);
    return () => clearTimeout(handle);
  }, [form.promo_price, form.price, promoInputMode]);

  const { data: packages, isLoading } = useQuery({
    queryKey: ["admin-packages"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("packages")
        .select("*")
        .order("is_golden")
        .order("sort_order");
      if (error) throw error;
      return data as Package[];
    },
  });

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setRejectedPct(null);
    setRejectedPromoPrice(null);
    setDialogOpen(true);
  };

  const openEdit = (pkg: Package) => {
    setEditing(pkg);
    setForm({
      name_ar: pkg.name_ar,
      name_en: pkg.name_en,
      duration_months: pkg.duration_months,
      price: pkg.price ?? 0,
      max_countries: pkg.max_countries,
      service_type: (pkg.service_type as "visa" | "jobs" | "both") || "visa",
      sort_order: pkg.sort_order,
      is_golden: pkg.is_golden,
      is_active: pkg.is_active,
      features_text: (pkg.features_ar || []).join("\n"),
      promo_price: pkg.promo_price ?? 0,
      promo_starts_at: pkg.promo_starts_at ? toLocalInput(pkg.promo_starts_at) : "",
      promo_ends_at: pkg.promo_ends_at ? toLocalInput(pkg.promo_ends_at) : "",
    });
    setRejectedPct(null);
    setRejectedPromoPrice(null);
    setDialogOpen(true);
  };

  const handleSave = async () => {
    // Final save-time guard — block save if promo_price is invalid, even if
    // state was reached via a path other than the input handler (e.g. price
    // was lowered after promo was set, browser autofill, or percentage mode).
    // Uses the same canonical message as the onChange validator and zod schema.
    if (form.promo_price && form.promo_price > 0) {
      if (!form.price || form.price <= 0) {
        setRejectedPromoPrice(form.promo_price);
        toast.error(PROMO_PRICE_INVALID_MSG);
        return;
      }
      if (form.promo_price >= form.price) {
        setRejectedPromoPrice(form.promo_price);
        toast.error(buildPromoPriceSaveError(form.promo_price, form.price));
        return;
      }
    }

    const parsed = packageSchema.safeParse(form);
    if (!parsed.success) {
      toast.error(parsed.error.errors[0]?.message || "بيانات غير صحيحة");
      return;
    }

    setSaving(true);
    try {
      const features_ar = parsed.data.features_text
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean)
        .slice(0, 30);

      const payload = {
        name_ar: parsed.data.name_ar,
        name_en: parsed.data.name_en,
        duration_months: parsed.data.duration_months,
        price: parsed.data.price === 0 ? null : parsed.data.price,
        max_countries: parsed.data.max_countries,
        service_type: parsed.data.service_type,
        sort_order: parsed.data.sort_order,
        is_golden: parsed.data.is_golden,
        is_active: parsed.data.is_active,
        features_ar,
        promo_price: parsed.data.promo_price && parsed.data.promo_price > 0 ? parsed.data.promo_price : null,
        promo_starts_at: parsed.data.promo_starts_at ? new Date(parsed.data.promo_starts_at).toISOString() : null,
        promo_ends_at: parsed.data.promo_ends_at ? new Date(parsed.data.promo_ends_at).toISOString() : null,
      };

      if (editing) {
        // Detect whether promo fields changed and decide which input method to record
        const promoChanged =
          (editing.promo_price ?? null) !== payload.promo_price ||
          (editing.promo_starts_at ?? null) !== payload.promo_starts_at ||
          (editing.promo_ends_at ?? null) !== payload.promo_ends_at;
        const priceOnlyChanged =
          (editing.promo_price ?? null) !== payload.promo_price;
        const datesChanged =
          (editing.promo_starts_at ?? null) !== payload.promo_starts_at ||
          (editing.promo_ends_at ?? null) !== payload.promo_ends_at;
        const inputMethod = !priceOnlyChanged && datesChanged ? "date" : promoInputMode;

        // Update non-promo fields directly
        const { promo_price, promo_starts_at, promo_ends_at, ...nonPromo } = payload;
        const { data, error } = await supabase
          .from("packages")
          .update(nonPromo)
          .eq("id", editing.id)
          .select();
        if (error) throw error;
        if (!data || data.length === 0) {
          throw new Error("لم يتم تطبيق التحديث — تحقق من صلاحياتك");
        }

        // Update promo fields via RPC so the audit trigger captures the input method
        if (promoChanged) {
          const { error: rpcErr } = await supabase.rpc("update_package_promo", {
            _package_id: editing.id,
            _promo_price: promo_price,
            _promo_starts_at: promo_starts_at,
            _promo_ends_at: promo_ends_at,
            _input_method: inputMethod,
          });
          if (rpcErr) throw rpcErr;
        }
        toast.success("تم تحديث الباقة بنجاح");
      } else {
        const { data, error } = await supabase.from("packages").insert(payload).select();
        if (error) throw error;
        if (!data || data.length === 0) {
          throw new Error("لم يتم إنشاء الباقة — تحقق من صلاحياتك");
        }
        toast.success("تم إنشاء الباقة بنجاح");
      }

      setDialogOpen(false);
      qc.invalidateQueries({ queryKey: ["admin-packages"] });
      qc.invalidateQueries({ queryKey: ["packages"] });
    } catch (err: any) {
      toast.error(err.message || "فشل حفظ الباقة");
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (pkg: Package) => {
    const { error } = await supabase
      .from("packages")
      .update({ is_active: !pkg.is_active })
      .eq("id", pkg.id);
    if (error) {
      toast.error("فشل تحديث الحالة");
      return;
    }
    toast.success(pkg.is_active ? "تم إيقاف الباقة" : "تم تفعيل الباقة");
    qc.invalidateQueries({ queryKey: ["admin-packages"] });
    qc.invalidateQueries({ queryKey: ["packages"] });
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    const { error } = await supabase.from("packages").delete().eq("id", deleteTarget.id);
    if (error) {
      toast.error(error.message.includes("foreign") ? "لا يمكن حذف باقة مرتبطة باشتراكات. عطّلها بدلاً من ذلك." : "فشل الحذف");
      setDeleteTarget(null);
      return;
    }
    toast.success("تم حذف الباقة");
    setDeleteTarget(null);
    qc.invalidateQueries({ queryKey: ["admin-packages"] });
    qc.invalidateQueries({ queryKey: ["packages"] });
  };

  const serviceLabel = (s: string) =>
    s === "visa" ? "تنبيهات الفيزا" : s === "jobs" ? "عقود العمل" : "الباقة الشاملة";

  return (
    <AdminLayout title="إدارة الباقات" subtitle="أضِف، عدّل، أو احذف باقات الاشتراك بدون migrations">
      <div className="flex justify-end mb-6">
        <button
          onClick={openCreate}
          className="flex items-center gap-2 gradient-primary text-primary-foreground font-bold px-5 py-2.5 rounded-xl hover:opacity-90 transition-all shadow-glow"
        >
          <Plus className="w-4 h-4" />
          باقة جديدة
        </button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      ) : !packages || packages.length === 0 ? (
        <div className="gradient-card rounded-2xl border border-border/50 p-10 text-center">
          <PackageIcon className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
          <p className="text-muted-foreground">لا توجد باقات بعد. ابدأ بإضافة باقة جديدة.</p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {packages.map((pkg, i) => (
            <motion.div
              key={pkg.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
              className={`gradient-card rounded-2xl border p-5 flex flex-col relative ${
                pkg.is_golden ? "border-accent/50" : "border-border/50"
              } ${!pkg.is_active ? "opacity-60" : ""}`}
            >
              {pkg.is_golden && (
                <div className="absolute -top-3 right-4 gradient-accent text-accent-foreground text-[10px] font-bold px-3 py-1 rounded-full flex items-center gap-1">
                  <Crown className="w-3 h-3" />
                  ذهبية
                </div>
              )}

              <div className="flex items-start justify-between mb-3">
                <div className="flex-1 min-w-0">
                  <h3 className="font-heading text-lg font-bold text-foreground truncate">{pkg.name_ar}</h3>
                  <p className="text-xs text-muted-foreground truncate">{pkg.name_en}</p>
                </div>
                <span
                  className={`text-[10px] font-bold px-2 py-1 rounded-full shrink-0 ${
                    pkg.is_active ? "bg-primary/10 text-primary" : "bg-muted/50 text-muted-foreground"
                  }`}
                >
                  {pkg.is_active ? "نشطة" : "موقوفة"}
                </span>
              </div>

              {/* Live promo status — active / scheduled / expired / none */}
              <div className="mb-3">
                <PromoStatusBadge pkg={pkg} compact />
              </div>

              <div className="space-y-1.5 text-xs text-muted-foreground mb-4">
                <div className="flex items-center gap-2">
                  <Calendar className="w-3.5 h-3.5 text-primary" />
                  <span>{pkg.duration_months} شهر</span>
                </div>
                <div className="flex items-center gap-2">
                  <Globe className="w-3.5 h-3.5 text-primary" />
                  <span>حتى {pkg.max_countries} دولة</span>
                </div>
                <div className="flex items-center gap-2">
                  <PackageIcon className="w-3.5 h-3.5 text-primary" />
                  <span>{serviceLabel(pkg.service_type)}</span>
                </div>
              </div>

              <div className="mb-4 pb-4 border-b border-border/30">
                {pkg.price ? (
                  (() => {
                    const promo = getPromoState(pkg);
                    if (promo.isPromo) {
                      return (
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-muted-foreground line-through tabular-nums">{promo.originalPrice}</span>
                            <span className="text-[10px] font-black bg-accent text-accent-foreground px-1.5 py-0.5 rounded">
                              -{promo.discountPct}%
                            </span>
                          </div>
                          <div className="flex items-baseline gap-1">
                            <span className="font-heading text-2xl font-black text-accent tabular-nums">{promo.effectivePrice}</span>
                            <span className="text-xs text-muted-foreground">د.ج</span>
                          </div>
                          <p className="text-[10px] text-accent font-medium inline-flex items-center gap-1">
                            <Sparkles className="w-3 h-3" />
                            عرض ساري
                          </p>
                        </div>
                      );
                    }
                    if (pkg.promo_price && (pkg.promo_starts_at || pkg.promo_ends_at)) {
                      return (
                        <div className="space-y-1">
                          <div className="flex items-baseline gap-1">
                            <span className="font-heading text-2xl font-black text-foreground">{pkg.price}</span>
                            <span className="text-xs text-muted-foreground">د.ج</span>
                          </div>
                          <p className="text-[10px] text-muted-foreground">عرض مُجدوَل (غير نشط الآن)</p>
                        </div>
                      );
                    }
                    return (
                      <div className="flex items-baseline gap-1">
                        <span className="font-heading text-2xl font-black text-foreground">{pkg.price}</span>
                        <span className="text-xs text-muted-foreground">د.ج</span>
                      </div>
                    );
                  })()
                ) : (
                  <span className="font-heading text-base font-bold text-accent">قريباً</span>
                )}
              </div>

              <div className="flex gap-2 mt-auto">
                <button
                  onClick={() => openEdit(pkg)}
                  className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border border-border/60 text-foreground text-xs font-medium hover:bg-secondary transition-colors"
                >
                  <Edit2 className="w-3.5 h-3.5" />
                  تعديل
                </button>
                <button
                  onClick={() => handleToggleActive(pkg)}
                  className="flex items-center justify-center gap-1 px-3 py-2 rounded-lg border border-border/60 text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                  title={pkg.is_active ? "إيقاف" : "تفعيل"}
                >
                  {pkg.is_active ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </button>
                <button
                  onClick={() => setDeleteTarget(pkg)}
                  className="flex items-center justify-center gap-1 px-3 py-2 rounded-lg border border-destructive/30 text-destructive hover:bg-destructive/10 transition-colors"
                  title="حذف"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </motion.div>
          ))}
        </div>
      )}

      {/* Create / Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" dir="rtl">
          <DialogHeader>
            <DialogTitle className="font-heading">
              {editing ? "تعديل الباقة" : "باقة جديدة"}
            </DialogTitle>
            <DialogDescription>
              {editing ? "حدّث تفاصيل الباقة وميزاتها" : "املأ تفاصيل الباقة الجديدة"}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="name_ar">الاسم بالعربية *</Label>
                <Input
                  id="name_ar"
                  value={form.name_ar}
                  onChange={(e) => setForm({ ...form, name_ar: e.target.value })}
                  placeholder="باقة 3 أشهر"
                  maxLength={100}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="name_en">الاسم بالإنجليزية *</Label>
                <Input
                  id="name_en"
                  value={form.name_en}
                  onChange={(e) => setForm({ ...form, name_en: e.target.value })}
                  placeholder="3 Months Plan"
                  maxLength={100}
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="duration">المدة (شهر) *</Label>
                <Input
                  id="duration"
                  type="number"
                  min={1}
                  max={60}
                  value={form.duration_months}
                  onChange={(e) => setForm({ ...form, duration_months: Number(e.target.value) })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="price">السعر (د.ج)</Label>
                <Input
                  id="price"
                  type="number"
                  min={0}
                  value={form.price ?? 0}
                  onChange={(e) => setForm({ ...form, price: Number(e.target.value) })}
                  placeholder="0 = قريباً"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="max_countries">الحد الأقصى للدول *</Label>
                <Input
                  id="max_countries"
                  type="number"
                  min={1}
                  max={50}
                  value={form.max_countries}
                  onChange={(e) => setForm({ ...form, max_countries: Number(e.target.value) })}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="service_type">نوع الخدمة *</Label>
                <select
                  id="service_type"
                  value={form.service_type}
                  onChange={(e) => setForm({ ...form, service_type: e.target.value as any })}
                  className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
                >
                  <option value="visa">تنبيهات الفيزا</option>
                  <option value="jobs">عقود العمل</option>
                  <option value="both">شاملة</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="sort_order">ترتيب العرض</Label>
                <Input
                  id="sort_order"
                  type="number"
                  min={0}
                  max={999}
                  value={form.sort_order}
                  onChange={(e) => setForm({ ...form, sort_order: Number(e.target.value) })}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="features">الميزات (كل ميزة في سطر)</Label>
              <Textarea
                id="features"
                rows={5}
                value={form.features_text}
                onChange={(e) => setForm({ ...form, features_text: e.target.value })}
                placeholder={"تنبيه فوري عبر تليغرام\nمراقبة 24/7\nدعم فني سريع"}
                maxLength={2000}
              />
              <p className="text-[10px] text-muted-foreground">حتى 30 ميزة، كل ميزة في سطر منفصل</p>
            </div>

            {/* Promo section */}
            <div className="rounded-xl border border-accent/30 bg-accent/5 p-4 space-y-3">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-accent" />
                <Label className="text-sm font-bold text-foreground">العرض الترويجي (اختياري)</Label>
                {form.promo_price > 0 && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="ms-auto h-7 text-[11px] text-destructive hover:text-destructive"
                    onClick={() => setForm({ ...form, promo_price: 0, promo_starts_at: "", promo_ends_at: "" })}
                  >
                    إلغاء العرض
                  </Button>
                )}
              </div>
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                اضبط نسبة الخصم أو السعر المخفّض ومدة العرض. يُطبَّق تلقائياً عند بداية المدة ويعود السعر الأصلي بعد انتهائها.
              </p>

              {/* Quick percentage shortcuts */}
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[11px] text-muted-foreground">نسبة سريعة:</span>
                {[10, 20, 30, 40, 50].map((pct) => (
                  <Button
                    key={pct}
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 text-[11px] tabular-nums"
                    disabled={!form.price || form.price <= 0}
                    onClick={() => {
                      const newPrice = Math.round((form.price * (100 - pct)) / 100);
                      setForm({ ...form, promo_price: newPrice });
                    }}
                  >
                    -{pct}%
                  </Button>
                ))}
              </div>

              {/* Quick duration shortcuts */}
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[11px] text-muted-foreground">مدّة سريعة:</span>
                {[
                  { label: "٣ أيام", days: 3 },
                  { label: "٧ أيام", days: 7 },
                  { label: "١٤ يوم", days: 14 },
                  { label: "٣٠ يوم", days: 30 },
                ].map((opt) => (
                  <Button
                    key={opt.days}
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 text-[11px]"
                    onClick={() => {
                      const start = new Date();
                      const end = new Date(start.getTime() + opt.days * 86400_000);
                      setForm({
                        ...form,
                        promo_starts_at: dateToLocalInput(start),
                        promo_ends_at: dateToLocalInput(end),
                      });
                    }}
                  >
                    {opt.label}
                  </Button>
                ))}
              </div>

              {/* Inline alert above promo fields when admin entered a rejected discount ≥ 100% */}
              {rejectedPct !== null && (
                <div
                  role="alert"
                  className="flex items-start gap-2 rounded-lg border-2 border-destructive bg-destructive/10 p-3 text-[12px] text-destructive animate-in fade-in slide-in-from-top-1"
                >
                  <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                  <div className="flex-1 space-y-1">
                    <p className="font-bold">
                      تم رفض القيمة {rejectedPct}% — نسبة الخصم لا يمكن أن تساوي أو تتجاوز 100%
                    </p>
                    <p className="text-[11px] opacity-90">
                      السبب: خصم 100% يعني أن العرض مجاني تمامًا، وأي قيمة أعلى تنتج سعرًا سالبًا.
                      يُسمح فقط بالنسب من 0 إلى 99%. لم يتم تعديل السعر الترويجي.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setRejectedPct(null)}
                    className="text-destructive/70 hover:text-destructive"
                    aria-label="إغلاق التنبيه"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}

              {/* Inline alert above promo fields when admin entered a promo_price ≥ original price */}
              {rejectedPromoPrice !== null && promoInputMode === "price" && (
                <div
                  role="alert"
                  className="flex items-start gap-2 rounded-lg border-2 border-destructive bg-destructive/10 p-3 text-[12px] text-destructive animate-in fade-in slide-in-from-top-1"
                >
                  <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                  <div className="flex-1 space-y-1">
                    <p className="font-bold">
                      الشرط: السعر الترويجي &lt; السعر الأصلي
                    </p>
                    <p className="text-[11px] opacity-90 tabular-nums">
                      المرفوض: <span className="font-bold">{rejectedPromoPrice.toLocaleString()} د.ج</span>
                      {" • "}
                      الأصلي: <span className="font-bold">{form.price.toLocaleString()} د.ج</span>
                      {" • "}
                      الفرق: <span className="font-bold">+{(rejectedPromoPrice - form.price).toLocaleString()} د.ج</span>
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setRejectedPromoPrice(null)}
                    className="text-destructive/70 hover:text-destructive"
                    aria-label="إغلاق التنبيه"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}

              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <Label htmlFor="promo_discount_pct">نسبة الخصم (%)</Label>
                    <button
                      type="button"
                       onClick={() => {
                         setPromoInputMode("pct");
                         setRejectedPromoPrice(null);
                       }}
                      className={`text-[10px] px-1.5 py-0.5 rounded border transition-colors ${
                        promoInputMode === "pct"
                          ? "bg-accent text-accent-foreground border-accent"
                          : "border-border text-muted-foreground hover:bg-muted"
                      }`}
                    >
                      {promoInputMode === "pct" ? "نشط" : "استخدم"}
                    </button>
                  </div>
                  <Input
                    id="promo_discount_pct"
                    type="number"
                    min={0}
                    max={99}
                    step={1}
                    readOnly={promoInputMode !== "pct"}
                    value={
                      form.promo_price > 0 && form.price > 0 && form.promo_price < form.price
                        ? Math.round(((form.price - form.promo_price) / form.price) * 100)
                        : ""
                    }
                    onChange={(e) => {
                      if (promoInputMode !== "pct") return;
                      const raw = e.target.value;
                      if (raw === "") {
                        setForm({ ...form, promo_price: 0 });
                        return;
                      }
                      const rawPct = Number(raw);
                      if (!form.price || form.price <= 0) {
                        toast.error("حدّد السعر الأصلي أولاً");
                        return;
                      }
                      if (rawPct >= 100) {
                        setRejectedPct(rawPct);
                        toast.error("نسبة الخصم يجب أن تكون أقل من 100% — لا يمكن أن يكون السعر مجانيًا");
                        return;
                      }
                      setRejectedPct(null);
                      const pct = Math.max(0, Math.min(99, rawPct));
                      const newPrice = Math.round((form.price * (100 - pct)) / 100);
                      setForm({ ...form, promo_price: newPrice });
                    }}
                    placeholder="مثال: 20"
                    className={promoInputMode !== "pct" ? "bg-muted/40 cursor-not-allowed" : ""}
                  />
                </div>
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <Label htmlFor="promo_price">السعر الترويجي (د.ج)</Label>
                    <button
                      type="button"
                       onClick={() => setPromoInputMode("price")}
                      className={`text-[10px] px-1.5 py-0.5 rounded border transition-colors ${
                        promoInputMode === "price"
                          ? "bg-accent text-accent-foreground border-accent"
                          : "border-border text-muted-foreground hover:bg-muted"
                      }`}
                    >
                      {promoInputMode === "price" ? "نشط" : "استخدم"}
                    </button>
                  </div>
                  <Input
                    id="promo_price"
                    type="number"
                    min={0}
                    readOnly={promoInputMode !== "price"}
                    value={form.promo_price ?? 0}
                    onChange={(e) => {
                      if (promoInputMode !== "price") return;
                      const raw = Number(e.target.value);
                      // Always commit the value immediately so typing stays
                      // smooth. The debounced effect above will surface the
                      // toast + banner once the user pauses (350ms).
                      setForm({ ...form, promo_price: raw });
                    }}
                    placeholder="0 = بلا عرض"
                    className={[
                      promoInputMode !== "price" ? "bg-muted/40 cursor-not-allowed" : "",
                      form.promo_price > 0 && form.price > 0 && form.promo_price >= form.price
                        ? "border-destructive focus-visible:ring-destructive"
                        : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    aria-invalid={
                      form.promo_price > 0 && form.price > 0 && form.promo_price >= form.price
                    }
                    aria-describedby="promo_price_error"
                  />
                  {form.promo_price > 0 && form.price > 0 && form.promo_price >= form.price && (
                    <p
                      id="promo_price_error"
                      role="alert"
                      className="flex items-start gap-1 text-[11px] font-semibold text-destructive"
                    >
                      <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" />
                      <span>
                        يجب أن يكون أقل من السعر الأصلي ({form.price.toLocaleString()} د.ج). لن يتم حفظ العرض.
                      </span>
                    </p>
                  )}
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="promo_starts_at">تاريخ البداية</Label>
                  <Input
                    id="promo_starts_at"
                    type="datetime-local"
                    value={form.promo_starts_at}
                    onChange={(e) => setForm({ ...form, promo_starts_at: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="promo_ends_at">تاريخ النهاية</Label>
                  <Input
                    id="promo_ends_at"
                    type="datetime-local"
                    value={form.promo_ends_at}
                    onChange={(e) => setForm({ ...form, promo_ends_at: e.target.value })}
                  />
                </div>
              </div>
              <p className="text-[10px] text-muted-foreground">
                وضع الإدخال الحالي: <span className="font-semibold text-foreground">{promoInputMode === "pct" ? "نسبة الخصم (%)" : "السعر الترويجي مباشرةً"}</span> — الحقل الآخر يُحسب تلقائياً للقراءة فقط.
              </p>
              {/* Extend current promo by N days (preserves start date) */}
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[11px] text-muted-foreground">تمديد العرض الحالي:</span>
                {[1, 3, 7, 14, 30].map((days) => (
                  <Button
                    key={days}
                    type="button"
                    variant="secondary"
                    size="sm"
                    className="h-7 text-[11px]"
                    onClick={() => {
                      if (!form.promo_price || form.promo_price <= 0) {
                        toast.error("لا يوجد عرض ترويجي حالي لتمديده");
                        return;
                      }
                      const baseEnd = form.promo_ends_at ? new Date(form.promo_ends_at) : null;
                      const anchor = baseEnd && baseEnd.getTime() > Date.now() ? baseEnd : new Date();
                      const newEnd = new Date(anchor.getTime() + days * 86400_000);
                      setForm({ ...form, promo_ends_at: dateToLocalInput(newEnd) });
                      toast.success(`تم تمديد العرض ${days} يوم — لا تنسَ الحفظ`);
                    }}
                  >
                    +{days} يوم
                  </Button>
                ))}
              </div>
              {/* Live validation alert — promo price must be strictly less than original */}
              {form.promo_price > 0 && form.price > 0 && form.promo_price >= form.price && (
                <div
                  role="alert"
                  className="flex items-start gap-2 rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-[12px] text-destructive"
                >
                  <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                  <div className="space-y-0.5">
                    <p className="font-semibold">قيمة العرض الترويجي غير صالحة</p>
                    <p className="text-[11px] opacity-90">
                      السعر الترويجي ({form.promo_price.toLocaleString()} د.ج) يجب أن يكون
                      <span className="font-bold"> أقل </span>
                      من السعر الأصلي ({form.price.toLocaleString()} د.ج). نسبة الخصم لا يمكن أن تساوي أو تتجاوز 100%. لن يتم حفظ العرض حتى تصحيح القيمة.
                    </p>
                  </div>
                </div>
              )}

              {/* Live promo price preview — updates as you type, before saving */}
              {form.promo_price > 0 && form.price > 0 && form.promo_price < form.price ? (
                (() => {
                  const savings = form.price - form.promo_price;
                  const pct = Math.round((savings / form.price) * 100);
                  return (
                    <div className="rounded-lg border border-accent/40 bg-accent/5 p-3 space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[11px] text-muted-foreground">معاينة السعر الترويجي</span>
                        <span className="text-[10px] font-bold rounded-full bg-accent text-accent-foreground px-2 py-0.5">
                          -{pct}%
                        </span>
                      </div>
                      <div className="flex items-baseline gap-2 flex-wrap">
                        <span className="text-lg font-black text-accent tabular-nums">
                          {form.promo_price.toLocaleString()} د.ج
                        </span>
                        <span className="text-xs text-muted-foreground line-through tabular-nums">
                          {form.price.toLocaleString()} د.ج
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-[11px] text-muted-foreground border-t border-accent/20 pt-2">
                        <span>توفير المشترك</span>
                        <span className="font-semibold text-foreground tabular-nums">
                          {savings.toLocaleString()} د.ج ({pct}%)
                        </span>
                      </div>
                    </div>
                  );
                })()
              ) : (
                <div className="rounded-lg border border-dashed border-border bg-muted/20 p-3 text-[11px] text-muted-foreground text-center">
                  أدخل سعراً أصلياً وسعراً ترويجياً أقل منه لعرض المعاينة المباشرة
                </div>
              )}

              {/* Live status preview — reflects the form fields in real time */}
              <PromoStatusBadge
                pkg={{
                  price: form.price || null,
                  promo_price: form.promo_price && form.promo_price > 0 ? form.promo_price : null,
                  promo_starts_at: form.promo_starts_at ? new Date(form.promo_starts_at).toISOString() : null,
                  promo_ends_at: form.promo_ends_at ? new Date(form.promo_ends_at).toISOString() : null,
                }}
              />
            </div>

            <div className="grid grid-cols-2 gap-3 pt-2">
              <div className="flex items-center justify-between gap-3 px-4 py-3 rounded-xl border border-border/50">
                <div>
                  <Label htmlFor="is_active" className="cursor-pointer">نشطة</Label>
                  <p className="text-[10px] text-muted-foreground">معروضة للمستخدمين</p>
                </div>
                <Switch
                  id="is_active"
                  checked={form.is_active}
                  onCheckedChange={(v) => setForm({ ...form, is_active: v })}
                />
              </div>
              <div className="flex items-center justify-between gap-3 px-4 py-3 rounded-xl border border-border/50">
                <div>
                  <Label htmlFor="is_golden" className="cursor-pointer">باقة ذهبية</Label>
                  <p className="text-[10px] text-muted-foreground">عرض مميز</p>
                </div>
                <Switch
                  id="is_golden"
                  checked={form.is_golden}
                  onCheckedChange={(v) => setForm({ ...form, is_golden: v })}
                />
              </div>
            </div>
          </div>

          {/* Promo change history — only visible when editing an existing package */}
          {editing && <PromoAuditLog packageId={editing.id} />}

          <DialogFooter className="gap-2 sm:gap-2">
            <button
              type="button"
              onClick={() => setDialogOpen(false)}
              disabled={saving}
              className="flex items-center gap-2 px-4 py-2 rounded-xl border border-border/60 text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className="w-4 h-4" />
              إلغاء
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-2 gradient-primary text-primary-foreground font-bold px-5 py-2 rounded-xl hover:opacity-90 transition-all disabled:opacity-50"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              {editing ? "تحديث" : "إنشاء"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>حذف الباقة؟</AlertDialogTitle>
            <AlertDialogDescription>
              سيتم حذف الباقة <span className="font-bold text-foreground">"{deleteTarget?.name_ar}"</span> نهائياً.
              لا يمكن حذف باقة مرتبطة باشتراكات نشطة — في هذه الحالة عطّلها بدلاً من ذلك.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              حذف نهائي
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AdminLayout>
  );
}
