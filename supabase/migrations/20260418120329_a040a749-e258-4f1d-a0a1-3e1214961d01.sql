-- Rename any existing social media keys to use public_ prefix so unauthenticated visitors can read them via RLS
UPDATE public.site_settings SET key = 'public_facebook_url'  WHERE key = 'facebook_url';
UPDATE public.site_settings SET key = 'public_instagram_url' WHERE key = 'instagram_url';
UPDATE public.site_settings SET key = 'public_tiktok_url'    WHERE key = 'tiktok_url';
UPDATE public.site_settings SET key = 'public_telegram_url'  WHERE key = 'telegram_url';