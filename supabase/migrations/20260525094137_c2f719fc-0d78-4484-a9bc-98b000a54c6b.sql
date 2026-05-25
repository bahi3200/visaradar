
-- Tighten visa_content_signals SELECT policy
DROP POLICY IF EXISTS "Authenticated subscribers can read signals" ON public.visa_content_signals;
CREATE POLICY "Active subscribers can read content signals"
ON public.visa_content_signals
FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'moderator'::app_role)
  OR EXISTS (
    SELECT 1 FROM public.subscriptions s
    WHERE s.user_id = auth.uid()
      AND s.status = 'active'
      AND s.service_type = ANY (ARRAY['visa','both'])
      AND s.expires_at > now()
      AND visa_content_signals.country_code = ANY (s.countries)
  )
);

-- Tighten visa_early_signals SELECT policy
DROP POLICY IF EXISTS "Authenticated can read early signals" ON public.visa_early_signals;
CREATE POLICY "Active subscribers can read early signals"
ON public.visa_early_signals
FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'moderator'::app_role)
  OR EXISTS (
    SELECT 1 FROM public.subscriptions s
    WHERE s.user_id = auth.uid()
      AND s.status = 'active'
      AND s.service_type = ANY (ARRAY['visa','both'])
      AND s.expires_at > now()
      AND visa_early_signals.country_code = ANY (s.countries)
  )
);

-- Tighten realtime.messages "public:%" broadcast policy to admins only.
-- postgres_changes subscriptions are unaffected (they go through replication + table RLS).
DROP POLICY IF EXISTS "Authenticated read public realtime" ON realtime.messages;
CREATE POLICY "Admins read public realtime"
ON realtime.messages
FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  AND realtime.topic() LIKE 'public:%'
);
