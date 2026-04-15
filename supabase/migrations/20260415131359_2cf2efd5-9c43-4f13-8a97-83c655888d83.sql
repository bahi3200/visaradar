
-- 1. Site settings table for social media links
CREATE TABLE public.site_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text UNIQUE NOT NULL,
  value text NOT NULL DEFAULT '',
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.site_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view site settings" ON public.site_settings
  FOR SELECT TO public USING (true);

CREATE POLICY "Admins can update site settings" ON public.site_settings
  FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can insert site settings" ON public.site_settings
  FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Seed default social links
INSERT INTO public.site_settings (key, value) VALUES
  ('facebook_url', ''),
  ('instagram_url', ''),
  ('tiktok_url', ''),
  ('telegram_url', '');

-- 2. Moderator workflow columns on subscription_requests
ALTER TABLE public.subscription_requests
  ADD COLUMN moderator_id uuid DEFAULT NULL,
  ADD COLUMN moderator_action text DEFAULT NULL,
  ADD COLUMN moderator_action_at timestamptz DEFAULT NULL;

-- 3. Allow moderators to view and update subscription requests
CREATE POLICY "Moderators can view all requests" ON public.subscription_requests
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'moderator'));

CREATE POLICY "Moderators can update requests" ON public.subscription_requests
  FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'moderator'));

-- 4. Allow moderators to view subscriptions (for context)
CREATE POLICY "Admins can view all subscriptions" ON public.subscriptions
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Moderators can view all subscriptions" ON public.subscriptions
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'moderator'));
