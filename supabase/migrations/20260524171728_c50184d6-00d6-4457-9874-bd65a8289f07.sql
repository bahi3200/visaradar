-- ============ scan_workers ============
CREATE TABLE IF NOT EXISTS public.scan_workers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_id TEXT NOT NULL UNIQUE,
  region TEXT,
  status TEXT NOT NULL DEFAULT 'idle' CHECK (status IN ('idle','busy','offline','draining')),
  current_load INT NOT NULL DEFAULT 0,
  max_concurrency INT NOT NULL DEFAULT 4,
  tasks_completed INT NOT NULL DEFAULT 0,
  tasks_failed INT NOT NULL DEFAULT 0,
  last_heartbeat TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_scan_workers_status ON public.scan_workers(status, last_heartbeat DESC);
ALTER TABLE public.scan_workers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read scan_workers" ON public.scan_workers FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin'::app_role));
CREATE POLICY "Admins manage scan_workers" ON public.scan_workers FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'::app_role)) WITH CHECK (public.has_role(auth.uid(),'admin'::app_role));

-- ============ scan_shards ============
CREATE TABLE IF NOT EXISTS public.scan_shards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shard_key TEXT NOT NULL UNIQUE,
  strategy TEXT NOT NULL DEFAULT 'provider' CHECK (strategy IN ('provider','country','hash')),
  providers TEXT[] NOT NULL DEFAULT '{}',
  countries TEXT[] NOT NULL DEFAULT '{}',
  weight INT NOT NULL DEFAULT 1,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.scan_shards ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage scan_shards" ON public.scan_shards FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'::app_role)) WITH CHECK (public.has_role(auth.uid(),'admin'::app_role));

-- ============ scan_tasks ============
CREATE TABLE IF NOT EXISTS public.scan_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  country_code TEXT NOT NULL,
  provider TEXT,
  category TEXT,
  priority INT NOT NULL DEFAULT 5,
  is_burst BOOLEAN NOT NULL DEFAULT false,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','claimed','running','done','failed','expired')),
  attempts INT NOT NULL DEFAULT 0,
  claimed_by TEXT,
  claimed_at TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  latency_ms INT,
  error TEXT,
  shard_key TEXT,
  enqueued_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '5 minutes')
);
CREATE INDEX IF NOT EXISTS idx_scan_tasks_pending ON public.scan_tasks(priority DESC, enqueued_at ASC)
  WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_scan_tasks_status ON public.scan_tasks(status, finished_at DESC);
CREATE INDEX IF NOT EXISTS idx_scan_tasks_worker ON public.scan_tasks(claimed_by, status);
ALTER TABLE public.scan_tasks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read scan_tasks" ON public.scan_tasks FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin'::app_role));

-- ============ enqueue_scan_tasks ============
CREATE OR REPLACE FUNCTION public.enqueue_scan_tasks(_burst BOOLEAN DEFAULT false)
RETURNS INT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_inserted INT;
BEGIN
  -- One task per (country, provider) for countries NOT currently cooled down AND whose provider isn't throttled.
  -- Burst flag bypasses scan_priorities.cooldown_until.
  WITH base AS (
    SELECT DISTINCT pc.country_code, pc.provider
      FROM public.provider_centers pc
     WHERE NOT EXISTS (
        SELECT 1 FROM public.provider_throttle pt
         WHERE pt.provider = pc.provider AND pt.cooldown_until > now()
      )
      AND (
        _burst = true
        OR NOT EXISTS (
          SELECT 1 FROM public.scan_priorities sp
           WHERE sp.country_code = pc.country_code AND sp.cooldown_until > now()
        )
      )
  ),
  -- Skip if an unfinished task already exists for the same (country, provider)
  filtered AS (
    SELECT b.* FROM base b
     WHERE NOT EXISTS (
       SELECT 1 FROM public.scan_tasks t
        WHERE t.country_code = b.country_code
          AND COALESCE(t.provider,'') = COALESCE(b.provider,'')
          AND t.status IN ('pending','claimed','running')
     )
  )
  INSERT INTO public.scan_tasks (country_code, provider, priority, is_burst, shard_key)
  SELECT f.country_code, f.provider,
         CASE
           WHEN _burst THEN 9
           WHEN public.is_in_predictive_window(f.country_code, f.provider, 8.0) THEN 8
           ELSE COALESCE((SELECT priority FROM public.scan_priorities sp
                           WHERE sp.country_code = f.country_code LIMIT 1), 5)
         END,
         _burst OR public.is_in_predictive_window(f.country_code, f.provider, 8.0),
         f.provider
    FROM filtered f;
  GET DIAGNOSTICS v_inserted = ROW_COUNT;

  -- Expire stale claimed tasks
  UPDATE public.scan_tasks SET status='expired'
   WHERE status IN ('pending','claimed','running') AND expires_at < now();

  RETURN v_inserted;
END;
$$;

-- ============ claim_scan_tasks ============
CREATE OR REPLACE FUNCTION public.claim_scan_tasks(_worker_id TEXT, _limit INT DEFAULT 4)
RETURNS TABLE(id UUID, country_code TEXT, provider TEXT, category TEXT, is_burst BOOLEAN, priority INT)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  -- Upsert worker heartbeat
  INSERT INTO public.scan_workers (worker_id, status, last_heartbeat)
  VALUES (_worker_id, 'busy', now())
  ON CONFLICT (worker_id) DO UPDATE
    SET status='busy', last_heartbeat=now();

  RETURN QUERY
  WITH picked AS (
    SELECT t.id
      FROM public.scan_tasks t
     WHERE t.status = 'pending'
     ORDER BY t.priority DESC, t.enqueued_at ASC
     LIMIT _limit
     FOR UPDATE SKIP LOCKED
  )
  UPDATE public.scan_tasks t
     SET status='claimed', claimed_by=_worker_id, claimed_at=now(), attempts=t.attempts+1
    FROM picked
   WHERE t.id = picked.id
  RETURNING t.id, t.country_code, t.provider, t.category, t.is_burst, t.priority;
END;
$$;

-- ============ complete_scan_task ============
CREATE OR REPLACE FUNCTION public.complete_scan_task(
  _task_id UUID, _success BOOLEAN, _latency_ms INT DEFAULT NULL, _error TEXT DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_worker TEXT;
BEGIN
  UPDATE public.scan_tasks
     SET status = CASE WHEN _success THEN 'done' ELSE 'failed' END,
         finished_at = now(),
         latency_ms = _latency_ms,
         error = _error,
         started_at = COALESCE(started_at, claimed_at)
   WHERE id = _task_id
   RETURNING claimed_by INTO v_worker;

  IF v_worker IS NOT NULL THEN
    UPDATE public.scan_workers
       SET tasks_completed = tasks_completed + CASE WHEN _success THEN 1 ELSE 0 END,
           tasks_failed    = tasks_failed    + CASE WHEN _success THEN 0 ELSE 1 END,
           last_heartbeat = now()
     WHERE worker_id = v_worker;
  END IF;
END;
$$;

-- ============ throughput stats ============
CREATE OR REPLACE FUNCTION public.get_scan_throughput_stats()
RETURNS TABLE(
  active_workers INT,
  pending_tasks INT,
  running_tasks INT,
  done_last_minute INT,
  failed_last_minute INT,
  avg_latency_ms NUMERIC,
  p95_latency_ms NUMERIC,
  burst_active_tasks INT
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT
    (SELECT COUNT(*)::INT FROM public.scan_workers WHERE status='busy' AND last_heartbeat > now()-interval '90 seconds'),
    (SELECT COUNT(*)::INT FROM public.scan_tasks WHERE status='pending'),
    (SELECT COUNT(*)::INT FROM public.scan_tasks WHERE status IN ('claimed','running')),
    (SELECT COUNT(*)::INT FROM public.scan_tasks WHERE status='done'   AND finished_at > now()-interval '1 minute'),
    (SELECT COUNT(*)::INT FROM public.scan_tasks WHERE status='failed' AND finished_at > now()-interval '1 minute'),
    (SELECT ROUND(AVG(latency_ms)::NUMERIC,1) FROM public.scan_tasks WHERE status='done' AND finished_at > now()-interval '5 minutes'),
    (SELECT ROUND(PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY latency_ms)::NUMERIC, 1)
       FROM public.scan_tasks WHERE status='done' AND finished_at > now()-interval '5 minutes'),
    (SELECT COUNT(*)::INT FROM public.scan_tasks WHERE is_burst AND status IN ('pending','claimed','running'));
$$;