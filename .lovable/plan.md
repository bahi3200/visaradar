# Human Verification Gateway (HVG)

نظام شرعي لإدارة جلسات TLScontact / VFS / BLS بالاعتماد على **تحقق بشري عند الحاجة** + **إعادة استعمال جلسات موثوقة**، بدل محاولة تجاوز Cloudflare.

## المبدأ

```text
[VPS worker] --(تحقق)--> [HVG API] --(جلسة موثوقة)--> [مراقبة]
       |                       |
       |  challenge مكتشف      |
       v                       v
 [challenge_sessions]   [Telegram deep link]
                               |
                               v
                       [المستخدم يفتح الرابط
                        ويحل CAPTCHA يدويًا]
                               |
                               v
                       [حفظ cookies في cookie_vault]
                               |
                               v
                       [worker يستأنف بنفس الجلسة]
```

## ما سيُبنى

### 1) قاعدة البيانات (migration واحدة)
- `provider_sessions` — جلسات حية (provider, country, user_id, fingerprint_hash, last_validated_at, health_score, status).
- `session_cookie_vault` — تخزين مشفّر للكوكيز (session_id, cookies_jsonb, encrypted, expires_at).
- `challenge_sessions` — تحدّيات نشطة بانتظار حل المستخدم (provider, type, deep_link_token, expires_at, resolved_at, resolved_by).
- `session_health_log` — كل استعمال للجلسة (success/captcha/block) لحساب health_score.
- `verification_queue` — طابور التحدّيات حسب الأولوية.
- دوال: `create_challenge_session`, `resolve_challenge_session`, `pick_healthy_session`, `record_session_outcome`.
- RLS: المستخدم يرى جلساته فقط، Admin يرى الكل، الـ workers يصلون عبر service_role.

### 2) Edge Functions
- `hvg-create-challenge` — يستدعى من VPS عند 403/captcha؛ ينشئ challenge + Telegram deep link.
- `hvg-resolve-challenge` — يستقبل الكوكيز من صفحة التحقق ويخزنها مشفّرة.
- `hvg-get-session` — يرجع للـ worker جلسة سليمة (cookies + fingerprint) لمزود/دولة.
- `hvg-session-heartbeat` — يسجل نتيجة كل استعمال (success/captcha/block) ويحدّث health_score.
- `telegram-send-verification` — يرسل deep link عبر Telegram bot الموجود.

### 3) صفحة التحقق البشري (Frontend)
- `/verify/:token` — صفحة عامة:
  - تشرح أن CAPTCHA ظهرت على مزود X
  - زر "افتح TLScontact في تبويب جديد"
  - بعد الحل: زر "تم — احفظ الجلسة" → يستخرج cookies عبر extension/postMessage أو يطلب من المستخدم لصقها (MVP: يدوي بسيط)
  - يستدعي `hvg-resolve-challenge`

### 4) VPS Worker — Session Adapter
ملف جديد `vps-worker/lib/session-gateway.js`:
- قبل كل scan: `getSession(provider, country)` من HVG.
- يحقن cookies في browser context.
- عند detection: `reportChallenge()` → cooldown للـ worker على هذا (provider+country) حتى يحل المستخدم.
- بعد كل scan: `reportOutcome()`.

### 5) Admin Dashboard
صفحة `/dashboard/verification-gateway`:
- جلسات حية / صحتها / آخر تحقق
- challenges بانتظار الحل
- معدل CAPTCHA لكل مزود
- زر إنشاء challenge يدوي

### 6) Smart Polling
- إذا لا توجد جلسة سليمة لمزود → التوقف عن الـ scan وإرسال طلب تحقق واحد فقط.
- adaptive intervals: كلما زاد health_score، قل الفاصل.

## ما **لن** يُنفّذ
- لا حل CAPTCHA آلي.
- لا خدمات anti-captcha مدفوعة.
- لا محاولات لكسر JS challenges.

## ترتيب التنفيذ
1. migration (جداول HVG + دوال + RLS).
2. Edge functions (5 functions).
3. صفحة `/verify/:token` + Telegram deep link.
4. ربط VPS worker بـ session-gateway.
5. Admin dashboard.

كل خطوة قابلة للاختبار مستقلة.
