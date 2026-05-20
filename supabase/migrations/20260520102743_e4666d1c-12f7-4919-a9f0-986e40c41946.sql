
ALTER TABLE public.subscription_requests ADD COLUMN IF NOT EXISTS monitoring_scopes JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS monitoring_scopes JSONB NOT NULL DEFAULT '{}'::jsonb;

-- Validate that monitoring_scopes values are only 'centers_only' or 'all_sites' and keys are uppercase country codes
CREATE OR REPLACE FUNCTION public.validate_monitoring_scopes()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  k TEXT;
  v TEXT;
BEGIN
  IF NEW.monitoring_scopes IS NULL OR NEW.monitoring_scopes = '{}'::jsonb THEN
    RETURN NEW;
  END IF;

  IF jsonb_typeof(NEW.monitoring_scopes) <> 'object' THEN
    RAISE EXCEPTION 'monitoring_scopes must be a JSON object'
      USING ERRCODE = 'check_violation';
  END IF;

  FOR k, v IN SELECT key, value::text FROM jsonb_each_text(NEW.monitoring_scopes) LOOP
    IF k !~ '^[A-Z]{2}$' THEN
      RAISE EXCEPTION 'مفتاح غير صالح في monitoring_scopes: %', k
        USING ERRCODE = 'check_violation';
    END IF;
    IF v NOT IN ('centers_only', 'all_sites') THEN
      RAISE EXCEPTION 'قيمة غير صالحة في monitoring_scopes للدولة %: % — يجب أن تكون centers_only أو all_sites', k, v
        USING ERRCODE = 'check_violation';
    END IF;
    IF NOT (NEW.countries @> ARRAY[k]) THEN
      RAISE EXCEPTION 'monitoring_scopes يحتوي على دولة غير مختارة: %', k
        USING ERRCODE = 'check_violation';
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.validate_monitoring_scopes() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_validate_request_monitoring_scopes ON public.subscription_requests;
CREATE TRIGGER trg_validate_request_monitoring_scopes
BEFORE INSERT OR UPDATE OF monitoring_scopes, countries ON public.subscription_requests
FOR EACH ROW EXECUTE FUNCTION public.validate_monitoring_scopes();

DROP TRIGGER IF EXISTS trg_validate_subscription_monitoring_scopes ON public.subscriptions;
CREATE TRIGGER trg_validate_subscription_monitoring_scopes
BEFORE INSERT OR UPDATE OF monitoring_scopes, countries ON public.subscriptions
FOR EACH ROW EXECUTE FUNCTION public.validate_monitoring_scopes();
