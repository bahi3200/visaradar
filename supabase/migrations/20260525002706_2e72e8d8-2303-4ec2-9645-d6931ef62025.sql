
REVOKE EXECUTE ON FUNCTION public.recompute_provider_risk(TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.recompute_provider_risk(TEXT) TO service_role;
