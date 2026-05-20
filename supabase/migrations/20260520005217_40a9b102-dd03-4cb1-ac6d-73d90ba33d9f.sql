
ALTER TABLE public.notification_preferences
  ADD COLUMN IF NOT EXISTS digest_frequency text NOT NULL DEFAULT 'instant',
  ADD COLUMN IF NOT EXISTS last_digest_sent_at timestamptz;

ALTER TABLE public.notification_preferences
  DROP CONSTRAINT IF EXISTS notification_preferences_digest_frequency_check;

ALTER TABLE public.notification_preferences
  ADD CONSTRAINT notification_preferences_digest_frequency_check
  CHECK (digest_frequency IN ('instant','daily','weekly'));
