
-- 1) Table: each row = one transition to "open" for a country/provider
CREATE TABLE IF NOT EXISTS public.visa_open_events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  country_code TEXT NOT NULL,
  provider TEXT NOT NULL,
  opened_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  previous_status TEXT,
  detection_method TEXT,
  response_snippet TEXT,
  source_check_id UUID,
  closed_at TIMESTAMPTZ,
  duration_minutes INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_voe_country_opened ON public.visa_open_events (country_code, opened_at DESC);
CREATE INDEX IF NOT EXISTS idx_voe_provider_opened ON public.visa_open_events (provider, opened_at DESC);
CREATE INDEX IF NOT EXISTS idx_voe_opened_at ON public.visa_open_events (opened_at DESC);
CREATE INDEX IF NOT EXISTS idx_voe_open_only ON public.visa_open_events (country_code, provider) WHERE closed_at IS NULL;

ALTER TABLE public.visa_open_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins view all open events"
  ON public.visa_open_events FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Authenticated users view open events"
  ON public.visa_open_events FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Service role full access open events"
  ON public.visa_open_events FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- 2) Trigger function to record transitions
CREATE OR REPLACE FUNCTION public.track_visa_open_event()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_event_id UUID;
BEGIN
  -- Transition to open: insert new event
  IF NEW.status = 'open' AND COALESCE(NEW.previous_status, '') <> 'open' THEN
    INSERT INTO public.visa_open_events (
      country_code, provider, opened_at, previous_status,
      detection_method, response_snippet, source_check_id
    ) VALUES (
      NEW.country_code, NEW.provider, NEW.checked_at, NEW.previous_status,
      NEW.detection_method, NEW.response_snippet, NEW.id
    );
  END IF;

  -- Transition away from open: close the latest open event
  IF NEW.status <> 'open' AND NEW.previous_status = 'open' THEN
    UPDATE public.visa_open_events
    SET closed_at = NEW.checked_at,
        duration_minutes = GREATEST(
          0,
          EXTRACT(EPOCH FROM (NEW.checked_at - opened_at))::INTEGER / 60
        )
    WHERE id = (
      SELECT id FROM public.visa_open_events
      WHERE country_code = NEW.country_code
        AND provider = NEW.provider
        AND closed_at IS NULL
      ORDER BY opened_at DESC
      LIMIT 1
    );
  END IF;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.track_visa_open_event() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_track_visa_open_event ON public.visa_monitor_checks;
CREATE TRIGGER trg_track_visa_open_event
  AFTER INSERT ON public.visa_monitor_checks
  FOR EACH ROW
  EXECUTE FUNCTION public.track_visa_open_event();

-- 3) Backfill from existing checks (transitions only)
INSERT INTO public.visa_open_events (country_code, provider, opened_at, previous_status, detection_method, response_snippet, source_check_id)
SELECT country_code, provider, checked_at, previous_status, detection_method, response_snippet, id
FROM public.visa_monitor_checks
WHERE status = 'open' AND COALESCE(previous_status, '') <> 'open'
ORDER BY checked_at ASC
ON CONFLICT DO NOTHING;
