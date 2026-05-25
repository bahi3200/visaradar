-- Human session profiles
CREATE TABLE public.human_session_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  mouse_speed_min INT NOT NULL DEFAULT 400,
  mouse_speed_max INT NOT NULL DEFAULT 1200,
  scroll_pattern TEXT NOT NULL DEFAULT 'natural' CHECK (scroll_pattern IN ('natural','fast','slow','reader')),
  idle_avg_ms INT NOT NULL DEFAULT 2500,
  idle_jitter_ms INT NOT NULL DEFAULT 1500,
  navigation_style TEXT NOT NULL DEFAULT 'organic' CHECK (navigation_style IN ('organic','direct','explorer')),
  visit_homepage_prob NUMERIC(3,2) NOT NULL DEFAULT 0.35,
  hover_prob NUMERIC(3,2) NOT NULL DEFAULT 0.60,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.human_session_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage human_session_profiles" ON public.human_session_profiles
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin'));

-- Seed defaults
INSERT INTO public.human_session_profiles (name, scroll_pattern, navigation_style, idle_avg_ms, visit_homepage_prob)
VALUES
  ('default-organic', 'natural', 'organic', 2500, 0.35),
  ('reader-slow',     'reader',  'explorer', 4200, 0.55),
  ('fast-direct',     'fast',    'direct',   1200, 0.10);

-- Provider cooldown state
CREATE TABLE public.provider_cooldown_state (
  provider TEXT PRIMARY KEY,
  cooldown_until TIMESTAMPTZ,
  reason TEXT,
  captcha_count_5m INT NOT NULL DEFAULT 0,
  block_count_5m INT NOT NULL DEFAULT 0,
  escalation_level INT NOT NULL DEFAULT 0,
  last_event_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.provider_cooldown_state ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read cooldown" ON public.provider_cooldown_state
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));

-- Fingerprint success log
CREATE TABLE public.fingerprint_success_log (
  id BIGSERIAL PRIMARY KEY,
  stealth_profile_id UUID REFERENCES public.stealth_profiles(id) ON DELETE SET NULL,
  human_profile_id UUID REFERENCES public.human_session_profiles(id) ON DELETE SET NULL,
  provider TEXT NOT NULL,
  country_code TEXT,
  proxy_label TEXT,
  success BOOLEAN NOT NULL,
  captcha_seen BOOLEAN NOT NULL DEFAULT false,
  cloudflare_seen BOOLEAN NOT NULL DEFAULT false,
  duration_ms INT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_fp_log_provider_time ON public.fingerprint_success_log (provider, created_at DESC);
CREATE INDEX idx_fp_log_profile ON public.fingerprint_success_log (stealth_profile_id, created_at DESC);

ALTER TABLE public.fingerprint_success_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read fingerprint log" ON public.fingerprint_success_log
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));

-- Record captcha/block event and escalate cooldown
CREATE OR REPLACE FUNCTION public.record_captcha_event(
  _provider TEXT,
  _country TEXT DEFAULT NULL,
  _kind TEXT DEFAULT 'captcha'
) RETURNS TIMESTAMPTZ
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_level INT;
  v_minutes INT;
  v_until TIMESTAMPTZ;
BEGIN
  INSERT INTO public.provider_cooldown_state (provider, captcha_count_5m, block_count_5m, last_event_at, reason)
  VALUES (_provider,
    CASE WHEN _kind IN ('captcha','cloudflare') THEN 1 ELSE 0 END,
    CASE WHEN _kind = 'block' THEN 1 ELSE 0 END,
    now(), _kind)
  ON CONFLICT (provider) DO UPDATE
    SET captcha_count_5m = CASE WHEN provider_cooldown_state.last_event_at < now() - interval '5 minutes' THEN 0 ELSE provider_cooldown_state.captcha_count_5m END
                         + CASE WHEN _kind IN ('captcha','cloudflare') THEN 1 ELSE 0 END,
        block_count_5m = CASE WHEN provider_cooldown_state.last_event_at < now() - interval '5 minutes' THEN 0 ELSE provider_cooldown_state.block_count_5m END
                       + CASE WHEN _kind = 'block' THEN 1 ELSE 0 END,
        last_event_at = now(),
        reason = _kind,
        escalation_level = LEAST(4, provider_cooldown_state.escalation_level + 1),
        updated_at = now()
  RETURNING escalation_level INTO v_level;

  v_minutes := CASE v_level WHEN 1 THEN 5 WHEN 2 THEN 10 WHEN 3 THEN 20 ELSE 40 END;
  v_until := now() + make_interval(mins => v_minutes);

  UPDATE public.provider_cooldown_state
     SET cooldown_until = v_until
   WHERE provider = _provider;

  -- Also bump existing throttle so scanners respect it
  INSERT INTO public.provider_throttle (provider, consecutive_blocks, current_backoff_minutes, cooldown_until, last_reason, last_block_at)
  VALUES (_provider, 1, v_minutes, v_until, _kind, now())
  ON CONFLICT (provider) DO UPDATE
    SET cooldown_until = GREATEST(provider_throttle.cooldown_until, v_until),
        current_backoff_minutes = v_minutes,
        last_reason = _kind,
        last_block_at = now(),
        updated_at = now();

  RETURN v_until;
END;
$$;

-- Bot detection dashboard aggregated stats
CREATE OR REPLACE FUNCTION public.get_bot_detection_dashboard(_hours INT DEFAULT 24)
RETURNS TABLE(
  provider TEXT,
  total_requests BIGINT,
  captcha_rate NUMERIC,
  block_rate NUMERIC,
  cloudflare_rate NUMERIC,
  success_rate NUMERIC,
  fingerprint_success_rate NUMERIC,
  risk_score NUMERIC,
  cooldown_until TIMESTAMPTZ,
  escalation_level INT
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  WITH m AS (
    SELECT provider, outcome, cloudflare_detected
    FROM public.stealth_metrics
    WHERE created_at > now() - make_interval(hours => _hours)
  ),
  agg AS (
    SELECT provider,
      COUNT(*) AS total,
      COUNT(*) FILTER (WHERE outcome='captcha') AS cap,
      COUNT(*) FILTER (WHERE outcome='block') AS blk,
      COUNT(*) FILTER (WHERE outcome='cloudflare' OR cloudflare_detected) AS cf,
      COUNT(*) FILTER (WHERE outcome='success') AS ok
    FROM m GROUP BY provider
  ),
  fp AS (
    SELECT provider,
      CASE WHEN COUNT(*)>0 THEN ROUND(100.0*COUNT(*) FILTER (WHERE success)/COUNT(*),2) ELSE NULL END AS fp_rate
    FROM public.fingerprint_success_log
    WHERE created_at > now() - make_interval(hours => _hours)
    GROUP BY provider
  )
  SELECT
    a.provider,
    a.total,
    CASE WHEN a.total>0 THEN ROUND(100.0*a.cap/a.total,2) ELSE 0 END,
    CASE WHEN a.total>0 THEN ROUND(100.0*a.blk/a.total,2) ELSE 0 END,
    CASE WHEN a.total>0 THEN ROUND(100.0*a.cf/a.total,2) ELSE 0 END,
    CASE WHEN a.total>0 THEN ROUND(100.0*a.ok/a.total,2) ELSE 0 END,
    COALESCE(fp.fp_rate, NULL),
    COALESCE((SELECT risk_score FROM public.provider_risk_scores WHERE provider=a.provider), 0),
    (SELECT cooldown_until FROM public.provider_cooldown_state WHERE provider=a.provider),
    COALESCE((SELECT escalation_level FROM public.provider_cooldown_state WHERE provider=a.provider), 0)
  FROM agg a LEFT JOIN fp ON fp.provider = a.provider
  ORDER BY a.total DESC;
$$;

CREATE TRIGGER trg_human_profiles_updated_at
  BEFORE UPDATE ON public.human_session_profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();