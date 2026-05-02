ALTER TABLE public.telegram_link_log
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'success',
  ADD COLUMN IF NOT EXISTS error_message text,
  ADD COLUMN IF NOT EXISTS source text;

ALTER TABLE public.telegram_link_log ALTER COLUMN chat_id DROP NOT NULL;

CREATE INDEX IF NOT EXISTS idx_telegram_link_log_status_created
  ON public.telegram_link_log (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_telegram_link_log_user_created
  ON public.telegram_link_log (user_id, created_at DESC);