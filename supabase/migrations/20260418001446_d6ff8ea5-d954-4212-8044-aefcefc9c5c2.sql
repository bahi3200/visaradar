INSERT INTO public.site_settings (key, value)
VALUES ('telegram_quick_test_message', 'مرحباً من VisaRadar 👋')
ON CONFLICT (key) DO NOTHING;