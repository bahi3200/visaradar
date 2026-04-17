CREATE TABLE IF NOT EXISTS public.expiry_reminder_log (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  subscription_id UUID NOT NULL,
  package_name TEXT,
  recipient_name TEXT,
  recipient_email TEXT,
  telegram_chat_id TEXT,
  milestone_days INTEGER NOT NULL,
  days_left INTEGER NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  email_status TEXT NOT NULL DEFAULT 'skipped',
  email_error TEXT,
  telegram_status TEXT NOT NULL DEFAULT 'skipped',
  telegram_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_exp_reminder_subscription ON public.expiry_reminder_log (subscription_id, milestone_days);
CREATE INDEX IF NOT EXISTS idx_exp_reminder_created ON public.expiry_reminder_log (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_exp_reminder_user ON public.expiry_reminder_log (user_id);

ALTER TABLE public.expiry_reminder_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view reminder log"
  ON public.expiry_reminder_log
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));