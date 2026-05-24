-- 1) Extend proxy_endpoints with intelligence columns
ALTER TABLE public.proxy_endpoints
  ADD COLUMN IF NOT EXISTS score NUMERIC(5,2) NOT NULL DEFAULT 100.00,
  ADD COLUMN IF NOT EXISTS ban_probability NUMERIC(5,2) NOT NULL DEFAULT 0.00,
  ADD COLUMN IF NOT EXISTS captcha_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS block_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_requests INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS disabled_reason TEXT,
  ADD COLUMN IF NOT EXISTS auto_disabled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_captcha_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_block_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_proxy_endpoints_score ON public.proxy_endpoints(score DESC) WHERE status='active';

-- 2) Extend proxy_health_log with classification
ALTER TABLE public.proxy_health_log
  ADD COLUMN IF NOT EXISTS provider TEXT,
  ADD COLUMN IF NOT EXISTS was_captcha BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS was_block BOOLEAN NOT NULL DEFAULT false;

-- 3) Provider affinity table
CREATE TABLE IF NOT EXISTS public.proxy_provider_affinity (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proxy_id UUID NOT NULL REFERENCES public.proxy_endpoints(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  success_count INTEGER NOT NULL DEFAULT 0,
  failure_count INTEGER NOT NULL DEFAULT 0,
  captcha_count INTEGER NOT NULL DEFAULT 0,
  block_count INTEGER NOT NULL DEFAULT 0,
  affinity_score NUMERIC(5,2) NOT NULL DEFAULT 50.00,
  last_used_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(proxy_id, provider)
);

CREATE INDEX IF NOT EXISTS idx_ppa_provider_score ON public.proxy_provider_affinity(provider, affinity_score DESC);

ALTER TABLE public.proxy_provider_affinity ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage proxy_provider_affinity"
  ON public.proxy_provider_affinity FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(),'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(),'admin'::app_role));

-- 4) Replace record_proxy_result with extended classification
CREATE OR REPLACE FUNCTION public.record_proxy_result(
  _proxy_id UUID,
  _success BOOLEAN,
  _latency_ms INTEGER DEFAULT NULL,
  _status_code INTEGER DEFAULT NULL,
  _error TEXT DEFAULT NULL,
  _used_for TEXT DEFAULT NULL,
  _provider TEXT DEFAULT NULL,
  _was_captcha BOOLEAN DEFAULT false,
  _was_block BOOLEAN DEFAULT false
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.proxy_health_log
    (proxy_id, success, latency_ms, status_code, error_message, used_for, provider, was_captcha, was_block)
  VALUES
    (_proxy_id, _success, _latency_ms, _status_code, _error, _used_for, _provider, COALESCE(_was_captcha,false), COALESCE(_was_block,false));

  IF _success THEN
    UPDATE public.proxy_endpoints
       SET success_count   = success_count + 1,
           total_requests  = total_requests + 1,
           consecutive_failures = 0,
           last_used_at    = now(),
           last_success_at = now(),
           avg_latency_ms  = CASE WHEN avg_latency_ms IS NULL THEN _latency_ms
                                  ELSE (avg_latency_ms*9 + COALESCE(_latency_ms, avg_latency_ms))/10 END
     WHERE id = _proxy_id;
  ELSE
    UPDATE public.proxy_endpoints
       SET failure_count   = failure_count + 1,
           total_requests  = total_requests + 1,
           consecutive_failures = consecutive_failures + 1,
           captcha_count   = captcha_count + CASE WHEN _was_captcha THEN 1 ELSE 0 END,
           block_count     = block_count   + CASE WHEN _was_block   THEN 1 ELSE 0 END,
           last_captcha_at = CASE WHEN _was_captcha THEN now() ELSE last_captcha_at END,
           last_block_at   = CASE WHEN _was_block   THEN now() ELSE last_block_at END,
           last_used_at    = now(),
           last_failure_at = now(),
           last_error      = _error,
           cooldown_until  = CASE
             WHEN _was_block OR consecutive_failures+1 >= 5 THEN now() + interval '30 minutes'
             WHEN _was_captcha OR consecutive_failures+1 >= 3 THEN now() + interval '10 minutes'
             ELSE cooldown_until END,
           status = CASE
             WHEN consecutive_failures+1 >= 10 THEN 'banned'
             ELSE status END
     WHERE id = _proxy_id;
  END IF;

  -- Provider affinity upsert
  IF _provider IS NOT NULL THEN
    INSERT INTO public.proxy_provider_affinity
      (proxy_id, provider, success_count, failure_count, captcha_count, block_count, last_used_at)
    VALUES
      (_proxy_id, _provider,
        CASE WHEN _success THEN 1 ELSE 0 END,
        CASE WHEN _success THEN 0 ELSE 1 END,
        CASE WHEN _was_captcha THEN 1 ELSE 0 END,
        CASE WHEN _was_block   THEN 1 ELSE 0 END,
        now())
    ON CONFLICT (proxy_id, provider) DO UPDATE
      SET success_count = proxy_provider_affinity.success_count + EXCLUDED.success_count,
          failure_count = proxy_provider_affinity.failure_count + EXCLUDED.failure_count,
          captcha_count = proxy_provider_affinity.captcha_count + EXCLUDED.captcha_count,
          block_count   = proxy_provider_affinity.block_count   + EXCLUDED.block_count,
          last_used_at  = now(),
          updated_at    = now(),
          affinity_score = LEAST(100, GREATEST(0,
            100.0 * (proxy_provider_affinity.success_count + EXCLUDED.success_count)
            / NULLIF((proxy_provider_affinity.success_count + proxy_provider_affinity.failure_count
                      + EXCLUDED.success_count + EXCLUDED.failure_count), 0)
            - 5.0 * (proxy_provider_affinity.captcha_count + EXCLUDED.captcha_count)
            - 10.0 * (proxy_provider_affinity.block_count + EXCLUDED.block_count)
          ));
  END IF;
END;
$$;

-- 5) Recompute proxy scores + auto-disable
CREATE OR REPLACE FUNCTION public.recompute_proxy_scores()
RETURNS TABLE(updated INTEGER, auto_disabled INTEGER)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_updated INT := 0; v_disabled INT := 0;
BEGIN
  WITH stats AS (
    SELECT p.id,
           COUNT(*) FILTER (WHERE l.checked_at >= now() - interval '7 days')             AS req7,
           COUNT(*) FILTER (WHERE l.checked_at >= now() - interval '7 days' AND l.success) AS ok7,
           COUNT(*) FILTER (WHERE l.checked_at >= now() - interval '7 days' AND l.was_captcha) AS cap7,
           COUNT(*) FILTER (WHERE l.checked_at >= now() - interval '7 days' AND l.was_block)   AS blk7,
           AVG(l.latency_ms) FILTER (WHERE l.checked_at >= now() - interval '7 days' AND l.success) AS lat7
      FROM public.proxy_endpoints p
      LEFT JOIN public.proxy_health_log l ON l.proxy_id = p.id
     GROUP BY p.id
  ),
  scored AS (
    SELECT id, req7, ok7, cap7, blk7, lat7,
           CASE WHEN req7 = 0 THEN 70.0  -- unknown, neutral-positive
                ELSE GREATEST(0, LEAST(100,
                     100.0 * ok7 / NULLIF(req7,0)
                     - 6.0  * cap7
                     - 12.0 * blk7
                     - LEAST(20, COALESCE(lat7,0)/200.0)  -- 4000ms ≈ -20
                ))
           END AS new_score,
           CASE WHEN req7 = 0 THEN 0
                ELSE LEAST(100, ROUND(100.0 * (cap7 + blk7*2) / NULLIF(req7,0), 2))
           END AS new_ban_prob
      FROM stats
  )
  UPDATE public.proxy_endpoints p
     SET score = s.new_score,
         ban_probability = s.new_ban_prob,
         updated_at = now()
    FROM scored s WHERE s.id = p.id;
  GET DIAGNOSTICS v_updated = ROW_COUNT;

  -- Auto-disable proxies with score < 20 and ≥50 samples in last 7 days
  WITH bad AS (
    SELECT p.id FROM public.proxy_endpoints p
      JOIN public.proxy_health_log l ON l.proxy_id = p.id AND l.checked_at >= now() - interval '7 days'
     WHERE p.status = 'active'
     GROUP BY p.id
    HAVING COUNT(*) >= 50 AND p.score < 20
  )
  UPDATE public.proxy_endpoints p
     SET status = 'disabled',
         disabled_reason = format('Auto-disabled: score=%s ban_prob=%s', score, ban_probability),
         auto_disabled_at = now(),
         updated_at = now()
   WHERE p.id IN (SELECT id FROM bad);
  GET DIAGNOSTICS v_disabled = ROW_COUNT;

  RETURN QUERY SELECT v_updated, v_disabled;
END;
$$;

-- 6) Smart picker: best proxy for (provider, country)
CREATE OR REPLACE FUNCTION public.pick_best_proxy(
  _provider TEXT DEFAULT NULL,
  _country TEXT DEFAULT NULL,
  _pool_name TEXT DEFAULT NULL
)
RETURNS TABLE(id UUID, protocol TEXT, host TEXT, port INTEGER, username TEXT, password TEXT,
              score NUMERIC, affinity NUMERIC, avg_latency_ms INTEGER, ban_probability NUMERIC)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT pe.id, pe.protocol, pe.host, pe.port, pe.username, pe.password,
         pe.score,
         COALESCE(aff.affinity_score, 50.0)::NUMERIC AS affinity,
         pe.avg_latency_ms,
         pe.ban_probability
    FROM public.proxy_endpoints pe
    JOIN public.proxy_pools pp ON pp.id = pe.pool_id AND pp.is_active = true
    LEFT JOIN public.proxy_provider_affinity aff
           ON aff.proxy_id = pe.id AND aff.provider = _provider
   WHERE pe.status = 'active'
     AND (pe.cooldown_until IS NULL OR pe.cooldown_until < now())
     AND (_country IS NULL OR pe.geo_country = _country OR pe.geo_country IS NULL)
     AND (_pool_name IS NULL OR pp.name = _pool_name)
     AND (_provider IS NULL OR pp.provider IS NULL OR pp.provider = _provider)
   ORDER BY
     -- composite ranking: 50% score, 30% affinity, 20% latency penalty
     ( pe.score * 0.5
       + COALESCE(aff.affinity_score, 50.0) * 0.3
       - LEAST(30, COALESCE(pe.avg_latency_ms,500)/100.0) * 0.2
     ) DESC,
     pe.last_used_at ASC NULLS FIRST,
     random()
   LIMIT 1;
END;
$$;