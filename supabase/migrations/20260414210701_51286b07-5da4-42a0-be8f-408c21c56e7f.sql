
CREATE TABLE public.referral_reward_log (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  referral_id UUID NOT NULL,
  action TEXT NOT NULL, -- 'grant' or 'revoke'
  reward_type TEXT NOT NULL, -- 'referrer' or 'referred'
  bonus_days INTEGER NOT NULL DEFAULT 0,
  target_user_id UUID NOT NULL,
  performed_by UUID NOT NULL,
  extension_applied BOOLEAN NOT NULL DEFAULT false,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.referral_reward_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view reward log" ON public.referral_reward_log
  FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Service role full access reward log" ON public.referral_reward_log
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);
