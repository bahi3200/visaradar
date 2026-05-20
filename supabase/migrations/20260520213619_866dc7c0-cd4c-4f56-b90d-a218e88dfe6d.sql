
CREATE TABLE public.visa_external_signals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  country_code text NOT NULL,
  category text,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','closed','info')),
  title_ar text NOT NULL,
  message_ar text,
  source text,
  source_url text,
  posted_by uuid NOT NULL,
  broadcast_status text NOT NULL DEFAULT 'pending' CHECK (broadcast_status IN ('pending','sent','failed','skipped')),
  recipients_count int NOT NULL DEFAULT 0,
  broadcast_error text,
  broadcasted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_visa_external_signals_country_created
  ON public.visa_external_signals (country_code, created_at DESC);

ALTER TABLE public.visa_external_signals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage external signals"
  ON public.visa_external_signals FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Moderators insert external signals"
  ON public.visa_external_signals FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'moderator'::app_role) AND posted_by = auth.uid());

CREATE POLICY "Moderators view external signals"
  ON public.visa_external_signals FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'moderator'::app_role));

CREATE POLICY "Authenticated view recent signals"
  ON public.visa_external_signals FOR SELECT
  TO authenticated
  USING (created_at > now() - interval '30 days');

CREATE POLICY "Service role full access external signals"
  ON public.visa_external_signals FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

ALTER TABLE public.visa_open_events
  ADD COLUMN IF NOT EXISTS category text;
