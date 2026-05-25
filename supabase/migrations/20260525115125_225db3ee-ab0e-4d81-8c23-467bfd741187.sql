
-- visa_appointments: replace permissive SELECT with subscription-scoped access
DROP POLICY IF EXISTS "Authenticated users view appointments" ON public.visa_appointments;
CREATE POLICY "Subscribers view appointments"
  ON public.visa_appointments FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'moderator'::app_role)
    OR EXISTS (
      SELECT 1 FROM public.subscriptions s
      WHERE s.user_id = auth.uid()
        AND s.status = 'active'
        AND s.expires_at > now()
        AND s.service_type IN ('visa','both')
        AND visa_appointments.country_code = ANY(s.countries)
    )
  );

-- visa_external_signals: replace 30-day open policy with subscription-scoped access
DROP POLICY IF EXISTS "Authenticated view recent signals" ON public.visa_external_signals;
CREATE POLICY "Subscribers view external signals"
  ON public.visa_external_signals FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'moderator'::app_role)
    OR EXISTS (
      SELECT 1 FROM public.subscriptions s
      WHERE s.user_id = auth.uid()
        AND s.status = 'active'
        AND s.expires_at > now()
        AND s.service_type IN ('visa','both')
        AND visa_external_signals.country_code = ANY(s.countries)
    )
  );

-- visa_notifications: add expires_at check
DROP POLICY IF EXISTS "Users see notifications for their subscribed countries" ON public.visa_notifications;
CREATE POLICY "Users see notifications for their subscribed countries"
  ON public.visa_notifications FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'moderator'::app_role)
    OR EXISTS (
      SELECT 1 FROM public.subscriptions s
      WHERE s.user_id = auth.uid()
        AND s.status = 'active'
        AND s.expires_at > now()
        AND s.service_type IN ('visa','both')
        AND visa_notifications.country_code = ANY(s.countries)
    )
  );

-- provider_adapters_config: admins only
DROP POLICY IF EXISTS "Authenticated read adapter config" ON public.provider_adapters_config;
CREATE POLICY "Admins read adapter config"
  ON public.provider_adapters_config FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

-- provider_center_changes: admins/moderators only
DROP POLICY IF EXISTS "Authenticated can read center changes" ON public.provider_center_changes;
CREATE POLICY "Staff read center changes"
  ON public.provider_center_changes FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'moderator'::app_role)
  );

-- provider_centers: admins, moderators, or active country-scoped subscribers
DROP POLICY IF EXISTS "Authenticated can read provider centers" ON public.provider_centers;
CREATE POLICY "Staff or subscribers read provider centers"
  ON public.provider_centers FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'moderator'::app_role)
    OR EXISTS (
      SELECT 1 FROM public.subscriptions s
      WHERE s.user_id = auth.uid()
        AND s.status = 'active'
        AND s.expires_at > now()
        AND s.service_type IN ('visa','both')
        AND provider_centers.country_code = ANY(s.countries)
    )
  );

-- provider_timing_profiles: admins only
DROP POLICY IF EXISTS "Authenticated read provider_timing_profiles" ON public.provider_timing_profiles;
CREATE POLICY "Admins read provider_timing_profiles"
  ON public.provider_timing_profiles FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));
