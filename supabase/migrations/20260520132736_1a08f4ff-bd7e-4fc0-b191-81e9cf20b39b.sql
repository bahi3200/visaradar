CREATE OR REPLACE FUNCTION public.get_payment_info()
RETURNS TABLE(ccp_number text, ccp_key text, account_holder text, rip_number text)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- Require an authenticated user; payment info is needed to pay for subscriptions.
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Must be authenticated to read payment info';
  END IF;

  RETURN QUERY
    SELECT ps.ccp_number, ps.ccp_key, ps.account_holder, ps.rip_number
    FROM public.payment_settings ps
    LIMIT 1;
END;
$function$;