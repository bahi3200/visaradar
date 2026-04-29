-- Atomic RPC: sets the promo input method for the audit trigger, then updates the package fields.
-- All within a single transaction so the GUC is visible to the trigger.
CREATE OR REPLACE FUNCTION public.update_package_promo(
  _package_id UUID,
  _promo_price NUMERIC,
  _promo_starts_at TIMESTAMPTZ,
  _promo_ends_at TIMESTAMPTZ,
  _input_method TEXT
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Admin-only
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Only admins can update package promos';
  END IF;

  IF _input_method NOT IN ('pct', 'price', 'date', 'unknown') THEN
    _input_method := 'unknown';
  END IF;

  -- Set the GUC for the audit trigger to read in this same transaction
  PERFORM set_config('app.promo_input_method', _input_method, true);

  UPDATE public.packages
  SET promo_price = _promo_price,
      promo_starts_at = _promo_starts_at,
      promo_ends_at = _promo_ends_at,
      updated_at = now()
  WHERE id = _package_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Package % not found', _package_id;
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.update_package_promo(UUID, NUMERIC, TIMESTAMPTZ, TIMESTAMPTZ, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_package_promo(UUID, NUMERIC, TIMESTAMPTZ, TIMESTAMPTZ, TEXT) TO authenticated;