
-- ============================================================
-- Advanced Anti-Bot Evasion System: schema
-- ============================================================

-- 1) Bot-detection events (captcha pages, blocks, challenges, anomalies)
CREATE TABLE IF NOT EXISTS public.bot_detection_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  country_code TEXT NOT NULL,
  provider TEXT NOT NULL,
  url TEXT NOT NULL,
  detection_type TEXT NOT NULL, -- 'captcha' | 'block' | 'challenge' | 'rate_limit' | 'anomaly' | 'cloudflare' | 'recaptcha' | 'hcaptcha'
  severity INTEGER NOT NULL DEFAULT 1, -- 1 low .. 5 critical
  blocked_reason TEXT,
  http_status INTEGER,
  proxy_used TEXT,
  fingerprint_used JSONB DEFAULT '{}'::jsonb,
  response_headers JSONB DEFAULT '{}'::jsonb,
  screenshot_path TEXT,
  html_snapshot_path TEXT,
  page_title TEXT,
  page_text_snippet TEXT,
  worker_id TEXT,
  detected_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bot_det_provider_time ON public.bot_detection_events (provider, detected_at DESC);
CREATE INDEX IF NOT EXISTS idx_bot_det_country_time ON public.bot_detection_events (country_code, detected_at DESC);

ALTER TABLE public.bot_detection_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read bot_detection_events" ON public.bot_detection_events
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins write bot_detection_events" ON public.bot_detection_events
  FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

-- 2) Proxy health (per proxy endpoint, per provider)
CREATE TABLE IF NOT EXISTS public.proxy_health (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proxy_label TEXT NOT NULL, -- e.g. session id or host:port
  provider TEXT NOT NULL,    -- 'vfs' | 'tls' | 'bls' | 'global'
  status TEXT NOT NULL DEFAULT 'healthy', -- 'healthy' | 'cooldown' | 'unhealthy'
  cooldown_until TIMESTAMPTZ,
  success_count INTEGER NOT NULL DEFAULT 0,
  failure_count INTEGER NOT NULL DEFAULT 0,
  captcha_count INTEGER NOT NULL DEFAULT 0,
  last_used_at TIMESTAMPTZ,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (proxy_label, provider)
);

ALTER TABLE public.proxy_health ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage proxy_health" ON public.proxy_health
  FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

-- 3) Per-provider rolling risk score
CREATE TABLE IF NOT EXISTS public.provider_risk_scores (
  provider TEXT PRIMARY KEY,
  risk_score NUMERIC NOT NULL DEFAULT 0, -- 0..100
  captcha_rate NUMERIC NOT NULL DEFAULT 0,
  block_rate NUMERIC NOT NULL DEFAULT 0,
  recommended_interval_seconds INTEGER NOT NULL DEFAULT 300,
  throttle_until TIMESTAMPTZ,
  last_event_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.provider_risk_scores ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage provider_risk_scores" ON public.provider_risk_scores
  FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

-- 4) Persistent browser sessions (cookies/localStorage snapshots)
CREATE TABLE IF NOT EXISTS public.browser_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  country_code TEXT NOT NULL,
  provider TEXT NOT NULL,
  storage_state JSONB NOT NULL DEFAULT '{}'::jsonb, -- Playwright storageState
  user_agent TEXT,
  fingerprint JSONB DEFAULT '{}'::jsonb,
  proxy_label TEXT,
  expires_at TIMESTAMPTZ,
  last_used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (country_code, provider, proxy_label)
);

ALTER TABLE public.browser_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage browser_sessions" ON public.browser_sessions
  FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

-- 5) Helper: recompute risk score for a provider (last 1h rolling)
CREATE OR REPLACE FUNCTION public.recompute_provider_risk(_provider TEXT)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total INTEGER;
  v_captcha INTEGER;
  v_block INTEGER;
  v_score NUMERIC;
  v_interval INTEGER;
  v_throttle TIMESTAMPTZ;
BEGIN
  SELECT COUNT(*) INTO v_total
  FROM public.bot_detection_events
  WHERE provider = _provider AND detected_at > now() - INTERVAL '1 hour';

  SELECT COUNT(*) INTO v_captcha
  FROM public.bot_detection_events
  WHERE provider = _provider AND detected_at > now() - INTERVAL '1 hour'
    AND detection_type IN ('captcha','recaptcha','hcaptcha');

  SELECT COUNT(*) INTO v_block
  FROM public.bot_detection_events
  WHERE provider = _provider AND detected_at > now() - INTERVAL '1 hour'
    AND detection_type IN ('block','cloudflare','rate_limit');

  -- weighted score 0..100
  v_score := LEAST(100, COALESCE(v_captcha,0)*8 + COALESCE(v_block,0)*12 + COALESCE(v_total,0)*2);

  v_interval := CASE
    WHEN v_score >= 80 THEN 1800   -- 30 min
    WHEN v_score >= 50 THEN 900    -- 15 min
    WHEN v_score >= 25 THEN 600    -- 10 min
    ELSE 300                       -- 5 min
  END;

  v_throttle := CASE WHEN v_score >= 80 THEN now() + INTERVAL '20 minutes' ELSE NULL END;

  INSERT INTO public.provider_risk_scores (provider, risk_score, captcha_rate, block_rate,
        recommended_interval_seconds, throttle_until, last_event_at, updated_at)
  VALUES (_provider, v_score,
        CASE WHEN v_total>0 THEN v_captcha::numeric/v_total ELSE 0 END,
        CASE WHEN v_total>0 THEN v_block::numeric/v_total ELSE 0 END,
        v_interval, v_throttle, now(), now())
  ON CONFLICT (provider) DO UPDATE SET
    risk_score = EXCLUDED.risk_score,
    captcha_rate = EXCLUDED.captcha_rate,
    block_rate = EXCLUDED.block_rate,
    recommended_interval_seconds = EXCLUDED.recommended_interval_seconds,
    throttle_until = EXCLUDED.throttle_until,
    last_event_at = EXCLUDED.last_event_at,
    updated_at = now();
END;
$$;

-- 6) Storage buckets for evidence (private, admin only via policies on storage.objects)
INSERT INTO storage.buckets (id, name, public) VALUES ('bot-evidence', 'bot-evidence', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Admins read bot-evidence"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'bot-evidence' AND public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins write bot-evidence"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'bot-evidence' AND public.has_role(auth.uid(), 'admin'::app_role));
