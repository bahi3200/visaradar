INSERT INTO public.site_settings (key, value)
VALUES ('expiry_reminder_days', '7,3,1')
ON CONFLICT (key) DO NOTHING;