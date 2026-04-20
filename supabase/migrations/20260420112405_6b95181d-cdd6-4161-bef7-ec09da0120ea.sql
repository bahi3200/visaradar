-- Enable pg_cron for scheduled jobs
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;

-- Index to make the cleanup (and rate-limit count queries) fast
CREATE INDEX IF NOT EXISTS chat_rate_limits_created_at_idx
  ON public.chat_rate_limits (created_at);

-- Schedule: every hour, delete rate-limit rows older than 24h
-- (Rate-limit window is 1h; 24h gives generous buffer for audits.)
SELECT cron.schedule(
  'cleanup-chat-rate-limits-hourly',
  '0 * * * *',
  $$ DELETE FROM public.chat_rate_limits WHERE created_at < now() - interval '24 hours' $$
);