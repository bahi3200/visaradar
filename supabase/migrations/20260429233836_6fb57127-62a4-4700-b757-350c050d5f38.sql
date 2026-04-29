-- Add input_method column to promo audit log to track how the change was entered
ALTER TABLE public.package_promo_audit_log
ADD COLUMN IF NOT EXISTS input_method TEXT;

-- Update the trigger function to read input method from a session GUC set by the client
CREATE OR REPLACE FUNCTION public.log_package_promo_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_action TEXT;
  v_old_active BOOLEAN;
  v_new_active BOOLEAN;
  v_changed BOOLEAN;
  v_input_method TEXT;
BEGIN
  v_changed := (OLD.promo_price IS DISTINCT FROM NEW.promo_price)
            OR (OLD.promo_starts_at IS DISTINCT FROM NEW.promo_starts_at)
            OR (OLD.promo_ends_at IS DISTINCT FROM NEW.promo_ends_at);

  IF NOT v_changed THEN
    RETURN NEW;
  END IF;

  v_old_active := OLD.promo_price IS NOT NULL
                AND OLD.promo_price < COALESCE(OLD.price, 0)
                AND (OLD.promo_starts_at IS NULL OR OLD.promo_starts_at <= now())
                AND (OLD.promo_ends_at IS NULL OR OLD.promo_ends_at > now());
  v_new_active := NEW.promo_price IS NOT NULL
                AND NEW.promo_price < COALESCE(NEW.price, 0)
                AND (NEW.promo_starts_at IS NULL OR NEW.promo_starts_at <= now())
                AND (NEW.promo_ends_at IS NULL OR NEW.promo_ends_at > now());

  IF NEW.promo_price IS NULL AND OLD.promo_price IS NOT NULL THEN
    v_action := 'deactivated';
  ELSIF OLD.promo_price IS NULL AND NEW.promo_price IS NOT NULL AND NEW.promo_starts_at IS NOT NULL AND NEW.promo_starts_at > now() THEN
    v_action := 'scheduled';
  ELSIF OLD.promo_price IS NULL AND NEW.promo_price IS NOT NULL THEN
    v_action := 'activated';
  ELSIF NOT v_old_active AND v_new_active THEN
    v_action := 'activated';
  ELSIF v_old_active AND NOT v_new_active THEN
    v_action := 'deactivated';
  ELSE
    v_action := 'updated';
  END IF;

  -- Read client-provided input method (set via SET LOCAL app.promo_input_method = '...')
  -- Falls back to NULL if not set. Possible values: 'pct' | 'price' | 'date' | 'unknown'.
  BEGIN
    v_input_method := current_setting('app.promo_input_method', true);
  EXCEPTION WHEN OTHERS THEN
    v_input_method := NULL;
  END;

  IF v_input_method = '' THEN
    v_input_method := NULL;
  END IF;

  INSERT INTO public.package_promo_audit_log (
    package_id, changed_by, action, input_method,
    old_promo_price, new_promo_price,
    old_starts_at, new_starts_at,
    old_ends_at, new_ends_at
  ) VALUES (
    NEW.id, auth.uid(), v_action, v_input_method,
    OLD.promo_price, NEW.promo_price,
    OLD.promo_starts_at, NEW.promo_starts_at,
    OLD.promo_ends_at, NEW.promo_ends_at
  );

  RETURN NEW;
END;
$function$;

-- Helper RPC the client calls inside the same transaction before UPDATE
CREATE OR REPLACE FUNCTION public.set_promo_input_method(_method TEXT)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF _method NOT IN ('pct', 'price', 'date', 'unknown') THEN
    _method := 'unknown';
  END IF;
  PERFORM set_config('app.promo_input_method', _method, true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_promo_input_method(TEXT) TO authenticated;