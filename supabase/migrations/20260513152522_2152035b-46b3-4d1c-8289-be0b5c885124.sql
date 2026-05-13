-- Ensure RLS is on
ALTER TABLE public.visa_open_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.visa_monitor_checks ENABLE ROW LEVEL SECURITY;

-- ===== visa_open_events =====
-- Drop redundant/overlapping SELECT policies and rebuild a single clear one
DROP POLICY IF EXISTS "Admins view all open events" ON public.visa_open_events;
DROP POLICY IF EXISTS "Authenticated users view open events" ON public.visa_open_events;
DROP POLICY IF EXISTS "Authenticated can read visa open events" ON public.visa_open_events;

-- Authenticated read-only access (anon explicitly excluded)
CREATE POLICY "Authenticated can read visa open events"
ON public.visa_open_events
FOR SELECT
TO authenticated
USING (true);

-- Block any client-side writes; only service_role policy below + DB trigger may write
DROP POLICY IF EXISTS "Block client writes to visa open events" ON public.visa_open_events;
CREATE POLICY "Block client writes to visa open events"
ON public.visa_open_events
AS RESTRICTIVE
FOR ALL
TO authenticated, anon
USING (false)
WITH CHECK (false);

-- ===== visa_monitor_checks =====
DROP POLICY IF EXISTS "Admins can view monitor checks" ON public.visa_monitor_checks;
DROP POLICY IF EXISTS "Authenticated users can view monitor checks" ON public.visa_monitor_checks;
DROP POLICY IF EXISTS "Authenticated can read visa monitor checks" ON public.visa_monitor_checks;

CREATE POLICY "Authenticated can read visa monitor checks"
ON public.visa_monitor_checks
FOR SELECT
TO authenticated
USING (true);

-- Keep existing admin INSERT policy; add a restrictive guard so only admins or
-- service_role can write from the client. service_role bypasses RLS anyway.
DROP POLICY IF EXISTS "Only admins may write visa monitor checks" ON public.visa_monitor_checks;
CREATE POLICY "Only admins may write visa monitor checks"
ON public.visa_monitor_checks
AS RESTRICTIVE
FOR ALL
TO authenticated, anon
USING (public.has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));
