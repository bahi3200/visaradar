-- Allow authenticated users to read monitor checks (no PII; only country/status/time data)
CREATE POLICY "Authenticated users can view monitor checks"
ON public.visa_monitor_checks
FOR SELECT
TO authenticated
USING (true);