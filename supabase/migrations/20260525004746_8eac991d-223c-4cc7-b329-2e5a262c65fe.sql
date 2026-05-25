
-- 1) Receipts bucket: allow users to DELETE their own files
CREATE POLICY "Users can delete their own receipts"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'receipts'
  AND (auth.uid())::text = (storage.foldername(name))[1]
);

-- 2) visa_notifications: restrict SELECT to subscribed countries (or admins)
DROP POLICY IF EXISTS "Authenticated users can view notifications" ON public.visa_notifications;

CREATE POLICY "Users see notifications for their subscribed countries"
ON public.visa_notifications
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::app_role)
  OR public.has_role(auth.uid(), 'moderator'::app_role)
  OR EXISTS (
    SELECT 1 FROM public.subscriptions s
    WHERE s.user_id = auth.uid()
      AND s.status = 'active'
      AND s.service_type IN ('visa', 'both')
      AND country_code = ANY(s.countries)
  )
);

-- 3) visa_open_events: restrict SELECT to subscribed countries (or admins)
DROP POLICY IF EXISTS "Authenticated can read visa open events" ON public.visa_open_events;

CREATE POLICY "Users see open events for their subscribed countries"
ON public.visa_open_events
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::app_role)
  OR public.has_role(auth.uid(), 'moderator'::app_role)
  OR EXISTS (
    SELECT 1 FROM public.subscriptions s
    WHERE s.user_id = auth.uid()
      AND s.status = 'active'
      AND s.service_type IN ('visa', 'both')
      AND country_code = ANY(s.countries)
  )
);
