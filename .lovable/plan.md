## Advanced Human Simulation & Stealth Layer — تنفيذ كامل

سنبني نظام stealth متقدم على مرحلتين: **VPS Worker (Playwright)** للتنفيذ الفعلي، و**Supabase** لإدارة الـ profiles/proxies/metrics/risk.

### 1) VPS Worker — Playwright Stealth Engine
ملفات جديدة في `vps-worker/`:
- `lib/browser-pool.js` — تشغيل Chrome stable حقيقي عبر `playwright-extra` + `puppeteer-extra-plugin-stealth` (تعطيل `navigator.webdriver`, spoof plugins/languages/webgl/canvas/audio).
- `lib/human-simulation.js` — Bezier curve mouse movements، random pauses، realistic scrolling، hover/focus/blur events، idle time.
- `lib/navigation-patterns.js` — زيارة homepage أولاً أحياناً، تنقل طبيعي بين صفحات provider، random paths.
- `lib/profile-rotation.js` — تدوير profile (UA + viewport + locale + timezone + fonts) لكل (provider, country).
- `lib/proxy-router.js` — اختيار proxy حسب country/provider + timezone/locale matching من `pick_best_proxy`.
- `lib/captcha-detector.js` — كشف Cloudflare/CAPTCHA → تسجيل metric → cooldown.
- `lib/scan-runner.js` — يدمج الكل ويستبدل `requests/fetch` العادي.

### 2) Database — جداول جديدة + recompute
Migration واحدة:
- `human_session_profiles` (mouse_speed_range, scroll_pattern, idle_avg_ms, navigation_style).
- `provider_cooldown_state` (provider, until, reason, captcha_count_5m).
- `fingerprint_success_log` (profile_id, provider, success, captcha_seen).
- دالة `record_captcha_event(provider, country)` ترفع cooldown تلقائياً (exponential).
- دالة `get_bot_detection_dashboard()` ترجع: captcha_rate, block_rate, provider_risk, proxy_detection_rate, fingerprint_success_rate.

### 3) Edge Functions
- `stealth-scan-config` — يرجع للـ VPS: أفضل proxy + profile + cooldown status لكل provider.
- توسعة `ingest-stealth-metrics` لتسجيل fingerprint success وcaptcha events.

### 4) Admin Dashboard — تطوير `AdminStealthAnalytics`
إضافة widgets:
- Captcha rate (24h) per provider.
- Block rate per provider.
- Provider risk score table (مع cooldown countdown).
- Proxy detection rate (top 10 worst proxies).
- Fingerprint success rate per profile.
- Live cooldown queue (providers في quarantine الآن).

### 5) Smart Captcha Avoidance
- عند captcha: زيادة interval تلقائياً (5→10→20→40 دقيقة).
- proxy quarantine 45 دقيقة (موجود — سنربطه بـ VPS).
- captcha risk metrics في كل scan.

### تفاصيل تقنية
- Chrome stable عبر `playwright install chrome` (وليس chromium).
- stealth plugin: `puppeteer-extra-plugin-stealth` متوافق مع playwright.
- locale/timezone من proxy geo (موجود في `proxy_endpoints.geo_country`).
- لن نتعدى على Cloudflare بشكل عدائي — فقط نقلل البصمة.

### ما لن يتم
- لن نحل CAPTCHAs (غير قانوني وضد ToS).
- لن نستعمل خدمات anti-captcha مدفوعة.

سأبدأ بـ: (1) الـ migration، (2) ملفات VPS worker، (3) تطوير الـ dashboard.
