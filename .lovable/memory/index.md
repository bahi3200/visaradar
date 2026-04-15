# Project Memory

## Core
- React, Vite, Tailwind CSS, Framer Motion (migrated from Next.js).
- Supabase with Roles & Edge Functions.
- Full RTL (Arabic) support using Cairo and Tajawal fonts.
- Admin account: eglwach2@gmail.com.

## Memories
- [Visual Identity](mem://style/visual-identity) — Dark navy blue with gold accents, visa-first priority, passport motifs
- [Device Management](mem://features/device-management) — Max 2 devices per user via digital fingerprinting. Admins exempt
- [Subscription Tiers](mem://features/subscription-tiers) — Pricing for 3/6/12 months and Gold tier, country limits
- [Form Interactions](mem://ux/interaction-patterns) — Never disable form buttons; use toasts for validation errors
- [Visa Monitoring](mem://features/visa-monitoring) — 5-min checks for VFS/TLS/BLS, Telegram HTML alerts, snippet history
- [Subscription Workflow](mem://features/subscription-workflow) — CCP/BaridiMob payments, Gemini OCR receipt checks, alerts
- [Content Gating](mem://features/content-gating) — Blur gated content based on active subscription service type
- [Registration Flow](mem://auth/registration-flow) — 4-step flow: Info, Service Type, Tier, Payment
- [Subscription Upgrade](mem://features/subscription-upgrade) — Pay difference for upgrade, disable current tier, add admin note
- [Form Simplification](mem://ux/form-simplification) — Pre-fill read-only data for logged-in users during checkout
- [Email Constraints](mem://constraints/email-delivery) — Real email delivery requires custom domain config in Supabase
- [Admin Operations](mem://features/admin-operations) — UTF-8 BOM CSV export, Edge function for hard deletion
- [Auth System](mem://auth/authentication-system) — Supabase auth, interest collection for routing
- [Moderator System](mem://features/moderator-system) — Moderators suggest actions, admin approves. Can't access payments/users/settings
- [Social Media Links](mem://features/social-media-links) — Dynamic social links from admin dashboard, shown in footer + homepage
