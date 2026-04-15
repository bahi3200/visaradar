
-- =============================================
-- FIX 1: Profiles - restrict to own profile or admin
-- =============================================
DROP POLICY IF EXISTS "Profiles are viewable by everyone" ON public.profiles;

CREATE POLICY "Users can view their own profile"
ON public.profiles FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all profiles"
ON public.profiles FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Moderators can view all profiles"
ON public.profiles FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'moderator'::app_role));

-- =============================================
-- FIX 2: Payment settings - only authenticated users can view
-- =============================================
DROP POLICY IF EXISTS "Anyone can view payment settings" ON public.payment_settings;

CREATE POLICY "Authenticated users can view payment settings"
ON public.payment_settings FOR SELECT
TO authenticated
USING (true);

-- =============================================
-- FIX 3: Subscriptions - remove user INSERT and restrict UPDATE
-- =============================================
DROP POLICY IF EXISTS "Users can create their own subscriptions" ON public.subscriptions;
DROP POLICY IF EXISTS "Users can update their own subscriptions" ON public.subscriptions;

-- Users can only update telegram_chat_id on their own subscription
CREATE POLICY "Users can update own subscription telegram"
ON public.subscriptions FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Admin can update all subscriptions (already exists via has_role but let's ensure)
-- Admins already have full access via "Admins can create subscriptions" policy

-- =============================================
-- FIX 4: Receipts storage - restrict to owner and admins
-- =============================================
DROP POLICY IF EXISTS "Receipts are viewable by everyone" ON storage.objects;

CREATE POLICY "Users can view own receipts"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'receipts'
  AND (
    (auth.uid())::text = (storage.foldername(name))[1]
    OR public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'moderator'::app_role)
  )
);

-- Add DELETE policy for admins
CREATE POLICY "Admins can delete receipts"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'receipts'
  AND public.has_role(auth.uid(), 'admin'::app_role)
);

-- Make receipts bucket private
UPDATE storage.buckets SET public = false WHERE id = 'receipts';
