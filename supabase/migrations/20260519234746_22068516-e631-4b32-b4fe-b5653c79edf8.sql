
CREATE TABLE public.payment_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  subscription_id uuid,
  event_type text NOT NULL,
  status text NOT NULL DEFAULT 'info',
  provider text,
  amount numeric,
  currency text,
  reference text,
  metadata jsonb DEFAULT '{}'::jsonb,
  message text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_payment_events_user ON public.payment_events(user_id, created_at DESC);
CREATE INDEX idx_payment_events_sub ON public.payment_events(subscription_id, created_at DESC);

ALTER TABLE public.payment_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own payment events"
ON public.payment_events FOR SELECT TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Admins view all payment events"
ON public.payment_events FOR SELECT TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins insert payment events"
ON public.payment_events FOR INSERT TO authenticated
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Service role full access payment events"
ON public.payment_events FOR ALL TO service_role
USING (true) WITH CHECK (true);
