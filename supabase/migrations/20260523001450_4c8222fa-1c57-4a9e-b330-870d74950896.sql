CREATE POLICY "Moderators can view subscription requests"
ON public.subscription_requests
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'moderator'::public.app_role));