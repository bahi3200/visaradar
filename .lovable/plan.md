

# خطة تحسين أداء الأنيميشن على الموبايل

## المشكلة
الصفحة الرئيسية تستخدم `framer-motion` بكثافة مع تأثيرات `spring`، `whileHover`، وجسيمات عائمة (floating particles) تعمل بلا توقف. هذا يستهلك موارد الأجهزة المحمولة ويؤثر على سلاسة التمرير.

## التحسينات

### 1. إنشاء hook مخصص `useReducedMotion`
- يكشف تفضيل المستخدم عبر `prefers-reduced-motion` media query
- يكشف أيضاً إذا كان الجهاز موبايل عبر عرض الشاشة
- يُرجع `shouldReduceMotion: boolean`

### 2. تبسيط الأنيميشن على الموبايل وعند تفعيل reduced-motion

**HeroSection.tsx:**
- إيقاف الجسيمات العائمة (6 عناصر `motion.div` بـ `repeat: Infinity`) على الموبايل
- تقليل مسافات `y` من 30px إلى 10px

**StatsSection.tsx:**
- إزالة `whileHover` على الموبايل (لا يوجد hover على شاشات اللمس)
- تبسيط `spring` إلى `tween` أسرع

**HowItWorksSection.tsx:**
- إزالة `whileHover` على الموبايل
- تقليل `staggerChildren` من 0.15 إلى 0.08

**TestimonialsSection.tsx:**
- إزالة `whileHover` على الموبايل

**Index.tsx (الأقسام المضمّنة):**
- إزالة `whileHover` للدول والخدمتين على الموبايل
- تقليل مسافات الحركة

**FAQSection.tsx:**
- تقليل `staggerChildren`

### 3. إضافة CSS لـ `prefers-reduced-motion` في `index.css`
```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}
```

### 4. عند `shouldReduceMotion = true`:
- كل `initial` يصبح `{{ opacity: 1 }}` (بدون حركة)
- كل `whileHover` يُحذف
- الجسيمات العائمة لا تُرسم

## الملفات المتأثرة
- `src/hooks/useReducedMotion.ts` (جديد)
- `src/index.css`
- `src/components/home/HeroSection.tsx`
- `src/components/home/StatsSection.tsx`
- `src/components/home/HowItWorksSection.tsx`
- `src/components/home/TestimonialsSection.tsx`
- `src/components/home/FAQSection.tsx`
- `src/pages/Index.tsx`

## ملاحظة تقنية
`framer-motion` يوفر `useReducedMotion()` مدمج، لكننا سنستخدم hook مخصص يجمع بين كشف الموبايل وتفضيل المستخدم لتوفير تحكم أدق.

