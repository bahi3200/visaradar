-- Browser verification results
CREATE TABLE public.browser_verifications (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  country_code TEXT NOT NULL,
  provider TEXT NOT NULL,
  url TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('open', 'closed', 'error', 'unknown')),
  booking_buttons_count INT NOT NULL DEFAULT 0,
  calendar_detected BOOLEAN NOT NULL DEFAULT false,
  available_dates_count INT NOT NULL DEFAULT 0,
  no_appointments_text_found BOOLEAN NOT NULL DEFAULT false,
  page_text_snippet TEXT,
  detection_details JSONB DEFAULT '{}'::jsonb,
  xhr_requests JSONB DEFAULT '[]'::jsonb,
  screenshot_path TEXT,
  load_time_ms INT,
  user_agent TEXT,
  worker_id TEXT,
  error_message TEXT,
  checked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_browser_verif_country_provider ON public.browser_verifications(country_code, provider, checked_at DESC);
CREATE INDEX idx_browser_verif_status ON public.browser_verifications(status, checked_at DESC);
CREATE INDEX idx_browser_verif_checked_at ON public.browser_verifications(checked_at DESC);

ALTER TABLE public.browser_verifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view all browser verifications"
ON public.browser_verifications FOR SELECT
USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete browser verifications"
ON public.browser_verifications FOR DELETE
USING (public.has_role(auth.uid(), 'admin'::app_role));

-- Worker tokens for VPS authentication
CREATE TABLE public.browser_worker_tokens (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  worker_name TEXT NOT NULL UNIQUE,
  token_hash TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  last_used_at TIMESTAMPTZ,
  total_requests INT NOT NULL DEFAULT 0,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.browser_worker_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage worker tokens"
ON public.browser_worker_tokens FOR ALL
USING (public.has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

-- Screenshot storage bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('browser-screenshots', 'browser-screenshots', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Admins view browser screenshots"
ON storage.objects FOR SELECT
USING (bucket_id = 'browser-screenshots' AND public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins delete browser screenshots"
ON storage.objects FOR DELETE
USING (bucket_id = 'browser-screenshots' AND public.has_role(auth.uid(), 'admin'::app_role));