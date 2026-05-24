
CREATE TABLE public.predictive_windows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  country_code TEXT NOT NULL,
  provider TEXT NOT NULL,
  weekday SMALLINT NOT NULL,
  hour SMALLINT NOT NULL,
  open_count INT NOT NULL DEFAULT 0,
  total_samples INT NOT NULL DEFAULT 0,
  score NUMERIC(5,2) NOT NULL DEFAULT 0,
  last_seen_at TIMESTAMPTZ,
  computed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (country_code, provider, weekday, hour)
);
CREATE INDEX idx_pw_country_provider ON public.predictive_windows (country_code, provider);
CREATE INDEX idx_pw_score ON public.predictive_windows (score DESC);
ALTER TABLE public.predictive_windows ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read predictive_windows" ON public.predictive_windows FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

-- Heatmap: counts of openings per (weekday, hour) in Africa/Algiers timezone
CREATE OR REPLACE FUNCTION public.get_open_heatmap(
  _country TEXT DEFAULT NULL,
  _provider TEXT DEFAULT NULL,
  _days INT DEFAULT 60
)
RETURNS TABLE (weekday SMALLINT, hour SMALLINT, open_count BIGINT, avg_duration_minutes NUMERIC)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    EXTRACT(DOW FROM (opened_at AT TIME ZONE 'Africa/Algiers'))::SMALLINT AS weekday,
    EXTRACT(HOUR FROM (opened_at AT TIME ZONE 'Africa/Algiers'))::SMALLINT AS hour,
    COUNT(*) AS open_count,
    ROUND(AVG(NULLIF(duration_minutes, 0))::NUMERIC, 1) AS avg_duration_minutes
  FROM public.visa_open_events
  WHERE opened_at >= now() - make_interval(days => _days)
    AND (_country IS NULL OR country_code = _country)
    AND (_provider IS NULL OR provider = _provider)
  GROUP BY 1, 2
  ORDER BY 1, 2;
$$;

-- Rebuild predictive windows from the last 60 days
CREATE OR REPLACE FUNCTION public.compute_predictive_windows(_days INT DEFAULT 60)
RETURNS INT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_inserted INT;
BEGIN
  DELETE FROM public.predictive_windows;

  INSERT INTO public.predictive_windows
    (country_code, provider, weekday, hour, open_count, total_samples, score, last_seen_at, computed_at)
  WITH agg AS (
    SELECT
      country_code, provider,
      EXTRACT(DOW  FROM (opened_at AT TIME ZONE 'Africa/Algiers'))::SMALLINT AS weekday,
      EXTRACT(HOUR FROM (opened_at AT TIME ZONE 'Africa/Algiers'))::SMALLINT AS hour,
      COUNT(*) AS open_count,
      MAX(opened_at) AS last_seen_at
    FROM public.visa_open_events
    WHERE opened_at >= now() - make_interval(days => _days)
    GROUP BY country_code, provider, 3, 4
  ),
  totals AS (
    SELECT country_code, provider, SUM(open_count) AS total_open
    FROM agg GROUP BY country_code, provider
  )
  SELECT
    a.country_code, a.provider, a.weekday, a.hour,
    a.open_count,
    t.total_open::INT AS total_samples,
    LEAST(100, ROUND((a.open_count::NUMERIC / NULLIF(t.total_open, 0)) * 100, 2)) AS score,
    a.last_seen_at,
    now()
  FROM agg a JOIN totals t USING (country_code, provider);

  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  RETURN v_inserted;
END;
$$;

-- Check if current moment is in a high-probability window
CREATE OR REPLACE FUNCTION public.is_in_predictive_window(
  _country TEXT, _provider TEXT, _min_score NUMERIC DEFAULT 8.0
)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.predictive_windows
    WHERE country_code = _country
      AND provider = _provider
      AND weekday = EXTRACT(DOW  FROM (now() AT TIME ZONE 'Africa/Algiers'))::SMALLINT
      AND hour    = EXTRACT(HOUR FROM (now() AT TIME ZONE 'Africa/Algiers'))::SMALLINT
      AND score >= _min_score
  );
$$;

REVOKE ALL ON FUNCTION public.compute_predictive_windows(INT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.compute_predictive_windows(INT) TO service_role;
REVOKE ALL ON FUNCTION public.is_in_predictive_window(TEXT, TEXT, NUMERIC) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_in_predictive_window(TEXT, TEXT, NUMERIC) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.get_open_heatmap(TEXT, TEXT, INT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_open_heatmap(TEXT, TEXT, INT) TO authenticated, service_role;
