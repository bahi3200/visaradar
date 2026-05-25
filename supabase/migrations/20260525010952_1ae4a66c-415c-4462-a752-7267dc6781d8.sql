REVOKE EXECUTE ON FUNCTION public.should_quarantine_proxy(text, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.record_stealth_metric(text,text,uuid,text,boolean,text,int,int,boolean,boolean,int,text,jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_stealth_dashboard_stats(int) TO authenticated;