
CREATE TABLE public.ban_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  country_code TEXT NOT NULL,
  provider TEXT NOT NULL,
  reason TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'medium',
  http_status INT,
  retry_after_seconds INT,
  snippet TEXT,
  source_url TEXT,
  worker_id UUID,
  detected_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_ban_events_recent ON public.ban_events (detected_at DESC);
CREATE INDEX idx_ban_events_provider ON public.ban_events (provider, detected_at DESC);
ALTER TABLE public.ban_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins view ban_events" ON public.ban_events FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Service writes ban_events" ON public.ban_events FOR INSERT TO authenticated WITH CHECK (true);

CREATE TABLE public.provider_throttle (
  provider TEXT PRIMARY KEY,
  consecutive_blocks INT NOT NULL DEFAULT 0,
  current_backoff_minutes INT NOT NULL DEFAULT 0,
  cooldown_until TIMESTAMPTZ,
  last_reason TEXT,
  last_block_at TIMESTAMPTZ,
  last_success_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.provider_throttle ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read provider_throttle" ON public.provider_throttle FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins update provider_throttle" ON public.provider_throttle FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Service insert provider_throttle" ON public.provider_throttle FOR INSERT TO authenticated WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.record_ban_event(
  _country TEXT, _provider TEXT, _reason TEXT, _severity TEXT,
  _http_status INT, _retry_after INT, _snippet TEXT, _source_url TEXT
) RETURNS TIMESTAMPTZ
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_next_backoff INT;
  v_cooldown TIMESTAMPTZ;
  v_consec INT;
BEGIN
  INSERT INTO public.ban_events (country_code, provider, reason, severity, http_status, retry_after_seconds, snippet, source_url)
  VALUES (_country, _provider, _reason, _severity, _http_status, _retry_after, LEFT(COALESCE(_snippet, ''), 500), _source_url);

  -- escalating backoff: 5 → 15 → 30 → 60 → 120 → 240 (capped)
  INSERT INTO public.provider_throttle (provider, consecutive_blocks, current_backoff_minutes, cooldown_until, last_reason, last_block_at)
  VALUES (_provider, 1, 5, now() + interval '5 minutes', _reason, now())
  ON CONFLICT (provider) DO UPDATE
    SET consecutive_blocks = provider_throttle.consecutive_blocks + 1,
        current_backoff_minutes = LEAST(240, GREATEST(5, provider_throttle.current_backoff_minutes * 2)),
        cooldown_until = now() + make_interval(mins => LEAST(240, GREATEST(5, provider_throttle.current_backoff_minutes * 2))),
        last_reason = EXCLUDED.last_reason,
        last_block_at = now(),
        updated_at = now()
  RETURNING cooldown_until INTO v_cooldown;

  -- If retry-after was provided, respect it as a minimum
  IF _retry_after IS NOT NULL AND _retry_after > 0 THEN
    UPDATE public.provider_throttle
       SET cooldown_until = GREATEST(cooldown_until, now() + make_interval(secs => _retry_after))
     WHERE provider = _provider
    RETURNING cooldown_until INTO v_cooldown;
  END IF;

  RETURN v_cooldown;
END;
$$;

CREATE OR REPLACE FUNCTION public.record_provider_success(_provider TEXT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.provider_throttle (provider, consecutive_blocks, current_backoff_minutes, cooldown_until, last_success_at)
  VALUES (_provider, 0, 0, NULL, now())
  ON CONFLICT (provider) DO UPDATE
    SET consecutive_blocks = 0,
        current_backoff_minutes = 0,
        cooldown_until = NULL,
        last_success_at = now(),
        updated_at = now();
END;
$$;
