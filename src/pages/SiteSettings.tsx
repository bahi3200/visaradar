import AdminLayout from "@/components/AdminLayout";
import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Save, Facebook, Instagram, Send as TelegramIcon, Music2 } from "lucide-react";
import { toast } from "sonner";
import { useSiteSettings } from "@/hooks/useSiteSettings";

const socialFields = [
  { key: "facebook_url", label: "فيسبوك", icon: Facebook, placeholder: "https://facebook.com/yourpage" },
  { key: "instagram_url", label: "إنستغرام", icon: Instagram, placeholder: "https://instagram.com/yourpage" },
  { key: "tiktok_url", label: "تيكتوك", icon: Music2, placeholder: "https://tiktok.com/@yourpage" },
  { key: "telegram_url", label: "تليغرام", icon: TelegramIcon, placeholder: "https://t.me/yourchannel" },
];

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
      toast.success("تم حفظ الإعدادات بنجاح");
    } catch {
      toast.error("فشل في حفظ الإعدادات");
    } finally {
      setSaving(false);
    }
  };

  if (isLoading) {
    return (
      <AdminLayout title="إعدادات الموقع" subtitle="إدارة روابط السوشيال ميديا">
        <div className="text-center py-20 text-muted-foreground animate-pulse">جاري التحميل...</div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout title="إعدادات الموقع" subtitle="إدارة روابط السوشيال ميديا">
      <div className="max-w-xl">
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

          <button
            onClick={handleSave}
            disabled={saving}
            className="w-full flex items-center justify-center gap-2 gradient-primary text-primary-foreground font-bold py-3 rounded-xl transition-all hover:opacity-90 disabled:opacity-50"
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
        </motion.div>
      </div>
    </AdminLayout>
  );
}
