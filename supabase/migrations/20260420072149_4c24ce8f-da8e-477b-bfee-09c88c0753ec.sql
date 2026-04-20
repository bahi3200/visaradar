-- =========================================================
-- FIX 1: subscriptions — منع تعديل الأعمدة الحساسة
-- =========================================================
DROP POLICY IF EXISTS "Users can update own subscription telegram" ON public.subscriptions;

CREATE POLICY "Users can update own subscription telegram only"
ON public.subscriptions
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (
  auth.uid() = user_id
  -- لا يمكن للمستخدم تغيير الحقول الحساسة
  AND status = (SELECT status FROM public.subscriptions s WHERE s.id = subscriptions.id)
  AND expires_at = (SELECT expires_at FROM public.subscriptions s WHERE s.id = subscriptions.id)
  AND starts_at = (SELECT starts_at FROM public.subscriptions s WHERE s.id = subscriptions.id)
  AND package_id = (SELECT package_id FROM public.subscriptions s WHERE s.id = subscriptions.id)
  AND service_type = (SELECT service_type FROM public.subscriptions s WHERE s.id = subscriptions.id)
  AND countries = (SELECT countries FROM public.subscriptions s WHERE s.id = subscriptions.id)
  AND user_id = (SELECT user_id FROM public.subscriptions s WHERE s.id = subscriptions.id)
);

-- =========================================================
-- FIX 2: referrals — منع self-referral وتعيين المكافآت يدوياً
-- =========================================================
DROP POLICY IF EXISTS "Users can create referrals" ON public.referrals;

CREATE POLICY "Users can create valid referrals only"
ON public.referrals
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = referred_id
  AND referrer_id <> referred_id
  AND referrer_rewarded = false
  AND referred_rewarded = false
  AND referrer_bonus_days = 0
  AND referred_bonus_days = 0
);

-- =========================================================
-- FIX 3: profiles — منع تعديل حقول telegram الحساسة client-side
-- =========================================================
DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;

CREATE POLICY "Users can update own profile non-telegram fields"
ON public.profiles
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (
  auth.uid() = user_id
  -- منع تعديل حقول telegram الحساسة (تُحدّث فقط عبر edge functions / service_role)
  AND telegram_id IS NOT DISTINCT FROM (SELECT telegram_id FROM public.profiles p WHERE p.id = profiles.id)
  AND telegram_link_token IS NOT DISTINCT FROM (SELECT telegram_link_token FROM public.profiles p WHERE p.id = profiles.id)
  AND telegram_link_expires_at IS NOT DISTINCT FROM (SELECT telegram_link_expires_at FROM public.profiles p WHERE p.id = profiles.id)
  AND telegram_linked_at IS NOT DISTINCT FROM (SELECT telegram_linked_at FROM public.profiles p WHERE p.id = profiles.id)
  AND telegram_username IS NOT DISTINCT FROM (SELECT telegram_username FROM public.profiles p WHERE p.id = profiles.id)
  AND referral_code IS NOT DISTINCT FROM (SELECT referral_code FROM public.profiles p WHERE p.id = profiles.id)
);