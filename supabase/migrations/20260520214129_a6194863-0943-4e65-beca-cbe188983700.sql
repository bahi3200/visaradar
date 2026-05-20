-- Add category to visa_monitor_checks for per-visa-type tracking
ALTER TABLE public.visa_monitor_checks
  ADD COLUMN IF NOT EXISTS category text NOT NULL DEFAULT 'all';

CREATE INDEX IF NOT EXISTS idx_visa_monitor_country_category
  ON public.visa_monitor_checks (country_code, category, checked_at DESC);

-- Make sure visa_open_events has category (added previously, keep idempotent)
ALTER TABLE public.visa_open_events
  ADD COLUMN IF NOT EXISTS category text NOT NULL DEFAULT 'all';

-- Per-category open-event tracking (replace trigger function body, keep signature)
CREATE OR REPLACE FUNCTION public.track_visa_open_event()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Transition INTO open
  IF NEW.status = 'open' AND COALESCE(NEW.previous_status, '') <> 'open' THEN
    INSERT INTO public.visa_open_events (
      country_code, provider, category, opened_at, previous_status,
      detection_method, response_snippet, source_check_id
    ) VALUES (
      NEW.country_code, NEW.provider, COALESCE(NEW.category, 'all'), NEW.checked_at, NEW.previous_status,
      NEW.detection_method, NEW.response_snippet, NEW.id
    );
  END IF;

  -- Transition OUT of open (same country+provider+category)
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
        AND COALESCE(category, 'all') = COALESCE(NEW.category, 'all')
        AND closed_at IS NULL
      ORDER BY opened_at DESC
      LIMIT 1
    );
  END IF;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;
END;
$function$;

-- Per-category notifications: add category to visa_notifications
ALTER TABLE public.visa_notifications
  ADD COLUMN IF NOT EXISTS category text NOT NULL DEFAULT 'all';

CREATE INDEX IF NOT EXISTS idx_visa_notifications_country_category
  ON public.visa_notifications (country_code, category, created_at DESC);