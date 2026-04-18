-- Drop the over-permissive public read policy
DROP POLICY IF EXISTS "Anyone can view site settings" ON public.site_settings;

-- Public can only read keys prefixed with public_
CREATE POLICY "Public can view public_ settings"
ON public.site_settings
FOR SELECT
TO public
USING (key LIKE 'public_%');

-- Admins can read all settings
CREATE POLICY "Admins can view all site settings"
ON public.site_settings
FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));