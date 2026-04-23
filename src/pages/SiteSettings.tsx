import AdminLayout from "@/components/AdminLayout";
import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Save, Facebook, Instagram, Send as TelegramIcon, Music2, Clock, Zap } from "lucide-react";
import { toast } from "sonner";
import { useSiteSettings } from "@/hooks/useSiteSettings";

const socialFields = [
  { key: "public_facebook_url", label: "فيسبوك", icon: Facebook, placeholder: "https://facebook.com/yourpage" },
  { key: "public_instagram_url", label: "إنستغرام", icon: Instagram, placeholder: "https://instagram.com/yourpage" },
  { key: "public_tiktok_url", label: "تيكتوك", icon: Music2, placeholder: "https://tiktok.com/@yourpage" },
  { key: "public_telegram_url", label: "تليغرام", icon: TelegramIcon, placeholder: "https://t.me/yourchannel" },
];

const REMINDER_KEY = "expiry_reminder_days";
const QUICK_TEST_KEY = "telegram_quick_test_message";
const QUICK_TEST_DEFAULT = "مرحباً من VisaRadar 👋";
const QUICK_TEST_MAX = 500;

// Telegram-supported HTML tags (subset). Anything else is escaped.
// Reference: https://core.telegram.org/bots/api#html-style
const TELEGRAM_ALLOWED = ["b", "strong", "i", "em", "u", "s", "strike", "del", "code", "pre", "a", "br"];

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * Sanitize user text the way Telegram would render it: only whitelisted tags
 * survive (with safe href on <a>). Everything else is shown as escaped text.
 */
function renderTelegramHtml(input: string): { html: string; error: string | null } {
  if (!input) return { html: "", error: null };
  // Tokenize: split on tags vs text
  const tokenRe = /<\s*(\/?)\s*([a-zA-Z]+)([^>]*)>/g;
  let out = "";
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let unsupported: string | null = null;

  while ((match = tokenRe.exec(input)) !== null) {
    const [full, slash, rawTag, attrs] = match;
    const tag = rawTag.toLowerCase();
    out += escapeHtml(input.slice(lastIndex, match.index));
    lastIndex = match.index + full.length;

    if (!TELEGRAM_ALLOWED.includes(tag)) {
      if (!unsupported) unsupported = tag;
      out += escapeHtml(full);
      continue;
    }

    if (tag === "br") {
      out += "<br/>";
      continue;
    }

    if (tag === "a" && !slash) {
      const hrefMatch = attrs.match(/href\s*=\s*"([^"]*)"|href\s*=\s*'([^']*)'/i);
      const href = (hrefMatch?.[1] || hrefMatch?.[2] || "").trim();
      const safe = /^(https?:|tg:|mailto:)/i.test(href) ? href : "#";
      out += `<a href="${escapeHtml(safe)}" target="_blank" rel="noopener noreferrer" class="text-[#168acd] underline">`;
      continue;
    }

    out += slash ? `</${tag}>` : `<${tag}>`;
  }
  out += escapeHtml(input.slice(lastIndex));
  // Convert real newlines to <br/>
  out = out.replace(/\r?\n/g, "<br/>");

  return {
    html: out,
    error: unsupported ? `الوسم <${unsupported}> غير مدعوم في Telegram وسيظهر كنص` : null,
  };
}

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
    let savedAny = false;
    let hadError = false;
    try {
      // 1) Social media URLs — تُحفظ دائماً حتى لو كانت بقية الحقول غير صالحة.
      for (const field of socialFields) {
        if (values[field.key] !== settings[field.key]) {
          await updateSetting.mutateAsync({ key: field.key, value: values[field.key] || "" });
          savedAny = true;
        }
      }
      // 2) Reminder days (اختياري — لا يمنع حفظ بقية الأقسام إن كان غير صالح)
      const raw = (values[REMINDER_KEY] ?? "").trim();
      const previousReminder = (settings[REMINDER_KEY] ?? "").trim();
      if (raw.length > 0) {
        const norm = normalizeReminderDays(raw);
        if (norm.error) {
          toast.error(norm.error);
          hadError = true;
        } else if (norm.value !== previousReminder) {
          await updateSetting.mutateAsync({ key: REMINDER_KEY, value: norm.value });
          setValues((v) => ({ ...v, [REMINDER_KEY]: norm.value }));
          savedAny = true;
        }
      } else if (previousReminder.length > 0) {
        await updateSetting.mutateAsync({ key: REMINDER_KEY, value: "" });
        savedAny = true;
      }
      // 3) Quick test message — مستقل تماماً، لا يمنع حفظ السوشيال ميديا.
      const quickRaw = (values[QUICK_TEST_KEY] ?? "").trim();
      const previousQuick = settings[QUICK_TEST_KEY] ?? "";
      if (quickRaw !== previousQuick.trim()) {
        if (!quickRaw) {
          toast.error("تم تجاهل رسالة الاختبار: لا يمكن أن تكون فارغة");
          hadError = true;
        } else if (quickRaw.length > QUICK_TEST_MAX) {
          toast.error(`تم تجاهل رسالة الاختبار: طويلة جداً (الحد ${QUICK_TEST_MAX} حرف)`);
          hadError = true;
        } else {
          await updateSetting.mutateAsync({ key: QUICK_TEST_KEY, value: quickRaw });
          savedAny = true;
        }
      }

      if (savedAny && !hadError) toast.success("تم حفظ الإعدادات بنجاح");
      else if (savedAny && hadError) toast.success("تم حفظ الحقول الصالحة فقط");
      else if (!hadError) toast.info("لا توجد تغييرات للحفظ");
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
            {reminderRaw.trim().length > 0 && reminderPreview.error ? (
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
            ) : (
              <p className="text-xs text-muted-foreground/70 mt-2">
                اتركه فارغاً لاستخدام الإعداد الافتراضي
              </p>
            )}
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

          {/* Live Telegram preview */}
          <div className="space-y-2">
            <p className="text-xs font-medium text-foreground/80">معاينة مباشرة في Telegram</p>
            <div
              className="rounded-2xl p-4 border border-border/50"
              style={{
                background:
                  "linear-gradient(135deg, hsl(210 40% 92%) 0%, hsl(210 40% 96%) 100%)",
              }}
            >
              <div className="flex justify-end" dir="ltr">
                <div className="relative max-w-[85%] bg-[#effdde] text-[#000] rounded-2xl rounded-br-sm px-3.5 py-2 shadow-sm">
                  {(values[QUICK_TEST_KEY] ?? "").trim() ? (
                    <div
                      dir="auto"
                      className="text-[14px] leading-[1.35] whitespace-pre-wrap break-words [&_a]:text-[#168acd] [&_a]:underline [&_code]:bg-black/5 [&_code]:px-1 [&_code]:rounded [&_code]:font-mono [&_code]:text-[13px] [&_pre]:bg-black/5 [&_pre]:p-2 [&_pre]:rounded [&_pre]:font-mono [&_pre]:text-[13px] [&_pre]:my-1"
                      dangerouslySetInnerHTML={{
                        __html: renderTelegramHtml(values[QUICK_TEST_KEY] ?? "").html,
                      }}
                    />
                  ) : (
                    <span className="text-[13px] text-black/40 italic">
                      اكتب رسالة لرؤية المعاينة...
                    </span>
                  )}
                  <div className="flex items-center justify-end gap-1 mt-1 -mb-0.5">
                    <span className="text-[10px] text-black/45">
                      {new Date().toLocaleTimeString("en-US", {
                        hour: "2-digit",
                        minute: "2-digit",
                        hour12: false,
                      })}
                    </span>
                    <svg width="14" height="10" viewBox="0 0 16 11" fill="none" className="text-[#4fae4e]">
                      <path
                        d="M11.5 1L4.5 8L1.5 5"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                      <path
                        d="M14.5 1L7.5 8"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </div>
                </div>
              </div>
            </div>
            {renderTelegramHtml(values[QUICK_TEST_KEY] ?? "").error && (
              <p className="text-[11px] text-amber-600 dark:text-amber-500">
                ⚠️ {renderTelegramHtml(values[QUICK_TEST_KEY] ?? "").error}
              </p>
            )}
            <p className="text-[11px] text-muted-foreground/70">
              الوسوم المدعومة: &lt;b&gt;, &lt;i&gt;, &lt;u&gt;, &lt;s&gt;, &lt;a href&gt;, &lt;code&gt;, &lt;pre&gt;
            </p>
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
