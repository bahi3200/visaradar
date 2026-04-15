
-- FIX: Payment settings - only admins see full data
DROP POLICY IF EXISTS "Authenticated users can view payment settings" ON public.payment_settings;

CREATE POLICY "Admins can view payment settings"
ON public.payment_settings FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role));

-- Create a security definer function to expose only needed payment info to authenticated users
CREATE OR REPLACE FUNCTION public.get_payment_info()
RETURNS TABLE(ccp_number text, ccp_key text, account_holder text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT ccp_number, ccp_key, account_holder
  FROM public.payment_settings
  LIMIT 1;
$$;

-- FIX: Contact messages - prevent user_id spoofing
DROP POLICY IF EXISTS "Anyone can insert contact messages" ON public.contact_messages;

CREATE POLICY "Anyone can insert contact messages"
ON public.contact_messages FOR INSERT
TO public
WITH CHECK (user_id IS NULL OR auth.uid() = user_id);

-- FIX: Reviews - prevent user_id change on update
DROP POLICY IF EXISTS "Users can update own reviews" ON public.reviews;

CREATE POLICY "Users can update own reviews"
ON public.reviews FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);
