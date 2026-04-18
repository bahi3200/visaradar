UPDATE public.profiles p
SET full_name = COALESCE(
  NULLIF(TRIM(u.raw_user_meta_data->>'full_name'), ''),
  NULLIF(TRIM(u.raw_user_meta_data->>'name'), ''),
  SPLIT_PART(u.email, '@', 1)
),
updated_at = now()
FROM auth.users u
WHERE p.user_id = u.id
  AND (p.full_name IS NULL OR TRIM(p.full_name) = '');