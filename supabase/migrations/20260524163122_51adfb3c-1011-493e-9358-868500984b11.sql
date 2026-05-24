
ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS auto_renew BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS renewal_request_created_at TIMESTAMPTZ;

ALTER TABLE public.subscription_requests
  ADD COLUMN IF NOT EXISTS renewing_subscription_id UUID REFERENCES public.subscriptions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS is_auto_renewal BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_subscriptions_auto_renew_expiring
  ON public.subscriptions (expires_at)
  WHERE auto_renew = true AND status = 'active';

-- Replace the user-update policy so auto_renew can be toggled by the owner
DROP POLICY IF EXISTS "Users can update own subscription telegram only" ON public.subscriptions;

CREATE POLICY "Users can update own subscription opt-in fields"
ON public.subscriptions
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (
  auth.uid() = user_id
  AND status = (SELECT s.status FROM public.subscriptions s WHERE s.id = subscriptions.id)
  AND expires_at = (SELECT s.expires_at FROM public.subscriptions s WHERE s.id = subscriptions.id)
  AND starts_at = (SELECT s.starts_at FROM public.subscriptions s WHERE s.id = subscriptions.id)
  AND package_id = (SELECT s.package_id FROM public.subscriptions s WHERE s.id = subscriptions.id)
  AND countries = (SELECT s.countries FROM public.subscriptions s WHERE s.id = subscriptions.id)
  AND service_type = (SELECT s.service_type FROM public.subscriptions s WHERE s.id = subscriptions.id)
);
