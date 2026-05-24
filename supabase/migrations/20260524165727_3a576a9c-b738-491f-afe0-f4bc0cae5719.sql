CREATE TABLE public.alert_decisions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  country_code TEXT NOT NULL,
  provider TEXT NOT NULL,
  category TEXT,
  api_score INT NOT NULL DEFAULT 0,
  dom_score INT NOT NULL DEFAULT 0,
  calendar_score INT NOT NULL DEFAULT 0,
  playwright_score INT NOT NULL DEFAULT 0,
  confidence_score INT NOT NULL DEFAULT 0,
  threshold INT NOT NULL,
  decision TEXT NOT NULL CHECK (decision IN ('sent', 'blocked_low_score', 'blocked_cooldown', 'blocked_disabled', 'error')),
  block_reason TEXT,
  alert_id UUID,
  layer_details JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_alert_decisions_country_provider ON public.alert_decisions(country_code, provider, created_at DESC);
CREATE INDEX idx_alert_decisions_decision ON public.alert_decisions(decision, created_at DESC);
CREATE INDEX idx_alert_decisions_created_at ON public.alert_decisions(created_at DESC);

ALTER TABLE public.alert_decisions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins view alert decisions"
ON public.alert_decisions FOR SELECT
USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins delete alert decisions"
ON public.alert_decisions FOR DELETE
USING (public.has_role(auth.uid(), 'admin'::app_role));