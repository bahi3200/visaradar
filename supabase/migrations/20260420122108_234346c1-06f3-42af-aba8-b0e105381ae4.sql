-- Tighten moderator UPDATE policy to only allow specific column modifications
DROP POLICY IF EXISTS "Moderators can update requests" ON public.subscription_requests;

CREATE POLICY "Moderators can update requests"
ON public.subscription_requests
FOR UPDATE
TO authenticated
USING (
  -- Can only update rows where user is a moderator
  public.has_role(auth.uid(), 'moderator'::public.app_role)
)
WITH CHECK (
  -- Moderators can only modify these columns: moderator_action, moderator_action_at, moderator_id
  -- Verify that all other columns remain unchanged by comparing to existing values
  public.has_role(auth.uid(), 'moderator'::public.app_role)
  AND user_id IS NOT DISTINCT FROM (SELECT sr.user_id FROM public.subscription_requests sr WHERE sr.id = subscription_requests.id)
  AND package_id IS NOT DISTINCT FROM (SELECT sr.package_id FROM public.subscription_requests sr WHERE sr.id = subscription_requests.id)
  AND service_type IS NOT DISTINCT FROM (SELECT sr.service_type FROM public.subscription_requests sr WHERE sr.id = subscription_requests.id)
  AND countries IS NOT DISTINCT FROM (SELECT sr.countries FROM public.subscription_requests sr WHERE sr.id = subscription_requests.id)
  AND full_name IS NOT DISTINCT FROM (SELECT sr.full_name FROM public.subscription_requests sr WHERE sr.id = subscription_requests.id)
  AND email IS NOT DISTINCT FROM (SELECT sr.email FROM public.subscription_requests sr WHERE sr.id = subscription_requests.id)
  AND phone IS NOT DISTINCT FROM (SELECT sr.phone FROM public.subscription_requests sr WHERE sr.id = subscription_requests.id)
  AND telegram_chat_id IS NOT DISTINCT FROM (SELECT sr.telegram_chat_id FROM public.subscription_requests sr WHERE sr.id = subscription_requests.id)
  AND receipt_url IS NOT DISTINCT FROM (SELECT sr.receipt_url FROM public.subscription_requests sr WHERE sr.id = subscription_requests.id)
  AND status IS NOT DISTINCT FROM (SELECT sr.status FROM public.subscription_requests sr WHERE sr.id = subscription_requests.id)
  AND reviewed_at IS NOT DISTINCT FROM (SELECT sr.reviewed_at FROM public.subscription_requests sr WHERE sr.id = subscription_requests.id)
  AND reviewed_by IS NOT DISTINCT FROM (SELECT sr.reviewed_by FROM public.subscription_requests sr WHERE sr.id = subscription_requests.id)
  AND admin_notes IS NOT DISTINCT FROM (SELECT sr.admin_notes FROM public.subscription_requests sr WHERE sr.id = subscription_requests.id)
  AND ai_fraud_detected IS NOT DISTINCT FROM (SELECT sr.ai_fraud_detected FROM public.subscription_requests sr WHERE sr.id = subscription_requests.id)
  AND ai_verification_result IS NOT DISTINCT FROM (SELECT sr.ai_verification_result FROM public.subscription_requests sr WHERE sr.id = subscription_requests.id)
  AND created_at IS NOT DISTINCT FROM (SELECT sr.created_at FROM public.subscription_requests sr WHERE sr.id = subscription_requests.id)
  AND updated_at IS NOT DISTINCT FROM (SELECT sr.updated_at FROM public.subscription_requests sr WHERE sr.id = subscription_requests.id)
);