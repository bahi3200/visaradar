ALTER TABLE public.notification_preferences
ADD COLUMN IF NOT EXISTS preferred_language text NOT NULL DEFAULT 'ar';

ALTER TABLE public.notification_preferences
DROP CONSTRAINT IF EXISTS notification_preferences_preferred_language_check;

ALTER TABLE public.notification_preferences
ADD CONSTRAINT notification_preferences_preferred_language_check
CHECK (preferred_language IN ('ar', 'en'));