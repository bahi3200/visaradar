
-- CRITICAL: Lock down user_roles - only admins can INSERT/DELETE
CREATE POLICY "Only admins can insert roles"
ON public.user_roles FOR INSERT
TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Only admins can delete roles"
ON public.user_roles FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Only admins can update roles"
ON public.user_roles FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role));

-- Service role full access for visa_monitor_checks
CREATE POLICY "Service role full access monitor checks"
ON public.visa_monitor_checks FOR ALL
TO service_role
USING (true)
WITH CHECK (true);
