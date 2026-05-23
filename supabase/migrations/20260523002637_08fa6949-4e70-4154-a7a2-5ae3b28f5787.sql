
-- Snapshots of every monitoring probe's structured signals, used for diff detection
CREATE TABLE IF NOT EXISTS public.visa_content_signals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  country_code TEXT NOT NULL,
  provider TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'all',
  center_name TEXT,
  signal_hash TEXT NOT NULL,            -- stable hash of slot counts + dates + center list
  slot_count INTEGER,                   -- total slots seen across API responses
  centers_open TEXT[] DEFAULT '{}',     -- centers detected as open
  extracted_dates JSONB DEFAULT '[]',   -- [{date:'2026-01-15', center:'Algiers', source:'api'}, ...]
  earliest_date DATE,                   -- earliest extracted date (for quick filtering)
  raw_signal JSONB DEFAULT '{}',        -- full breakdown for debugging
  captured_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_visa_content_signals_lookup
  ON public.visa_content_signals (country_code, provider, category, captured_at DESC);

CREATE INDEX IF NOT EXISTS idx_visa_content_signals_hash
  ON public.visa_content_signals (country_code, provider, category, signal_hash);

ALTER TABLE public.visa_content_signals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins view all signals"
  ON public.visa_content_signals FOR SELECT
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Authenticated subscribers can read signals"
  ON public.visa_content_signals FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Service role full access content signals"
  ON public.visa_content_signals FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

-- Early-warning alerts log (preliminary signals before full confirmation)
CREATE TABLE IF NOT EXISTS public.visa_early_signals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  country_code TEXT NOT NULL,
  provider TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'all',
  center_name TEXT,
  signal_type TEXT NOT NULL,            -- 'diff_detected' | 'partial_open' | 'date_appeared'
  confidence INTEGER NOT NULL DEFAULT 50, -- 0-100
  details JSONB DEFAULT '{}',
  confirmed BOOLEAN DEFAULT FALSE,
  confirmed_at TIMESTAMPTZ,
  notified_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_visa_early_signals_recent
  ON public.visa_early_signals (country_code, category, created_at DESC);

ALTER TABLE public.visa_early_signals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins view all early signals"
  ON public.visa_early_signals FOR SELECT
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Authenticated can read early signals"
  ON public.visa_early_signals FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Service role full access early signals"
  ON public.visa_early_signals FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

-- Add center_name + extracted_dates to visa_monitor_checks for per-center tracking
ALTER TABLE public.visa_monitor_checks
  ADD COLUMN IF NOT EXISTS center_name TEXT,
  ADD COLUMN IF NOT EXISTS extracted_dates JSONB DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS slot_count INTEGER,
  ADD COLUMN IF NOT EXISTS earliest_date DATE;

CREATE INDEX IF NOT EXISTS idx_visa_monitor_checks_center
  ON public.visa_monitor_checks (country_code, center_name, checked_at DESC);

-- Same on visa_open_events
ALTER TABLE public.visa_open_events
  ADD COLUMN IF NOT EXISTS center_name TEXT,
  ADD COLUMN IF NOT EXISTS extracted_dates JSONB DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS earliest_date DATE;
