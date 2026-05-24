
DROP POLICY IF EXISTS "Service writes ban_events" ON public.ban_events;
DROP POLICY IF EXISTS "Service insert provider_throttle" ON public.provider_throttle;
DROP POLICY IF EXISTS "Admins update provider_throttle" ON public.provider_throttle;
CREATE POLICY "Admins manage provider_throttle" ON public.provider_throttle FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));
