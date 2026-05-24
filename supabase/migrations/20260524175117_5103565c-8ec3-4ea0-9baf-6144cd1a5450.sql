-- Revoke public/anon/authenticated EXECUTE on internal SECURITY DEFINER functions.
-- These are intended to be called only by edge functions running with the service role.

DO $$
DECLARE
  fn TEXT;
  sigs TEXT[] := ARRAY[
    'public.claim_alerts(text, integer)',
    'public.complete_alert(uuid, boolean, text, text)',
    'public.get_alert_delivery_stats()',
    'public.claim_scan_tasks(text, integer)',
    'public.complete_scan_task(uuid, boolean, integer, text)',
    'public.enqueue_scan_tasks(boolean)',
    'public.get_scan_throughput_stats()',
    'public.pick_next_proxy(text, text)',
    'public.pick_best_proxy(text, text, text)',
    'public.record_proxy_result(uuid, boolean, integer, integer, text, text)',
    'public.record_proxy_result(uuid, boolean, integer, integer, text, text, text, boolean, boolean)',
    'public.recompute_proxy_scores()',
    'public.record_ban_event(text, text, text, text, integer, integer, text, text)',
    'public.record_provider_success(text)',
    'public.compute_predictive_windows(integer)',
    'public.get_open_heatmap(text, text, integer)',
    'public.is_in_predictive_window(text, text, numeric)',
    'public.set_promo_input_method(text)',
    'public.update_package_promo(uuid, numeric, timestamptz, timestamptz, text)'
  ];
BEGIN
  FOREACH fn IN ARRAY sigs LOOP
    BEGIN
      EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', fn);
    EXCEPTION WHEN undefined_function THEN
      -- skip if signature doesn't exist
      NULL;
    END;
  END LOOP;
END $$;
