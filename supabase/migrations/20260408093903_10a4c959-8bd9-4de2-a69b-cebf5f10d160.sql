
DROP POLICY "Service role can insert checks" ON public.visa_monitor_checks;

CREATE POLICY "Admins can insert checks"
  ON public.visa_monitor_checks
  FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
