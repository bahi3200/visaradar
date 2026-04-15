
DROP FUNCTION IF EXISTS public.get_payment_info();

CREATE FUNCTION public.get_payment_info()
RETURNS TABLE(ccp_number text, ccp_key text, account_holder text, rip_number text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT ccp_number, ccp_key, account_holder, rip_number
  FROM public.payment_settings
  LIMIT 1;
$$;
