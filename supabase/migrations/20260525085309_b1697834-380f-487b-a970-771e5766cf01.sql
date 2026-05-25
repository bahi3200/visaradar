REVOKE EXECUTE ON FUNCTION public.record_captcha_event(TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_bot_detection_dashboard(INT) FROM PUBLIC, anon;
-- Allow signed-in admins to read dashboard via PostgREST RPC (RLS not applicable to functions; rely on internal check)
-- Wrap dashboard with admin check
CREATE OR REPLACE FUNCTION public.get_bot_detection_dashboard(_hours INT DEFAULT 24)
RETURNS TABLE(
  provider TEXT, total_requests BIGINT, captcha_rate NUMERIC, block_rate NUMERIC,
  cloudflare_rate NUMERIC, success_rate NUMERIC, fingerprint_success_rate NUMERIC,
  risk_score NUMERIC, cooldown_until TIMESTAMPTZ, escalation_level INT
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Admin only';
  END IF;
  RETURN QUERY
  WITH m AS (
    SELECT provider, outcome, cloudflare_detected
    FROM public.stealth_metrics
    WHERE created_at > now() - make_interval(hours => _hours)
  ),
  agg AS (
    SELECT provider, COUNT(*) AS total,
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
  SELECT a.provider, a.total,
    CASE WHEN a.total>0 THEN ROUND(100.0*a.cap/a.total,2) ELSE 0 END,
    CASE WHEN a.total>0 THEN ROUND(100.0*a.blk/a.total,2) ELSE 0 END,
    CASE WHEN a.total>0 THEN ROUND(100.0*a.cf/a.total,2) ELSE 0 END,
    CASE WHEN a.total>0 THEN ROUND(100.0*a.ok/a.total,2) ELSE 0 END,
    fp.fp_rate,
    COALESCE((SELECT risk_score FROM public.provider_risk_scores WHERE provider=a.provider), 0),
    (SELECT cooldown_until FROM public.provider_cooldown_state WHERE provider=a.provider),
    COALESCE((SELECT escalation_level FROM public.provider_cooldown_state WHERE provider=a.provider), 0)
  FROM agg a LEFT JOIN fp ON fp.provider = a.provider
  ORDER BY a.total DESC;
END;
$$;
GRANT EXECUTE ON FUNCTION public.get_bot_detection_dashboard(INT) TO authenticated;