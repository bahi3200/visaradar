-- Lock down internal HVG SECURITY DEFINER functions to service_role only.
-- Keep hvg_resolve_challenge public (it is token-gated and called from /verify/:token).

REVOKE EXECUTE ON FUNCTION public.hvg_create_challenge(text, text, text, uuid, uuid, text, integer, text, smallint) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.hvg_pick_session(text, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.hvg_record_outcome(uuid, text, integer, integer, text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.hvg_dashboard(integer) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.hvg_create_challenge(text, text, text, uuid, uuid, text, integer, text, smallint) TO service_role;
GRANT EXECUTE ON FUNCTION public.hvg_pick_session(text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.hvg_record_outcome(uuid, text, integer, integer, text, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.hvg_dashboard(integer) TO service_role;