CREATE TABLE public.settings_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  changed_by uuid NOT NULL,
  setting_name text NOT NULL DEFAULT 'referral_bonus_days',
  old_referrer_days integer,
  new_referrer_days integer,
  old_referred_days integer,
  new_referred_days integer,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.settings_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view audit log"
ON public.settings_audit_log
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can insert audit log"
ON public.settings_audit_log
FOR INSERT
TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'));