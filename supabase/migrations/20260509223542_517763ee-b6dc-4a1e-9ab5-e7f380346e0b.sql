-- Helper to safely revoke from PUBLIC and anon, then grant only where needed
DO $$
DECLARE
  fn record;
BEGIN
  -- All SECURITY DEFINER functions in public schema
  FOR fn IN
    SELECT p.oid, p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prosecdef = true
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.%I(%s) FROM PUBLIC, anon, authenticated',
                   fn.proname, fn.args);
  END LOOP;
END$$;

-- Grant EXECUTE back only to authenticated for RPCs the app actually calls
GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.count_active_devices(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_device_allowed(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_payment_info() TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_promo_input_method(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_package_promo(uuid, numeric, timestamptz, timestamptz, text) TO authenticated;

-- Trigger-only functions remain with no EXECUTE grants to anon/authenticated.
-- They still run via triggers because triggers execute under the table owner, not the caller.

-- service_role retains full access by default (bypasses these grants).
