-- Proxy pools (logical groupings)
CREATE TABLE public.proxy_pools (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  provider TEXT,
  pool_type TEXT NOT NULL DEFAULT 'residential' CHECK (pool_type IN ('residential','datacenter','mobile','isp')),
  rotation_strategy TEXT NOT NULL DEFAULT 'round_robin' CHECK (rotation_strategy IN ('round_robin','random','least_used','sticky')),
  is_active BOOLEAN NOT NULL DEFAULT true,
  target_countries TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Individual proxy endpoints
CREATE TABLE public.proxy_endpoints (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pool_id UUID NOT NULL REFERENCES public.proxy_pools(id) ON DELETE CASCADE,
  protocol TEXT NOT NULL DEFAULT 'http' CHECK (protocol IN ('http','https','socks5')),
  host TEXT NOT NULL,
  port INTEGER NOT NULL CHECK (port > 0 AND port < 65536),
  username TEXT,
  password TEXT,
  geo_country TEXT,
  geo_city TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','banned','cooldown','disabled','testing')),
  cooldown_until TIMESTAMPTZ,
  success_count INTEGER NOT NULL DEFAULT 0,
  failure_count INTEGER NOT NULL DEFAULT 0,
  consecutive_failures INTEGER NOT NULL DEFAULT 0,
  last_used_at TIMESTAMPTZ,
  last_success_at TIMESTAMPTZ,
  last_failure_at TIMESTAMPTZ,
  last_error TEXT,
  avg_latency_ms INTEGER,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(host, port, username)
);

CREATE INDEX idx_proxy_endpoints_pool ON public.proxy_endpoints(pool_id);
CREATE INDEX idx_proxy_endpoints_status ON public.proxy_endpoints(status) WHERE status = 'active';
CREATE INDEX idx_proxy_endpoints_geo ON public.proxy_endpoints(geo_country);

-- Proxy health log
CREATE TABLE public.proxy_health_log (
  id BIGSERIAL PRIMARY KEY,
  proxy_id UUID NOT NULL REFERENCES public.proxy_endpoints(id) ON DELETE CASCADE,
  checked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  success BOOLEAN NOT NULL,
  latency_ms INTEGER,
  status_code INTEGER,
  error_message TEXT,
  test_url TEXT,
  used_for TEXT
);

CREATE INDEX idx_proxy_health_log_proxy ON public.proxy_health_log(proxy_id, checked_at DESC);

-- RLS
ALTER TABLE public.proxy_pools ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.proxy_endpoints ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.proxy_health_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage proxy_pools" ON public.proxy_pools
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins manage proxy_endpoints" ON public.proxy_endpoints
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins read proxy_health_log" ON public.proxy_health_log
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

-- Triggers
CREATE TRIGGER trg_proxy_pools_updated BEFORE UPDATE ON public.proxy_pools
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER trg_proxy_endpoints_updated BEFORE UPDATE ON public.proxy_endpoints
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Helper function: pick next active proxy from a pool
CREATE OR REPLACE FUNCTION public.pick_next_proxy(_pool_name TEXT, _country TEXT DEFAULT NULL)
RETURNS TABLE(
  id UUID,
  protocol TEXT,
  host TEXT,
  port INTEGER,
  username TEXT,
  password TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT pe.id, pe.protocol, pe.host, pe.port, pe.username, pe.password
  FROM public.proxy_endpoints pe
  JOIN public.proxy_pools pp ON pp.id = pe.pool_id
  WHERE pp.name = _pool_name
    AND pp.is_active = true
    AND pe.status = 'active'
    AND (pe.cooldown_until IS NULL OR pe.cooldown_until < now())
    AND (_country IS NULL OR pe.geo_country = _country OR pe.geo_country IS NULL)
  ORDER BY pe.last_used_at ASC NULLS FIRST, random()
  LIMIT 1;
END;
$$;

-- Helper function: record proxy result
CREATE OR REPLACE FUNCTION public.record_proxy_result(
  _proxy_id UUID,
  _success BOOLEAN,
  _latency_ms INTEGER DEFAULT NULL,
  _status_code INTEGER DEFAULT NULL,
  _error TEXT DEFAULT NULL,
  _used_for TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_consec INTEGER;
BEGIN
  INSERT INTO public.proxy_health_log (proxy_id, success, latency_ms, status_code, error_message, used_for)
  VALUES (_proxy_id, _success, _latency_ms, _status_code, _error, _used_for);

  IF _success THEN
    UPDATE public.proxy_endpoints
    SET success_count = success_count + 1,
        consecutive_failures = 0,
        last_used_at = now(),
        last_success_at = now(),
        avg_latency_ms = CASE
          WHEN avg_latency_ms IS NULL THEN _latency_ms
          ELSE (avg_latency_ms * 9 + COALESCE(_latency_ms, avg_latency_ms)) / 10
        END
    WHERE id = _proxy_id;
  ELSE
    UPDATE public.proxy_endpoints
    SET failure_count = failure_count + 1,
        consecutive_failures = consecutive_failures + 1,
        last_used_at = now(),
        last_failure_at = now(),
        last_error = _error,
        cooldown_until = CASE
          WHEN consecutive_failures + 1 >= 5 THEN now() + interval '30 minutes'
          WHEN consecutive_failures + 1 >= 3 THEN now() + interval '10 minutes'
          ELSE cooldown_until
        END,
        status = CASE
          WHEN consecutive_failures + 1 >= 10 THEN 'banned'
          ELSE status
        END
    WHERE id = _proxy_id;
  END IF;
END;
$$;