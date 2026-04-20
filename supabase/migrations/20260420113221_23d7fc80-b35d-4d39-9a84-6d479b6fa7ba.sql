-- 1. Tighten subscriptions UPDATE policy: telegram_chat_id must match the user's profile
DROP POLICY IF EXISTS "Users can update own subscription telegram only" ON public.subscriptions;

CREATE POLICY "Users can update own subscription telegram only"
ON public.subscriptions
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (
  auth.uid() = user_id
  AND status        = (SELECT s.status        FROM public.subscriptions s WHERE s.id = subscriptions.id)
  AND expires_at    = (SELECT s.expires_at    FROM public.subscriptions s WHERE s.id = subscriptions.id)
  AND starts_at     = (SELECT s.starts_at     FROM public.subscriptions s WHERE s.id = subscriptions.id)
  AND package_id    = (SELECT s.package_id    FROM public.subscriptions s WHERE s.id = subscriptions.id)
  AND service_type  = (SELECT s.service_type  FROM public.subscriptions s WHERE s.id = subscriptions.id)
  AND countries     = (SELECT s.countries     FROM public.subscriptions s WHERE s.id = subscriptions.id)
  AND user_id       = (SELECT s.user_id       FROM public.subscriptions s WHERE s.id = subscriptions.id)
  -- New: telegram_chat_id must either be cleared or match the user's own linked Telegram ID
  AND (
    telegram_chat_id IS NULL
    OR telegram_chat_id = (SELECT p.telegram_id FROM public.profiles p WHERE p.user_id = auth.uid())
  )
);

-- 2. Add owner-scoped UPDATE policy on the receipts storage bucket
-- Receipts are uploaded under <user_id>/<filename>, so foldername[1] = owner's uid
CREATE POLICY "Users can update own receipts"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'receipts'
  AND auth.uid()::text = (storage.foldername(name))[1]
)
WITH CHECK (
  bucket_id = 'receipts'
  AND auth.uid()::text = (storage.foldername(name))[1]
);