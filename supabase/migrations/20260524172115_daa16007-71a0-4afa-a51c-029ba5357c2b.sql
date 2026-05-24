-- alert_queue
CREATE TABLE IF NOT EXISTS public.alert_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chat_id TEXT NOT NULL,
  user_id UUID,
  country_code TEXT,
  provider TEXT,
  priority SMALLINT NOT NULL DEFAULT 2,  -- 0=critical, 1=high, 2=normal, 3=low
  payload JSONB NOT NULL,                 -- {text, parse_mode, reply_markup}
  alert_key TEXT,                         -- for dedup
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','claimed','sent','failed','dropped')),
  attempts INT NOT NULL DEFAULT 0,
  max_attempts INT NOT NULL DEFAULT 3,
  claimed_by TEXT,
  claimed_at TIMESTAMPTZ,
  enqueued_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  sent_at TIMESTAMPTZ,
  last_error TEXT,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '15 minutes')
);
CREATE INDEX IF NOT EXISTS idx_alert_queue_pending ON public.alert_queue(priority ASC, enqueued_at ASC) WHERE status='pending';
CREATE INDEX IF NOT EXISTS idx_alert_queue_status ON public.alert_queue(status, sent_at DESC);
ALTER TABLE public.alert_queue ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read alert_queue" ON public.alert_queue FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin'::app_role));

-- alert_delivery_log
CREATE TABLE IF NOT EXISTS public.alert_delivery_log (
  id BIGSERIAL PRIMARY KEY,
  alert_id UUID,
  chat_id TEXT NOT NULL,
  priority SMALLINT NOT NULL,
  success BOOLEAN NOT NULL,
  enqueued_at TIMESTAMPTZ NOT NULL,
  dispatched_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  e2e_latency_ms INT,
  worker_id TEXT,
  attempts INT NOT NULL DEFAULT 1,
  error TEXT,
  country_code TEXT,
  provider TEXT
);
CREATE INDEX IF NOT EXISTS idx_alert_delivery_log_time ON public.alert_delivery_log(delivered_at DESC);
CREATE INDEX IF NOT EXISTS idx_alert_delivery_log_priority ON public.alert_delivery_log(priority, delivered_at DESC);
ALTER TABLE public.alert_delivery_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read alert_delivery_log" ON public.alert_delivery_log FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin'::app_role));

-- claim_alerts
CREATE OR REPLACE FUNCTION public.claim_alerts(_worker_id TEXT, _limit INT DEFAULT 25)
RETURNS TABLE(id UUID, chat_id TEXT, priority SMALLINT, payload JSONB, attempts INT,
              enqueued_at TIMESTAMPTZ, country_code TEXT, provider TEXT)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH picked AS (
    SELECT q.id
      FROM public.alert_queue q
     WHERE q.status='pending' AND q.expires_at > now()
     ORDER BY q.priority ASC, q.enqueued_at ASC
     LIMIT _limit
     FOR UPDATE SKIP LOCKED
  )
  UPDATE public.alert_queue q
     SET status='claimed', claimed_by=_worker_id, claimed_at=now(), attempts=q.attempts+1
    FROM picked
   WHERE q.id = picked.id
  RETURNING q.id, q.chat_id, q.priority, q.payload, q.attempts, q.enqueued_at, q.country_code, q.provider;

  -- expire stale
  UPDATE public.alert_queue SET status='dropped', last_error='expired'
   WHERE status IN ('pending','claimed') AND expires_at < now();
END;
$$;

-- complete_alert
CREATE OR REPLACE FUNCTION public.complete_alert(
  _id UUID, _success BOOLEAN, _worker_id TEXT, _error TEXT DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE r RECORD; v_latency INT;
BEGIN
  SELECT chat_id, priority, enqueued_at, claimed_at, attempts, max_attempts, country_code, provider
    INTO r FROM public.alert_queue WHERE id = _id;
  IF NOT FOUND THEN RETURN; END IF;

  v_latency := EXTRACT(EPOCH FROM (now() - r.enqueued_at)) * 1000;

  IF _success THEN
    UPDATE public.alert_queue SET status='sent', sent_at=now() WHERE id=_id;
  ELSIF r.attempts >= r.max_attempts THEN
    UPDATE public.alert_queue SET status='failed', last_error=_error, sent_at=now() WHERE id=_id;
  ELSE
    -- requeue with backoff
    UPDATE public.alert_queue
       SET status='pending', claimed_by=NULL, claimed_at=NULL, last_error=_error,
           enqueued_at = now() + (r.attempts * interval '2 seconds')
     WHERE id=_id;
  END IF;

  INSERT INTO public.alert_delivery_log
    (alert_id, chat_id, priority, success, enqueued_at, dispatched_at, delivered_at,
     e2e_latency_ms, worker_id, attempts, error, country_code, provider)
  VALUES
    (_id, r.chat_id, r.priority, _success, r.enqueued_at, r.claimed_at, now(),
     v_latency, _worker_id, r.attempts, _error, r.country_code, r.provider);
END;
$$;

-- get_alert_delivery_stats
CREATE OR REPLACE FUNCTION public.get_alert_delivery_stats()
RETURNS TABLE(
  pending_total INT, pending_p0 INT, pending_p1 INT,
  delivered_last_minute INT, failed_last_minute INT,
  sends_per_second NUMERIC,
  p50_latency_ms NUMERIC, p95_latency_ms NUMERIC, p99_latency_ms NUMERIC,
  failure_rate_pct NUMERIC, active_workers INT
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  WITH q AS (
    SELECT
      COUNT(*) FILTER (WHERE status='pending')                  AS pending_total,
      COUNT(*) FILTER (WHERE status='pending' AND priority=0)   AS p0,
      COUNT(*) FILTER (WHERE status='pending' AND priority=1)   AS p1
    FROM public.alert_queue
  ),
  recent AS (
    SELECT * FROM public.alert_delivery_log
    WHERE delivered_at > now() - interval '5 minutes'
  ),
  m AS (
    SELECT
      COUNT(*) FILTER (WHERE success AND delivered_at > now() - interval '1 minute') AS d1,
      COUNT(*) FILTER (WHERE NOT success AND delivered_at > now() - interval '1 minute') AS f1,
      CASE WHEN COUNT(*) = 0 THEN 0
           ELSE ROUND(100.0 * COUNT(*) FILTER (WHERE NOT success) / COUNT(*), 2) END AS fr,
      ROUND(COUNT(*) FILTER (WHERE delivered_at > now() - interval '1 minute')::NUMERIC / 60.0, 2) AS sps,
      ROUND(PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY e2e_latency_ms)::NUMERIC,1) AS p50,
      ROUND(PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY e2e_latency_ms)::NUMERIC,1) AS p95,
      ROUND(PERCENTILE_CONT(0.99) WITHIN GROUP (ORDER BY e2e_latency_ms)::NUMERIC,1) AS p99
    FROM recent
  ),
  w AS (
    SELECT COUNT(DISTINCT worker_id)::INT AS aw
    FROM public.alert_delivery_log
    WHERE delivered_at > now() - interval '90 seconds' AND worker_id IS NOT NULL
  )
  SELECT q.pending_total::INT, q.p0::INT, q.p1::INT,
         COALESCE(m.d1,0)::INT, COALESCE(m.f1,0)::INT,
         COALESCE(m.sps,0), m.p50, m.p95, m.p99,
         COALESCE(m.fr,0), COALESCE(w.aw,0)
  FROM q, m, w;
$$;