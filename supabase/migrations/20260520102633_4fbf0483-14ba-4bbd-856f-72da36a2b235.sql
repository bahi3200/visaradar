CREATE OR REPLACE FUNCTION public.validate_subscription_countries()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_max_countries INT;
  v_invalid TEXT[];
  v_normalized TEXT[];
  v_unique_count INT;
BEGIN
  -- Skip validation entirely for jobs-only subscriptions
  IF NEW.service_type = 'jobs' THEN
    RETURN NEW;
  END IF;

  -- Normalize country codes (uppercase) and strip empty entries
  SELECT COALESCE(array_agg(UPPER(TRIM(c))) FILTER (WHERE TRIM(c) <> ''), '{}')
    INTO v_normalized
    FROM unnest(COALESCE(NEW.countries, '{}'::text[])) AS c;

  NEW.countries := v_normalized;

  -- Must have at least one country for visa/both service types
  IF array_length(v_normalized, 1) IS NULL OR array_length(v_normalized, 1) = 0 THEN
    RAISE EXCEPTION 'يجب اختيار دولة واحدة على الأقل لهذا النوع من الخدمة'
      USING ERRCODE = 'check_violation';
  END IF;

  -- No duplicates
  SELECT COUNT(DISTINCT c) INTO v_unique_count FROM unnest(v_normalized) AS c;
  IF v_unique_count <> array_length(v_normalized, 1) THEN
    RAISE EXCEPTION 'توجد دول مكرّرة في الاختيار'
      USING ERRCODE = 'check_violation';
  END IF;

  -- Whitelist check against provider_centers
  SELECT COALESCE(array_agg(c), '{}') INTO v_invalid
  FROM unnest(v_normalized) AS c
  WHERE c NOT IN (SELECT DISTINCT country_code FROM public.provider_centers);

  IF array_length(v_invalid, 1) IS NOT NULL AND array_length(v_invalid, 1) > 0 THEN
    RAISE EXCEPTION 'دول غير مدعومة في النظام: %', array_to_string(v_invalid, ', ')
      USING ERRCODE = 'check_violation';
  END IF;

  -- Enforce package max_countries
  SELECT max_countries INTO v_max_countries
  FROM public.packages
  WHERE id = NEW.package_id;

  IF v_max_countries IS NULL THEN
    RAISE EXCEPTION 'الباقة المحددة غير موجودة'
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  IF array_length(v_normalized, 1) > v_max_countries THEN
    RAISE EXCEPTION 'الباقة تسمح بحد أقصى % دول — اخترت %', v_max_countries, array_length(v_normalized, 1)
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.validate_subscription_countries() FROM PUBLIC, authenticated, anon;

DROP TRIGGER IF EXISTS trg_validate_request_countries ON public.subscription_requests;
CREATE TRIGGER trg_validate_request_countries
  BEFORE INSERT OR UPDATE OF countries, package_id, service_type ON public.subscription_requests
  FOR EACH ROW EXECUTE FUNCTION public.validate_subscription_countries();

DROP TRIGGER IF EXISTS trg_validate_subscription_countries ON public.subscriptions;
CREATE TRIGGER trg_validate_subscription_countries
  BEFORE INSERT OR UPDATE OF countries, package_id, service_type ON public.subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.validate_subscription_countries();