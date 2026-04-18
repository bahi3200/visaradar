// Reusable Telegram message templates for admin broadcasts.
// Variables: {{name}}, {{expires_at}} — replaced per-recipient by the
// edge function (telegram-send-message handles substitution if recipients
// are passed). For the admin dialog, {{name}} is replaced with the target
// label when sending to a single user; otherwise left as-is.

export interface TelegramTemplate {
  id: string;
  label: string;
  emoji: string;
  description: string;
  body: string;
}

export const TELEGRAM_TEMPLATES: TelegramTemplate[] = [
  {
    id: "welcome",
    label: "ترحيب",
    emoji: "👋",
    description: "رسالة ترحيب للمستخدمين الجدد بعد ربط حساب Telegram",
    body: `👋 <b>أهلاً بك في VisaRadar DZ</b>

تم ربط حسابك بنجاح. ستصلك التنبيهات هنا فور توفّر مواعيد التأشيرات للدول التي اخترتها.

🔔 تأكد أن الإشعارات مفعّلة في Telegram لتلقّي التنبيهات في الوقت الفعلي.

شكراً لاختيارك VisaRadar 🇩🇿`,
  },
  {
    id: "reminder",
    label: "تذكير اشتراك",
    emoji: "⏰",
    description: "تنبيه قبل انتهاء الاشتراك مع رابط التجديد",
    body: `⏰ <b>تذكير: اشتراكك يقترب من الانتهاء</b>

مرحباً 👋

نودّ تذكيرك بأن اشتراكك في <b>VisaRadar DZ</b> سينتهي قريباً.

🔁 لتجديد الاشتراك ومواصلة استقبال تنبيهات التأشيرات دون انقطاع، تفضّل بزيارة:
<a href="https://visaradar.dz/pricing">visaradar.dz/pricing</a>

نشكر ثقتك بنا 🙏`,
  },
  {
    id: "expired",
    label: "انتهاء الاشتراك",
    emoji: "🔒",
    description: "إشعار للمستخدمين الذين انتهى اشتراكهم بالفعل",
    body: `🔒 <b>انتهى اشتراكك في VisaRadar DZ</b>

مرحباً 👋

انتهى اشتراكك ولن تصلك تنبيهات جديدة حتى تقوم بالتجديد.

🚀 جدّد الآن وعُد لاستقبال آخر مواعيد التأشيرات لحظة بلحظة:
<a href="https://visaradar.dz/pricing">visaradar.dz/pricing</a>

نتمنّى رؤيتك من جديد 💙`,
  },
  {
    id: "announcement",
    label: "إعلان عام",
    emoji: "📢",
    description: "إعلان عن ميزة جديدة أو تحديث للمستخدمين",
    body: `📢 <b>إعلان من VisaRadar DZ</b>

مرحباً 👋

لدينا تحديث مهم نودّ مشاركته معك:

✨ [اكتب تفاصيل الإعلان هنا]

شكراً لكونك جزءاً من مجتمع VisaRadar 🇩🇿`,
  },
  {
    id: "new_country",
    label: "إضافة دولة جديدة",
    emoji: "🌍",
    description: "إعلان عن دعم دولة جديدة في النظام",
    body: `🌍 <b>دولة جديدة متاحة في VisaRadar DZ!</b>

أصبح بإمكانك الآن مراقبة مواعيد تأشيرة <b>[اسم الدولة]</b> والحصول على تنبيهات فورية فور توفّر المواعيد.

⚙️ افتح <a href="https://visaradar.dz/notifications">إعدادات التنبيهات</a> وأضف الدولة لقائمتك.`,
  },
  {
    id: "maintenance",
    label: "صيانة النظام",
    emoji: "🛠️",
    description: "إشعار بفترة صيانة قصيرة",
    body: `🛠️ <b>صيانة قصيرة - VisaRadar DZ</b>

سنقوم بصيانة النظام في:
🗓 <b>[التاريخ والوقت]</b>
⏱ المدة المتوقعة: <b>[المدة]</b>

قد تتأخر التنبيهات قليلاً خلال هذه الفترة. شكراً لتفهّمك 🙏`,
  },
];

export const TELEGRAM_TEMPLATES_MAP = Object.fromEntries(
  TELEGRAM_TEMPLATES.map((t) => [t.id, t]),
);
