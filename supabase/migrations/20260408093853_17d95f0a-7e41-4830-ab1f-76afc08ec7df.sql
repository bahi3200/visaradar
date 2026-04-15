
-- Table to track visa site monitoring results
CREATE TABLE public.visa_monitor_checks (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  country_code TEXT NOT NULL,
  provider TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'unknown',
  previous_status TEXT,
  response_snippet TEXT,
  error_message TEXT,
  checked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  notified BOOLEAN NOT NULL DEFAULT false
);

CREATE INDEX idx_visa_monitor_country ON public.visa_monitor_checks (country_code, checked_at DESC);

ALTER TABLE public.visa_monitor_checks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view monitor checks"
  ON public.visa_monitor_checks
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Service role can insert checks"
  ON public.visa_monitor_checks
  FOR INSERT
  TO authenticated
  WITH CHECK (true);
