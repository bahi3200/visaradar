-- 1) Fix chat_messages: verify conversation ownership on INSERT
DROP POLICY IF EXISTS "Users insert own messages" ON public.chat_messages;
CREATE POLICY "Users insert own messages"
ON public.chat_messages
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = user_id
  AND EXISTS (
    SELECT 1 FROM public.chat_conversations c
    WHERE c.id = conversation_id AND c.user_id = auth.uid()
  )
);

-- 2) Add RESTRICTIVE safeguard to user_roles: only admins or self can ever see role rows,
--    even if a future PERMISSIVE policy is added. Existing PERMISSIVE policy is preserved.
CREATE POLICY "Restrict user_roles reads to self or admin"
ON public.user_roles
AS RESTRICTIVE
FOR SELECT
TO authenticated
USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'::public.app_role));

-- 3) Moderator-safe view for subscription_requests (excludes ai_verification_result,
--    ai_fraud_detected, admin_notes). Admins continue using the base table directly.
CREATE OR REPLACE VIEW public.subscription_requests_moderator_view
WITH (security_invoker = on) AS
SELECT
  id,
  user_id,
  package_id,
  service_type,
  countries,
  full_name,
  email,
  phone,
  telegram_chat_id,
  receipt_url,
  status,
  moderator_id,
  moderator_action,
  moderator_action_at,
  reviewed_at,
  reviewed_by,
  created_at,
  updated_at
FROM public.subscription_requests;

GRANT SELECT ON public.subscription_requests_moderator_view TO authenticated;

-- Remove moderator's direct SELECT on the base table; replace with view-based access
DROP POLICY IF EXISTS "Moderators can view all requests" ON public.subscription_requests;