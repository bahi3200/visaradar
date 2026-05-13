-- =========================================================
-- Lock down SECURITY DEFINER functions: revoke EXECUTE from
-- public/anon/authenticated for trigger and admin-only ones.
-- Keep needed client-facing helpers callable by authenticated.
-- =========================================================

-- Trigger functions — should never be called directly
DO $$
DECLARE
  fn text;
  fns text[] := ARRAY[
    'public.set_telegram_linked_at()',
    'public.bump_conversation_updated_at()',
    'public.generate_referral_code()',
    'public.handle_new_user()',
    'public.update_updated_at_column()',
    'public.log_telegram_link_change()',
    'public.log_package_promo_change()',
    'public.track_visa_open_event()',
    'public.trigger_telegram_failure_alert()'
  ];
BEGIN
  FOREACH fn IN ARRAY fns LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', fn);
  END LOOP;
END $$;

-- Admin-only RPCs — restrict EXECUTE to admins via grants is not granular,
-- but the function bodies already enforce admin checks. Still, narrow EXECUTE
-- so only authenticated users can attempt (and the body rejects non-admins).
REVOKE ALL ON FUNCTION public.get_payment_info() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.set_promo_input_method(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.update_package_promo(uuid, numeric, timestamptz, timestamptz, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_payment_info() TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_promo_input_method(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_package_promo(uuid, numeric, timestamptz, timestamptz, text) TO authenticated;

-- Wrap admin-only function bodies with explicit admin check (defense in depth)
CREATE OR REPLACE FUNCTION public.get_payment_info()
RETURNS TABLE(ccp_number text, ccp_key text, account_holder text, rip_number text)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Only admins can read payment info';
  END IF;
  RETURN QUERY
    SELECT ps.ccp_number, ps.ccp_key, ps.account_holder, ps.rip_number
    FROM public.payment_settings ps
    LIMIT 1;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_promo_input_method(_method text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Only admins can set promo input method';
  END IF;
  IF _method NOT IN ('pct', 'price', 'date', 'unknown') THEN
    _method := 'unknown';
  END IF;
  PERFORM set_config('app.promo_input_method', _method, true);
END;
$$;

-- Client-facing helpers used by hooks/RLS — keep callable by authenticated
REVOKE ALL ON FUNCTION public.has_role(uuid, app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO authenticated;

REVOKE ALL ON FUNCTION public.count_active_devices(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.count_active_devices(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.is_device_allowed(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_device_allowed(uuid, text) TO authenticated;
