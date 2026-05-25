
-- =========================================================
-- Human Verification Gateway (HVG)
-- =========================================================

-- 1) provider_sessions: live sessions per (provider, country, user)
CREATE TABLE public.provider_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  country_code TEXT NOT NULL,
  fingerprint_hash TEXT,
  user_agent TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','active','expired','revoked','quarantined')),
  health_score NUMERIC NOT NULL DEFAULT 50 CHECK (health_score BETWEEN 0 AND 100),
  success_count INT NOT NULL DEFAULT 0,
  captcha_count INT NOT NULL DEFAULT 0,
  block_count INT NOT NULL DEFAULT 0,
  last_validated_at TIMESTAMPTZ,
  last_used_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_provider_sessions_lookup ON public.provider_sessions(provider, country_code, status, health_score DESC);
CREATE INDEX idx_provider_sessions_user ON public.provider_sessions(user_id);

ALTER TABLE public.provider_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view own sessions" ON public.provider_sessions
  FOR SELECT USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins manage sessions" ON public.provider_sessions
  FOR ALL USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_provider_sessions_updated
  BEFORE UPDATE ON public.provider_sessions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2) session_cookie_vault: cookies linked to a session
CREATE TABLE public.session_cookie_vault (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES public.provider_sessions(id) ON DELETE CASCADE,
  cookies JSONB NOT NULL DEFAULT '[]'::jsonb,
  local_storage JSONB DEFAULT '{}'::jsonb,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_cookie_vault_session ON public.session_cookie_vault(session_id);

ALTER TABLE public.session_cookie_vault ENABLE ROW LEVEL SECURITY;
-- Cookies are sensitive: only admins can read directly; workers use service_role
CREATE POLICY "Admins view cookies" ON public.session_cookie_vault
  FOR SELECT USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins manage cookies" ON public.session_cookie_vault
  FOR ALL USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_cookie_vault_updated
  BEFORE UPDATE ON public.session_cookie_vault
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3) challenge_sessions: pending human verifications
CREATE TABLE public.challenge_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES public.provider_sessions(id) ON DELETE SET NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  country_code TEXT NOT NULL,
  challenge_type TEXT NOT NULL CHECK (challenge_type IN ('captcha','cloudflare','rate_limit','login','unknown')),
  deep_link_token TEXT NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(24), 'base64'),
  target_url TEXT,
  http_status INT,
  snippet TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','notified','resolved','expired','cancelled')),
  priority SMALLINT NOT NULL DEFAULT 5,
  telegram_sent_at TIMESTAMPTZ,
  resolved_at TIMESTAMPTZ,
  resolved_by UUID REFERENCES auth.users(id),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '30 minutes'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_challenge_sessions_pending ON public.challenge_sessions(status, priority, created_at) WHERE status IN ('pending','notified');
CREATE INDEX idx_challenge_sessions_provider ON public.challenge_sessions(provider, country_code, status);

ALTER TABLE public.challenge_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view own challenges" ON public.challenge_sessions
  FOR SELECT USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins manage challenges" ON public.challenge_sessions
  FOR ALL USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_challenge_sessions_updated
  BEFORE UPDATE ON public.challenge_sessions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 4) session_health_log: outcome log per session use
CREATE TABLE public.session_health_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES public.provider_sessions(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  country_code TEXT,
  outcome TEXT NOT NULL CHECK (outcome IN ('success','captcha','cloudflare','block','timeout','error')),
  http_status INT,
  duration_ms INT,
  worker_id TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_session_health_log_session ON public.session_health_log(session_id, created_at DESC);
CREATE INDEX idx_session_health_log_provider ON public.session_health_log(provider, created_at DESC);

ALTER TABLE public.session_health_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins view health log" ON public.session_health_log
  FOR SELECT USING (public.has_role(auth.uid(), 'admin'));

-- =========================================================
-- Functions
-- =========================================================

-- Create a challenge (called by workers via service_role, or admins)
CREATE OR REPLACE FUNCTION public.hvg_create_challenge(
  _provider TEXT,
  _country TEXT,
  _challenge_type TEXT,
  _user_id UUID DEFAULT NULL,
  _session_id UUID DEFAULT NULL,
  _target_url TEXT DEFAULT NULL,
  _http_status INT DEFAULT NULL,
  _snippet TEXT DEFAULT NULL,
  _priority SMALLINT DEFAULT 5
) RETURNS TABLE(id UUID, deep_link_token TEXT, expires_at TIMESTAMPTZ)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id UUID; v_token TEXT; v_expires TIMESTAMPTZ;
BEGIN
  -- Deduplicate: if a pending challenge already exists for same (provider,country,user) reuse it
  SELECT cs.id, cs.deep_link_token, cs.expires_at INTO v_id, v_token, v_expires
  FROM public.challenge_sessions cs
  WHERE cs.provider = _provider
    AND cs.country_code = _country
    AND COALESCE(cs.user_id::text,'') = COALESCE(_user_id::text,'')
    AND cs.status IN ('pending','notified')
    AND cs.expires_at > now()
  ORDER BY cs.created_at DESC LIMIT 1;

  IF v_id IS NULL THEN
    INSERT INTO public.challenge_sessions
      (session_id, user_id, provider, country_code, challenge_type, target_url, http_status, snippet, priority)
    VALUES
      (_session_id, _user_id, _provider, _country, _challenge_type, _target_url, _http_status, LEFT(COALESCE(_snippet,''), 500), _priority)
    RETURNING challenge_sessions.id, challenge_sessions.deep_link_token, challenge_sessions.expires_at
    INTO v_id, v_token, v_expires;

    -- Quarantine matching session(s) so workers stop using them
    IF _session_id IS NOT NULL THEN
      UPDATE public.provider_sessions SET status='quarantined', updated_at=now()
      WHERE id = _session_id;
    END IF;
  END IF;

  RETURN QUERY SELECT v_id, v_token, v_expires;
END $$;

-- Resolve a challenge: store cookies and reactivate/create session
CREATE OR REPLACE FUNCTION public.hvg_resolve_challenge(
  _token TEXT,
  _cookies JSONB,
  _local_storage JSONB DEFAULT '{}'::jsonb,
  _user_agent TEXT DEFAULT NULL,
  _fingerprint_hash TEXT DEFAULT NULL,
  _ttl_minutes INT DEFAULT 240
) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_challenge RECORD;
  v_session_id UUID;
BEGIN
  SELECT * INTO v_challenge FROM public.challenge_sessions
  WHERE deep_link_token = _token AND status IN ('pending','notified') AND expires_at > now()
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Challenge not found or expired';
  END IF;

  -- Ensure caller is the assigned user or admin (service_role bypasses RLS but not this check via auth.uid())
  IF auth.uid() IS NOT NULL
     AND v_challenge.user_id IS NOT NULL
     AND v_challenge.user_id <> auth.uid()
     AND NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Not authorized for this challenge';
  END IF;

  -- Reuse linked session or create a new one
  v_session_id := v_challenge.session_id;
  IF v_session_id IS NULL THEN
    INSERT INTO public.provider_sessions
      (user_id, provider, country_code, fingerprint_hash, user_agent, status, last_validated_at, expires_at)
    VALUES
      (v_challenge.user_id, v_challenge.provider, v_challenge.country_code,
       _fingerprint_hash, _user_agent, 'active', now(), now() + make_interval(mins => _ttl_minutes))
    RETURNING id INTO v_session_id;
  ELSE
    UPDATE public.provider_sessions
       SET status='active',
           last_validated_at = now(),
           expires_at = now() + make_interval(mins => _ttl_minutes),
           user_agent = COALESCE(_user_agent, user_agent),
           fingerprint_hash = COALESCE(_fingerprint_hash, fingerprint_hash),
           health_score = LEAST(100, health_score + 10),
           updated_at = now()
     WHERE id = v_session_id;
  END IF;

  -- Upsert cookie vault
  INSERT INTO public.session_cookie_vault (session_id, cookies, local_storage, expires_at)
  VALUES (v_session_id, _cookies, COALESCE(_local_storage,'{}'::jsonb), now() + make_interval(mins => _ttl_minutes))
  ON CONFLICT DO NOTHING;

  UPDATE public.session_cookie_vault
     SET cookies = _cookies,
         local_storage = COALESCE(_local_storage, local_storage),
         expires_at = now() + make_interval(mins => _ttl_minutes),
         updated_at = now()
   WHERE session_id = v_session_id;

  UPDATE public.challenge_sessions
     SET status='resolved', resolved_at=now(), resolved_by = auth.uid(), session_id = v_session_id, updated_at = now()
   WHERE id = v_challenge.id;

  RETURN v_session_id;
END $$;

-- Add unique constraint so upsert works
CREATE UNIQUE INDEX IF NOT EXISTS idx_cookie_vault_session_unique ON public.session_cookie_vault(session_id);

-- Pick healthiest active session for a (provider, country)
CREATE OR REPLACE FUNCTION public.hvg_pick_session(_provider TEXT, _country TEXT)
RETURNS TABLE(session_id UUID, user_id UUID, fingerprint_hash TEXT, user_agent TEXT, cookies JSONB, local_storage JSONB, health_score NUMERIC)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT s.id, s.user_id, s.fingerprint_hash, s.user_agent,
         COALESCE(v.cookies, '[]'::jsonb), COALESCE(v.local_storage, '{}'::jsonb), s.health_score
  FROM public.provider_sessions s
  LEFT JOIN public.session_cookie_vault v ON v.session_id = s.id
  WHERE s.provider = _provider
    AND s.country_code = _country
    AND s.status = 'active'
    AND (s.expires_at IS NULL OR s.expires_at > now())
  ORDER BY s.health_score DESC, s.last_used_at NULLS FIRST
  LIMIT 1;
$$;

-- Record a session outcome
CREATE OR REPLACE FUNCTION public.hvg_record_outcome(
  _session_id UUID,
  _outcome TEXT,
  _http_status INT DEFAULT NULL,
  _duration_ms INT DEFAULT NULL,
  _worker_id TEXT DEFAULT NULL,
  _metadata JSONB DEFAULT '{}'::jsonb
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_provider TEXT; v_country TEXT;
BEGIN
  SELECT provider, country_code INTO v_provider, v_country
  FROM public.provider_sessions WHERE id = _session_id;

  INSERT INTO public.session_health_log
    (session_id, provider, country_code, outcome, http_status, duration_ms, worker_id, metadata)
  VALUES
    (_session_id, v_provider, v_country, _outcome, _http_status, _duration_ms, _worker_id, COALESCE(_metadata,'{}'::jsonb));

  UPDATE public.provider_sessions
     SET last_used_at = now(),
         success_count = success_count + CASE WHEN _outcome='success' THEN 1 ELSE 0 END,
         captcha_count = captcha_count + CASE WHEN _outcome IN ('captcha','cloudflare') THEN 1 ELSE 0 END,
         block_count   = block_count   + CASE WHEN _outcome IN ('block','timeout','error') THEN 1 ELSE 0 END,
         health_score = GREATEST(0, LEAST(100, health_score
            + CASE WHEN _outcome='success' THEN 3
                   WHEN _outcome IN ('captcha','cloudflare') THEN -25
                   WHEN _outcome='block' THEN -35
                   WHEN _outcome IN ('timeout','error') THEN -8
                   ELSE 0 END)),
         status = CASE
           WHEN _outcome IN ('captcha','cloudflare','block') THEN 'quarantined'
           ELSE status END,
         updated_at = now()
   WHERE id = _session_id;
END $$;

-- Admin dashboard summary
CREATE OR REPLACE FUNCTION public.hvg_dashboard(_hours INT DEFAULT 24)
RETURNS TABLE(
  provider TEXT, country_code TEXT,
  active_sessions INT, quarantined_sessions INT,
  pending_challenges INT,
  avg_health NUMERIC, captcha_rate NUMERIC, success_rate NUMERIC
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Admin only';
  END IF;
  RETURN QUERY
  WITH s AS (
    SELECT provider, country_code,
      COUNT(*) FILTER (WHERE status='active')::int AS act,
      COUNT(*) FILTER (WHERE status='quarantined')::int AS quar,
      ROUND(AVG(health_score)::NUMERIC, 1) AS avg_h
    FROM public.provider_sessions GROUP BY 1,2
  ),
  c AS (
    SELECT provider, country_code, COUNT(*)::int AS pend
    FROM public.challenge_sessions
    WHERE status IN ('pending','notified') AND expires_at > now()
    GROUP BY 1,2
  ),
  l AS (
    SELECT provider, country_code,
      COUNT(*) AS total,
      COUNT(*) FILTER (WHERE outcome='success') AS ok,
      COUNT(*) FILTER (WHERE outcome IN ('captcha','cloudflare')) AS cap
    FROM public.session_health_log
    WHERE created_at > now() - make_interval(hours => _hours)
    GROUP BY 1,2
  )
  SELECT
    COALESCE(s.provider, c.provider, l.provider),
    COALESCE(s.country_code, c.country_code, l.country_code),
    COALESCE(s.act, 0), COALESCE(s.quar, 0),
    COALESCE(c.pend, 0),
    COALESCE(s.avg_h, 0),
    CASE WHEN COALESCE(l.total,0) > 0 THEN ROUND(100.0*l.cap/l.total, 2) ELSE 0 END,
    CASE WHEN COALESCE(l.total,0) > 0 THEN ROUND(100.0*l.ok/l.total, 2) ELSE 0 END
  FROM s
  FULL OUTER JOIN c ON c.provider = s.provider AND c.country_code = s.country_code
  FULL OUTER JOIN l ON l.provider = COALESCE(s.provider, c.provider) AND l.country_code = COALESCE(s.country_code, c.country_code);
END $$;
