-- 1) stealth_profiles: rotatable browser fingerprints
CREATE TABLE public.stealth_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  user_agent text NOT NULL,
  viewport jsonb NOT NULL DEFAULT '{"width":1366,"height":768}'::jsonb,
  gpu_vendor text,
  gpu_renderer text,
  fonts text[] NOT NULL DEFAULT '{}',
  screen_resolution jsonb NOT NULL DEFAULT '{"width":1366,"height":768}'::jsonb,
  hardware_concurrency int NOT NULL DEFAULT 8,
  device_memory int NOT NULL DEFAULT 8,
  languages text[] NOT NULL DEFAULT '{en-US,en}',
  timezone text NOT NULL DEFAULT 'Europe/Paris',
  locale text NOT NULL DEFAULT 'en-US',
  media_devices jsonb NOT NULL DEFAULT '[]'::jsonb,
  platform text NOT NULL DEFAULT 'Win32',
  is_active boolean NOT NULL DEFAULT true,
  is_mobile boolean NOT NULL DEFAULT false,
  last_used_at timestamptz,
  success_count int NOT NULL DEFAULT 0,
  failure_count int NOT NULL DEFAULT 0,
  captcha_count int NOT NULL DEFAULT 0,
  block_count int NOT NULL DEFAULT 0,
  score numeric NOT NULL DEFAULT 100,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_stealth_profiles_active_score ON public.stealth_profiles (is_active, score DESC);
ALTER TABLE public.stealth_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage stealth_profiles" ON public.stealth_profiles FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Service role full access stealth_profiles" ON public.stealth_profiles FOR ALL TO service_role
  USING (true) WITH CHECK (true);
CREATE TRIGGER trg_stealth_profiles_updated_at BEFORE UPDATE ON public.stealth_profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2) browser_profiles: persistent sessions per (provider, country, proxy)
CREATE TABLE public.browser_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL,
  country_code text NOT NULL,
  proxy_label text,
  stealth_profile_id uuid REFERENCES public.stealth_profiles(id) ON DELETE SET NULL,
  storage_state_path text,
  cookies jsonb NOT NULL DEFAULT '[]'::jsonb,
  history jsonb NOT NULL DEFAULT '[]'::jsonb,
  visits_count int NOT NULL DEFAULT 0,
  healthy boolean NOT NULL DEFAULT true,
  last_visit_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider, country_code, proxy_label)
);
CREATE INDEX idx_browser_profiles_lookup ON public.browser_profiles (provider, country_code, healthy);
ALTER TABLE public.browser_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage browser_profiles" ON public.browser_profiles FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Service role full access browser_profiles" ON public.browser_profiles FOR ALL TO service_role
  USING (true) WITH CHECK (true);
CREATE TRIGGER trg_browser_profiles_updated_at BEFORE UPDATE ON public.browser_profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3) proxy_quarantine: temporary proxy isolation
CREATE TABLE public.proxy_quarantine (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  proxy_label text NOT NULL,
  provider text,
  country_code text,
  reason text NOT NULL,
  captcha_count int NOT NULL DEFAULT 0,
  block_count int NOT NULL DEFAULT 0,
  quarantined_at timestamptz NOT NULL DEFAULT now(),
  quarantined_until timestamptz NOT NULL,
  released_at timestamptz,
  released_by uuid,
  notes text
);
CREATE INDEX idx_proxy_quarantine_active ON public.proxy_quarantine (proxy_label, provider, quarantined_until)
  WHERE released_at IS NULL;
ALTER TABLE public.proxy_quarantine ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage proxy_quarantine" ON public.proxy_quarantine FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Service role full access proxy_quarantine" ON public.proxy_quarantine FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- 4) stealth_metrics: per-scan outcome
CREATE TABLE public.stealth_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL,
  country_code text NOT NULL,
  stealth_profile_id uuid REFERENCES public.stealth_profiles(id) ON DELETE SET NULL,
  proxy_label text,
  headful boolean NOT NULL DEFAULT false,
  outcome text NOT NULL CHECK (outcome IN ('success','captcha','block','cloudflare','error','timeout')),
  duration_ms int,
  http_status int,
  cloudflare_detected boolean NOT NULL DEFAULT false,
  fingerprint_rotated boolean NOT NULL DEFAULT false,
  retry_count int NOT NULL DEFAULT 0,
  error text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_stealth_metrics_recent ON public.stealth_metrics (created_at DESC);
CREATE INDEX idx_stealth_metrics_provider ON public.stealth_metrics (provider, country_code, created_at DESC);
CREATE INDEX idx_stealth_metrics_proxy ON public.stealth_metrics (proxy_label, created_at DESC);
ALTER TABLE public.stealth_metrics ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read stealth_metrics" ON public.stealth_metrics FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Service role full access stealth_metrics" ON public.stealth_metrics FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- 5) provider_timing_profiles
CREATE TABLE public.provider_timing_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL UNIQUE,
  min_interval_s int NOT NULL DEFAULT 20,
  max_interval_s int NOT NULL DEFAULT 90,
  jitter_pct int NOT NULL DEFAULT 35 CHECK (jitter_pct BETWEEN 0 AND 80),
  min_idle_ms int NOT NULL DEFAULT 200,
  max_idle_ms int NOT NULL DEFAULT 4000,
  scroll_speed text NOT NULL DEFAULT 'medium' CHECK (scroll_speed IN ('slow','medium','fast')),
  mouse_speed text NOT NULL DEFAULT 'medium' CHECK (mouse_speed IN ('slow','medium','fast')),
  headful_only boolean NOT NULL DEFAULT false,
  visit_homepage_prob numeric NOT NULL DEFAULT 0.4 CHECK (visit_homepage_prob BETWEEN 0 AND 1),
  max_hops int NOT NULL DEFAULT 3,
  is_active boolean NOT NULL DEFAULT true,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.provider_timing_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage provider_timing_profiles" ON public.provider_timing_profiles FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Authenticated read provider_timing_profiles" ON public.provider_timing_profiles FOR SELECT TO authenticated
  USING (true);
CREATE POLICY "Service role full access provider_timing_profiles" ON public.provider_timing_profiles FOR ALL TO service_role
  USING (true) WITH CHECK (true);
CREATE TRIGGER trg_provider_timing_profiles_updated_at BEFORE UPDATE ON public.provider_timing_profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Seed timing profiles for known providers
INSERT INTO public.provider_timing_profiles (provider, min_interval_s, max_interval_s, jitter_pct, headful_only, notes)
VALUES
  ('vfs',  30, 120, 40, false, 'Default tightened for VFS'),
  ('tls',  45, 180, 50, true,  'TLS aggressive detection — headful only'),
  ('bls',  25, 90,  35, false, 'Default for BLS')
ON CONFLICT (provider) DO NOTHING;

-- 6) should_quarantine_proxy
CREATE OR REPLACE FUNCTION public.should_quarantine_proxy(_proxy_label text, _provider text)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_cap int; v_blk int; v_total int;
BEGIN
  SELECT
    COUNT(*) FILTER (WHERE outcome IN ('captcha','cloudflare')),
    COUNT(*) FILTER (WHERE outcome = 'block'),
    COUNT(*)
  INTO v_cap, v_blk, v_total
  FROM public.stealth_metrics
  WHERE proxy_label = _proxy_label
    AND (_provider IS NULL OR provider = _provider)
    AND created_at > now() - interval '30 minutes';

  IF v_total < 5 THEN RETURN false; END IF;
  RETURN (v_cap::numeric / v_total) > 0.4 OR v_blk >= 3;
END;
$$;

-- 7) record_stealth_metric (called from edge function)
CREATE OR REPLACE FUNCTION public.record_stealth_metric(
  _provider text, _country text, _profile_id uuid, _proxy_label text,
  _headful boolean, _outcome text, _duration_ms int, _http_status int,
  _cloudflare boolean, _fingerprint_rotated boolean, _retry_count int,
  _error text, _metadata jsonb
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_id uuid; v_should_quarantine boolean;
BEGIN
  INSERT INTO public.stealth_metrics
    (provider, country_code, stealth_profile_id, proxy_label, headful, outcome,
     duration_ms, http_status, cloudflare_detected, fingerprint_rotated, retry_count, error, metadata)
  VALUES
    (_provider, _country, _profile_id, _proxy_label, COALESCE(_headful,false), _outcome,
     _duration_ms, _http_status, COALESCE(_cloudflare,false), COALESCE(_fingerprint_rotated,false),
     COALESCE(_retry_count,0), _error, COALESCE(_metadata, '{}'::jsonb))
  RETURNING id INTO v_id;

  -- Update stealth_profile counters
  IF _profile_id IS NOT NULL THEN
    UPDATE public.stealth_profiles
       SET last_used_at = now(),
           success_count = success_count + CASE WHEN _outcome = 'success' THEN 1 ELSE 0 END,
           failure_count = failure_count + CASE WHEN _outcome IN ('error','timeout','block') THEN 1 ELSE 0 END,
           captcha_count = captcha_count + CASE WHEN _outcome IN ('captcha','cloudflare') THEN 1 ELSE 0 END,
           block_count   = block_count   + CASE WHEN _outcome = 'block' THEN 1 ELSE 0 END,
           score = GREATEST(0, LEAST(100,
             CASE WHEN (success_count + failure_count + captcha_count + block_count + 1) > 0
                  THEN 100.0 * (success_count + CASE WHEN _outcome='success' THEN 1 ELSE 0 END)
                       / (success_count + failure_count + captcha_count + block_count + 1)
                       - 8.0  * (captcha_count + CASE WHEN _outcome IN ('captcha','cloudflare') THEN 1 ELSE 0 END)
                       - 12.0 * (block_count   + CASE WHEN _outcome='block' THEN 1 ELSE 0 END)
                  ELSE score END
           ))
     WHERE id = _profile_id;
  END IF;

  -- Auto-quarantine proxy if it triggers the rule
  IF _proxy_label IS NOT NULL AND _outcome IN ('captcha','cloudflare','block') THEN
    SELECT public.should_quarantine_proxy(_proxy_label, _provider) INTO v_should_quarantine;
    IF v_should_quarantine THEN
      INSERT INTO public.proxy_quarantine
        (proxy_label, provider, country_code, reason, captcha_count, block_count,
         quarantined_until)
      VALUES
        (_proxy_label, _provider, _country,
         format('Auto: outcome=%s captcha_rate>40%% in last 30min', _outcome),
         CASE WHEN _outcome IN ('captcha','cloudflare') THEN 1 ELSE 0 END,
         CASE WHEN _outcome = 'block' THEN 1 ELSE 0 END,
         now() + interval '45 minutes')
      ON CONFLICT DO NOTHING;
    END IF;
  END IF;

  RETURN v_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.record_stealth_metric(text,text,uuid,text,boolean,text,int,int,boolean,boolean,int,text,jsonb) FROM PUBLIC, authenticated;

-- 8) Dashboard stats function
CREATE OR REPLACE FUNCTION public.get_stealth_dashboard_stats(_hours int DEFAULT 24)
RETURNS TABLE(
  total_requests bigint,
  success_count bigint,
  captcha_count bigint,
  block_count bigint,
  cloudflare_count bigint,
  captcha_rate numeric,
  block_rate numeric,
  success_rate numeric,
  active_profiles int,
  quarantined_proxies int,
  high_risk_providers int
)
LANGUAGE sql
STABLE SECURITY INVOKER
SET search_path = public
AS $$
  WITH m AS (
    SELECT * FROM public.stealth_metrics
    WHERE created_at > now() - make_interval(hours => _hours)
  )
  SELECT
    (SELECT COUNT(*) FROM m),
    (SELECT COUNT(*) FROM m WHERE outcome='success'),
    (SELECT COUNT(*) FROM m WHERE outcome='captcha'),
    (SELECT COUNT(*) FROM m WHERE outcome='block'),
    (SELECT COUNT(*) FROM m WHERE outcome='cloudflare' OR cloudflare_detected),
    (SELECT CASE WHEN COUNT(*) > 0 THEN ROUND(100.0 * COUNT(*) FILTER (WHERE outcome='captcha') / COUNT(*), 2) ELSE 0 END FROM m),
    (SELECT CASE WHEN COUNT(*) > 0 THEN ROUND(100.0 * COUNT(*) FILTER (WHERE outcome='block')   / COUNT(*), 2) ELSE 0 END FROM m),
    (SELECT CASE WHEN COUNT(*) > 0 THEN ROUND(100.0 * COUNT(*) FILTER (WHERE outcome='success') / COUNT(*), 2) ELSE 0 END FROM m),
    (SELECT COUNT(*)::int FROM public.stealth_profiles WHERE is_active),
    (SELECT COUNT(*)::int FROM public.proxy_quarantine WHERE released_at IS NULL AND quarantined_until > now()),
    (SELECT COUNT(DISTINCT provider)::int FROM public.provider_risk_scores WHERE risk_score >= 50);
$$;