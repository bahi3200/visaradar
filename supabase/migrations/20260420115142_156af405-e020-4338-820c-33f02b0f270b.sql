CREATE POLICY "Service role full access reminder log"
ON public.expiry_reminder_log
AS PERMISSIVE
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);