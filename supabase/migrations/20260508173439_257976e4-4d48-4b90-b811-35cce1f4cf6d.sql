
-- 1) Dedup table for failure alerts
CREATE TABLE IF NOT EXISTS public.telegram_failure_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  failure_count integer NOT NULL,
  window_minutes integer NOT NULL,
  threshold integer NOT NULL,
  alerted_at timestamptz NOT NULL DEFAULT now(),
  notified_admin_count integer NOT NULL DEFAULT 0,
  last_error text
);

CREATE INDEX IF NOT EXISTS telegram_failure_alerts_user_time_idx
  ON public.telegram_failure_alerts (user_id, alerted_at DESC);

ALTER TABLE public.telegram_failure_alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins view failure alerts"
  ON public.telegram_failure_alerts FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Service role full access failure alerts"
  ON public.telegram_failure_alerts FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

-- 2) Default settings (idempotent)
INSERT INTO public.site_settings (key, value)
VALUES
  ('telegram_failure_alert_enabled', 'true'),
  ('telegram_failure_alert_threshold', '3'),
  ('telegram_failure_alert_window_minutes', '30'),
  ('telegram_failure_alert_cooldown_minutes', '60')
ON CONFLICT (key) DO NOTHING;

-- 3) Trigger function: on failed log insert, count recent failures and call edge fn
CREATE OR REPLACE FUNCTION public.trigger_telegram_failure_alert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_enabled text;
  v_threshold int;
  v_window int;
  v_cooldown int;
  v_count int;
  v_recent_alert timestamptz;
  v_url text;
  v_anon text;
BEGIN
  IF NEW.status <> 'failed' THEN
    RETURN NEW;
  END IF;

  SELECT value INTO v_enabled FROM public.site_settings WHERE key = 'telegram_failure_alert_enabled';
  IF COALESCE(v_enabled, 'true') <> 'true' THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE((SELECT value FROM public.site_settings WHERE key='telegram_failure_alert_threshold'), '3')::int INTO v_threshold;
  SELECT COALESCE((SELECT value FROM public.site_settings WHERE key='telegram_failure_alert_window_minutes'), '30')::int INTO v_window;
  SELECT COALESCE((SELECT value FROM public.site_settings WHERE key='telegram_failure_alert_cooldown_minutes'), '60')::int INTO v_cooldown;

  SELECT COUNT(*) INTO v_count
  FROM public.telegram_link_log
  WHERE user_id = NEW.user_id
    AND status = 'failed'
    AND created_at >= now() - make_interval(mins => v_window);

  IF v_count < v_threshold THEN
    RETURN NEW;
  END IF;

  -- Cooldown: skip if we already alerted recently for this user
  SELECT alerted_at INTO v_recent_alert
  FROM public.telegram_failure_alerts
  WHERE user_id = NEW.user_id
    AND alerted_at >= now() - make_interval(mins => v_cooldown)
  ORDER BY alerted_at DESC
  LIMIT 1;

  IF v_recent_alert IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- Fire-and-forget call to edge function via pg_net
  v_url := 'https://frhrvkzkihxaopnsznrj.supabase.co/functions/v1/notify-telegram-failure-spike';
  v_anon := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZyaHJ2a3praWh4YW9wbnN6bnJqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY0NzE0OTYsImV4cCI6MjA5MjA0NzQ5Nn0.lNR_XeuQCxWgSvm6GlHJf0oTFtyBiCHy43_aIrFrSgc';

  PERFORM extensions.http_post(
    url := v_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_anon
    ),
    body := jsonb_build_object(
      'user_id', NEW.user_id,
      'failure_count', v_count,
      'threshold', v_threshold,
      'window_minutes', v_window,
      'last_error', NEW.error_message,
      'last_action', NEW.action,
      'last_chat_id', NEW.chat_id
    )
  );

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Never block the original insert on alerting failure
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS telegram_link_log_failure_alert ON public.telegram_link_log;
CREATE TRIGGER telegram_link_log_failure_alert
AFTER INSERT ON public.telegram_link_log
FOR EACH ROW
EXECUTE FUNCTION public.trigger_telegram_failure_alert();
