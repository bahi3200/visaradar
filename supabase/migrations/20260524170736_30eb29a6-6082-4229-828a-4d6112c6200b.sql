
REVOKE ALL ON FUNCTION public.record_ban_event(TEXT,TEXT,TEXT,TEXT,INT,INT,TEXT,TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.record_provider_success(TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_ban_event(TEXT,TEXT,TEXT,TEXT,INT,INT,TEXT,TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.record_provider_success(TEXT) TO service_role;
