-- Audit log for promo changes on packages
CREATE TABLE public.package_promo_audit_log (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  package_id UUID NOT NULL,
  changed_by UUID,
  action TEXT NOT NULL, -- 'activated' | 'deactivated' | 'updated' | 'scheduled'
  old_promo_price NUMERIC,
  new_promo_price NUMERIC,
  old_starts_at TIMESTAMPTZ,
  new_starts_at TIMESTAMPTZ,
  old_ends_at TIMESTAMPTZ,
  new_ends_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_promo_audit_package ON public.package_promo_audit_log(package_id, created_at DESC);

ALTER TABLE public.package_promo_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins view promo audit"
ON public.package_promo_audit_log
FOR SELECT TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Service role full access promo audit"
ON public.package_promo_audit_log
FOR ALL TO service_role
USING (true) WITH CHECK (true);

-- Trigger function: log only when promo fields actually change
CREATE OR REPLACE FUNCTION public.log_package_promo_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_action TEXT;
  v_old_active BOOLEAN;
  v_new_active BOOLEAN;
  v_changed BOOLEAN;
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

  INSERT INTO public.package_promo_audit_log (
    package_id, changed_by, action,
    old_promo_price, new_promo_price,
    old_starts_at, new_starts_at,
    old_ends_at, new_ends_at
  ) VALUES (
    NEW.id, auth.uid(), v_action,
    OLD.promo_price, NEW.promo_price,
    OLD.promo_starts_at, NEW.promo_starts_at,
    OLD.promo_ends_at, NEW.promo_ends_at
  );

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_log_package_promo_change
AFTER UPDATE ON public.packages
FOR EACH ROW
EXECUTE FUNCTION public.log_package_promo_change();