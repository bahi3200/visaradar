DELETE FROM public.site_settings
WHERE key IN (
  'public_facebook_url',
  'public_instagram_url',
  'public_tiktok_url',
  'public_telegram_url'
);