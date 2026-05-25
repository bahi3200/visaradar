# Advanced Human Simulation Layer — خطة التنفيذ

نطاق العمل واسع جداً (10 أنظمة فرعية) ويمتد بين 3 طبقات: **vps-worker** (Playwright)، **قاعدة البيانات + Edge Functions**، و**لوحة الأدمن**. ما يلي خطة منظمة على دفعات حتى نُنجز كل طبقة بجودة عالية بدل دفعة واحدة سطحية.

## ما هو موجود بالفعل (لا حاجة لإعادة بنائه)
- `playwright-extra + stealth` مفعّل
- mouse paths/scroll/typing jitter أساسي
- WebGL/Canvas/timezone spoofing أساسي
- UA + sec-ch-ua rotation
- random headless/headful switching (`HEADFUL_PROBABILITY`, `HEADFUL_PROVIDERS`)
- proxy pools لكل provider + cooldown awareness
- captcha/cloudflare/rate-limit detection + retry على proxy جديد
- storageState persistence
- adaptive interval بحسب provider risk score
- evidence capture (screenshot + html)

## ما سيُضاف (الدفعات الثلاث)

### الدفعة 1 — قاعدة البيانات + Backend
جداول جديدة + Edge Function لاستقبال المقاييس:

1. **`stealth_profiles`** — بصمات متعددة جاهزة للتدوير
   - `name, user_agent, viewport, gpu_vendor, gpu_renderer, fonts[], screen_resolution, hardware_concurrency, device_memory, languages[], timezone, locale, media_devices(jsonb)`
   - `last_used_at, success_count, failure_count, captcha_count, score`

2. **`browser_profiles`** — جلسات دائمة لكل (provider+country+proxy)
   - `provider, country_code, proxy_label, storage_state_path, cookies(jsonb), history(jsonb), last_visit_at, visits_count, healthy boolean`

3. **`proxy_quarantine`** — عزل البروكسي عند كثرة الـcaptchas
   - `proxy_label, provider, country_code, reason, captcha_count, quarantined_until, released_at`

4. **`stealth_metrics`** — قياسات تجميعية كل دقيقة
   - `provider, country_code, window_start, total_requests, captcha_count, block_count, success_count, cloudflare_count, fingerprint_id, proxy_label, headful boolean`

5. **`provider_timing_profiles`** — توقيت مخصص لكل provider
   - `provider, min_interval_s, max_interval_s, jitter_pct, min_idle_ms, max_idle_ms, scroll_speed, mouse_speed, headful_only boolean`

6. **Edge Function `ingest-stealth-metrics`** — استقبال نتائج الفحص من VPS مع `requireServiceRole` + تحديث `stealth_profiles.success/failure` و`proxy_quarantine` تلقائياً عند تجاوز عتبة الـcaptcha.

7. **DB function** `should_quarantine_proxy(label, provider)` للقرار التلقائي.

RLS: قراءة للأدمن فقط، كتابة لـservice_role.

### الدفعة 2 — تحسينات VPS Worker
كل ميزة في ملف منفصل تحت `vps-worker/lib/`:

- **`humanize.js`** — Bezier mouse curves، realistic scroll بسرعة متغيرة، hover قبل الـclick، focus/blur events، idle pauses (200ms–4s) بتوزيع log-normal.
- **`navigation.js`** — Smart paths: قبل فتح صفحة المواعيد، 30–60% احتمال زيارة الصفحة الرئيسية للـprovider أولاً + التنقل عبر روابط داخلية (2–4 hops).
- **`profiles.js`** — تحميل/تدوير `stealth_profiles` من DB، حفظ `browser_profiles` (cookies + storageState + history) لكل (provider, country, proxy).
- **`adaptive.js`** — إذا captcha_rate آخر ساعة > 15% للـprovider، فرض headful وتقليل التردد للضعف. fast headless للفحوصات منخفضة الخطورة فقط.
- **`timing.js`** — يقرأ `provider_timing_profiles` ويطبق jitter غير منتظم (Poisson distribution بدل uniform).
- **`cloudflare.js`** — اكتشاف challenge (title contains "Just a moment", cf-chl-bypass cookie)، انتظار automatic حتى 30s، retry بعد delay عشوائي، تبديل fingerprint بعد 3 challenges متتالية.
- **`fingerprint.js`** — تدوير GPU/WebGL/fonts/screen/hardwareConcurrency/mediaDevices عبر injected scripts.
- **`geo.js`** — اختيار proxy مطابق لدولة الـprovider + ضبط `timezoneId` و`locale` و`Accept-Language` لتطابق IP الـproxy.
- **`metrics.js`** — تجميع وإرسال `stealth_metrics` بعد كل دورة.

تحديث `worker.js` للاستيراد من هذه الـmodules دون كسر السلوك الحالي.

### الدفعة 3 — لوحة الأدمن
صفحة جديدة `/admin/stealth-analytics`:

- Cards علوية: captcha rate, block rate, fingerprint success rate, proxy detection rate (آخر 24س)
- جدول **Provider Risk Score** مع sparkline لـ24س
- جدول **Proxy Quarantine** الفعّال مع زر إفراج يدوي
- جدول **Stealth Profiles** مع score وعدد مرات الاستخدام
- توصيات تلقائية ("Provider X يحتاج headful")
- Tab لـ `provider_timing_profiles` للتعديل المباشر

روابط في AdminLayout.

## التفاصيل التقنية

| طبقة | تقنية |
|---|---|
| DB | Supabase Postgres + RLS + DB functions |
| Edge | Deno + `requireServiceRole` من `_shared/internalAuth.ts` |
| VPS | Node + playwright-extra + stealth + canvas/webgl override scripts |
| UI | React + framer-motion + Recharts |

## ترتيب التنفيذ
1. الدفعة 1 (DB + Edge) — أكتبها الآن مع migration واحد ثم انتظر موافقتك على الـmigration.
2. الدفعة 2 (VPS) — بعد التأكد من الجداول.
3. الدفعة 3 (Dashboard) — أخيراً، بعد توفر بيانات حقيقية للعرض.

## ملاحظات
- VPS worker لا يُنشر تلقائياً من Lovable؛ ستحتاج لـpull/restart يدوياً على VPS بعد كل دفعة.
- لن أعدّل سلوكاً مالياً/اشتراكياً موجوداً.
- جميع المقاييس ستُخزّن مع TTL ضمني (يمكن إضافة cron تنظيف لاحقاً).

هل أبدأ بالدفعة 1 (الجداول + Edge Function)؟