import AdminLayout from "@/components/AdminLayout";
import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Save, Facebook, Instagram, Send as TelegramIcon, Music2, Clock, Zap } from "lucide-react";
import { toast } from "sonner";
import { useSiteSettings } from "@/hooks/useSiteSettings";

const socialFields = [
  { key: "facebook_url", label: "فيسبوك", icon: Facebook, placeholder: "https://facebook.com/yourpage" },
  { key: "instagram_url", label: "إنستغرام", icon: Instagram, placeholder: "https://instagram.com/yourpage" },
  { key: "tiktok_url", label: "تيكتوك", icon: Music2, placeholder: "https://tiktok.com/@yourpage" },
  { key: "telegram_url", label: "تليغرام", icon: TelegramIcon, placeholder: "https://t.me/yourchannel" },
];

const REMINDER_KEY = "expiry_reminder_days";
const QUICK_TEST_KEY = "telegram_quick_test_message";
const QUICK_TEST_DEFAULT = "مرحباً من VisaRadar 👋";
const QUICK_TEST_MAX = 500;

function normalizeReminderDays(raw: string): { value: string; days: number[]; error?: string } {
  const parts = raw
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  if (parts.length === 0) return { value: "", days: [], error: "أدخل رقماً واحداً على الأقل" };
  const nums: number[] = [];
  for (const p of parts) {
    const n = parseInt(p, 10);
    if (!Number.isFinite(n) || n <= 0 || n > 60) {
      return { value: raw, days: [], error: `قيمة غير صالحة: "${p}" (يجب أن تكون بين 1 و 60)` };
    }
    nums.push(n);
  }
  const unique = Array.from(new Set(nums)).sort((a, b) => b - a);
  return { value: unique.join(","), days: unique };
}

export default function SiteSettingsPage() {
  const { settings, isLoading, updateSetting } = useSiteSettings();
  const [values, setValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (settings) setValues(settings);
  }, [settings]);

  const handleSave = async () => {
    setSaving(true);
    try {
      for (const field of socialFields) {
        if (values[field.key] !== settings[field.key]) {
          await updateSetting.mutateAsync({ key: field.key, value: values[field.key] || "" });
        }
      }
      // Reminder days
      const raw = values[REMINDER_KEY] ?? "";
      const norm = normalizeReminderDays(raw);
      if (norm.error) {
        toast.error(norm.error);
        setSaving(false);
        return;
      }
      if (norm.value !== (settings[REMINDER_KEY] ?? "")) {
        await updateSetting.mutateAsync({ key: REMINDER_KEY, value: norm.value });
        setValues((v) => ({ ...v, [REMINDER_KEY]: norm.value }));
      }
      // Quick test message
      const quickRaw = (values[QUICK_TEST_KEY] ?? "").trim();
      if (!quickRaw) {
        toast.error("نص رسالة الاختبار السريع لا يمكن أن يكون فارغاً");
        setSaving(false);
        return;
      }
      if (quickRaw.length > QUICK_TEST_MAX) {
        toast.error(`نص رسالة الاختبار طويل جداً (الحد الأقصى ${QUICK_TEST_MAX} حرف)`);
        setSaving(false);
        return;
      }
      if (quickRaw !== (settings[QUICK_TEST_KEY] ?? "")) {
        await updateSetting.mutateAsync({ key: QUICK_TEST_KEY, value: quickRaw });
      }
      toast.success("تم حفظ الإعدادات بنجاح");
    } catch {
      toast.error("فشل في حفظ الإعدادات");
    } finally {
      setSaving(false);
    }
  };

  if (isLoading) {
    return (
      <AdminLayout title="إعدادات الموقع" subtitle="إدارة روابط السوشيال ميديا والتذكيرات">
        <div className="text-center py-20 text-muted-foreground animate-pulse">جاري التحميل...</div>
      </AdminLayout>
    );
  }

  const reminderRaw = values[REMINDER_KEY] ?? "";
  const reminderPreview = normalizeReminderDays(reminderRaw);

  return (
    <AdminLayout title="إعدادات الموقع" subtitle="إدارة روابط السوشيال ميديا والتذكيرات">
      <div className="max-w-xl space-y-6">
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          className="gradient-card rounded-2xl border border-border/50 p-6 shadow-card space-y-5"
        >
          <h2 className="font-heading text-lg font-bold text-foreground mb-1">روابط السوشيال ميديا</h2>
          <p className="text-xs text-muted-foreground mb-4">تظهر هذه الروابط في الفوتر والصفحة الرئيسية</p>

          {socialFields.map((field) => (
            <div key={field.key}>
              <label className="flex items-center gap-2 text-sm font-medium text-foreground mb-2">
                <field.icon className="w-4 h-4 text-primary" />
                {field.label}
              </label>
              <input
                type="url"
                dir="ltr"
                value={values[field.key] || ""}
                onChange={(e) => setValues({ ...values, [field.key]: e.target.value })}
                placeholder={field.placeholder}
                className="w-full rounded-xl border border-border/50 bg-secondary/30 px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
            </div>
          ))}
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="gradient-card rounded-2xl border border-border/50 p-6 shadow-card space-y-4"
        >
          <div>
            <h2 className="font-heading text-lg font-bold text-foreground mb-1 flex items-center gap-2">
              <Clock className="w-5 h-5 text-primary" />
              تذكيرات انتهاء الاشتراك
            </h2>
            <p className="text-xs text-muted-foreground">
              عدد الأيام قبل انتهاء الاشتراك التي يُرسل فيها تذكير عبر البريد و Telegram. افصل بين القيم بفواصل.
            </p>
          </div>

          <div>
            <label className="text-sm font-medium text-foreground mb-2 block">أيام التذكير (1 - 60)</label>
            <input
              type="text"
              dir="ltr"
              value={reminderRaw}
              onChange={(e) => setValues({ ...values, [REMINDER_KEY]: e.target.value })}
              placeholder="7,3,1"
              className="w-full rounded-xl border border-border/50 bg-secondary/30 px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
            {reminderPreview.error ? (
              <p className="text-xs text-destructive mt-2">{reminderPreview.error}</p>
            ) : reminderPreview.days.length > 0 ? (
              <div className="flex flex-wrap gap-2 mt-3">
                {reminderPreview.days.map((d) => (
                  <span
                    key={d}
                    className="px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-bold border border-primary/20"
                  >
                    D-{d}
                  </span>
                ))}
              </div>
            ) : null}
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="gradient-card rounded-2xl border border-border/50 p-6 shadow-card space-y-4"
        >
          <div>
            <h2 className="font-heading text-lg font-bold text-foreground mb-1 flex items-center gap-2">
              <Zap className="w-5 h-5 text-primary" />
              رسالة اختبار Telegram السريعة
            </h2>
            <p className="text-xs text-muted-foreground">
              النص الذي يُرسَل عند الضغط على زر «اختبار» بجانب أي مستخدم في صفحة مستخدمي Telegram. يدعم HTML بسيط (&lt;b&gt;, &lt;i&gt;, &lt;a&gt;).
            </p>
          </div>
          <div>
            <textarea
              dir="rtl"
              rows={3}
              value={values[QUICK_TEST_KEY] ?? ""}
              onChange={(e) => setValues({ ...values, [QUICK_TEST_KEY]: e.target.value })}
              placeholder={QUICK_TEST_DEFAULT}
              maxLength={QUICK_TEST_MAX}
              className="w-full rounded-xl border border-border/50 bg-secondary/30 px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none"
            />
            <div className="flex justify-between text-xs text-muted-foreground mt-1.5">
              <span>{(values[QUICK_TEST_KEY] ?? "").length} / {QUICK_TEST_MAX} حرف</span>
              {(values[QUICK_TEST_KEY] ?? "") !== QUICK_TEST_DEFAULT && (
                <button
                  type="button"
                  onClick={() => setValues({ ...values, [QUICK_TEST_KEY]: QUICK_TEST_DEFAULT })}
                  className="text-primary hover:underline"
                >
                  استعادة الافتراضي
                </button>
              )}
            </div>
          </div>
        </motion.div>

        <button
          onClick={handleSave}
          disabled={saving}
          className="w-full max-w-xl flex items-center justify-center gap-2 gradient-primary text-primary-foreground font-bold py-3 rounded-xl transition-all hover:opacity-90 disabled:opacity-50"
        >
          {saving ? (
            <div className="w-4 h-4 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin" />
          ) : (
            <>
              <Save className="w-4 h-4" />
              حفظ الإعدادات
            </>
          )}
        </button>
      </div>
    </AdminLayout>
  );
}
