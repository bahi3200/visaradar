-- 1. New columns on visa_monitor_checks
ALTER TABLE public.visa_monitor_checks
  ADD COLUMN IF NOT EXISTS confidence_score INTEGER,
  ADD COLUMN IF NOT EXISTS signal_breakdown JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS worker_id TEXT;

CREATE INDEX IF NOT EXISTS idx_vmc_confidence ON public.visa_monitor_checks(confidence_score) WHERE confidence_score IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_vmc_worker ON public.visa_monitor_checks(worker_id, checked_at DESC);

-- 2. detection_evidence
CREATE TABLE IF NOT EXISTS public.detection_evidence (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  check_id UUID NOT NULL REFERENCES public.visa_monitor_checks(id) ON DELETE CASCADE,
  country_code TEXT NOT NULL,
  provider TEXT NOT NULL,
  evidence_type TEXT NOT NULL CHECK (evidence_type IN ('html_snapshot','api_response','console_log','screenshot_url','network_trace')),
  content TEXT,
  url TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_evidence_check ON public.detection_evidence(check_id);
CREATE INDEX IF NOT EXISTS idx_evidence_country_time ON public.detection_evidence(country_code, created_at DESC);
ALTER TABLE public.detection_evidence ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins view evidence" ON public.detection_evidence FOR SELECT TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Service role full access evidence" ON public.detection_evidence FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 3. worker_health
CREATE TABLE IF NOT EXISTS public.worker_health (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_id TEXT NOT NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ,
  duration_ms INTEGER,
  checks_attempted INTEGER NOT NULL DEFAULT 0,
  checks_succeeded INTEGER NOT NULL DEFAULT 0,
  checks_failed INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running','completed','crashed','timeout')),
  error_message TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_worker_health_time ON public.worker_health(started_at DESC);
CREATE INDEX IF NOT EXISTS idx_worker_health_status ON public.worker_health(status, started_at DESC);
ALTER TABLE public.worker_health ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins view worker health" ON public.worker_health FOR SELECT TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Service role full access worker health" ON public.worker_health FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 4. alert_dedup
CREATE TABLE IF NOT EXISTS public.alert_dedup (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dedup_key TEXT NOT NULL UNIQUE,
  country_code TEXT NOT NULL,
  provider TEXT NOT NULL,
  alert_type TEXT NOT NULL,
  first_sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  send_count INTEGER NOT NULL DEFAULT 1,
  cooldown_until TIMESTAMPTZ NOT NULL DEFAULT now() + interval '15 minutes',
  metadata JSONB DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS idx_alert_dedup_cooldown ON public.alert_dedup(cooldown_until);
CREATE INDEX IF NOT EXISTS idx_alert_dedup_country ON public.alert_dedup(country_code, provider);
ALTER TABLE public.alert_dedup ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins view alert dedup" ON public.alert_dedup FOR SELECT TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Service role full access alert dedup" ON public.alert_dedup FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 5. scan_priorities
CREATE TABLE IF NOT EXISTS public.scan_priorities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  country_code TEXT NOT NULL UNIQUE,
  priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('high','medium','low','paused')),
  base_interval_seconds INTEGER NOT NULL DEFAULT 60,
  current_interval_seconds INTEGER NOT NULL DEFAULT 60,
  last_scanned_at TIMESTAMPTZ,
  cooldown_until TIMESTAMPTZ,
  consecutive_failures INTEGER NOT NULL DEFAULT 0,
  ban_detected_count INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_priorities_next_scan ON public.scan_priorities(priority, last_scanned_at);
ALTER TABLE public.scan_priorities ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage scan priorities" ON public.scan_priorities FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Service role full access scan priorities" ON public.scan_priorities FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Seed defaults for the 5 known countries
INSERT INTO public.scan_priorities (country_code, priority, base_interval_seconds, current_interval_seconds) VALUES
  ('IT', 'high', 60, 60),
  ('FR', 'high', 60, 60),
  ('ES', 'medium', 120, 120),
  ('DE', 'medium', 120, 120),
  ('GR', 'low', 300, 300)
ON CONFLICT (country_code) DO NOTHING;

-- 6. false_positive_reports
CREATE TABLE IF NOT EXISTS public.false_positive_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  check_id UUID REFERENCES public.visa_monitor_checks(id) ON DELETE SET NULL,
  country_code TEXT NOT NULL,
  provider TEXT NOT NULL,
  reported_by UUID,
  reporter_type TEXT NOT NULL DEFAULT 'admin' CHECK (reporter_type IN ('admin','user','system')),
  reason TEXT,
  resolved BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_fp_country ON public.false_positive_reports(country_code, created_at DESC);
ALTER TABLE public.false_positive_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage false positives" ON public.false_positive_reports FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Users report false positives" ON public.false_positive_reports FOR INSERT TO authenticated WITH CHECK (auth.uid() = reported_by AND reporter_type = 'user');
CREATE POLICY "Service role full access fp" ON public.false_positive_reports FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 7. outbound_webhooks
CREATE TABLE IF NOT EXISTS public.outbound_webhooks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  url TEXT NOT NULL,
  secret TEXT,
  countries TEXT[] NOT NULL DEFAULT '{}',
  event_types TEXT[] NOT NULL DEFAULT '{visa_opened}',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID,
  failure_count INTEGER NOT NULL DEFAULT 0,
  last_success_at TIMESTAMPTZ,
  last_failure_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.outbound_webhooks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage webhooks" ON public.outbound_webhooks FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Service role full access webhooks" ON public.outbound_webhooks FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 8. webhook_delivery_log
CREATE TABLE IF NOT EXISTS public.webhook_delivery_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  webhook_id UUID NOT NULL REFERENCES public.outbound_webhooks(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL,
  response_status INTEGER,
  response_body TEXT,
  attempt_count INTEGER NOT NULL DEFAULT 1,
  success BOOLEAN NOT NULL DEFAULT false,
  error_message TEXT,
  delivered_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_webhook_log_webhook ON public.webhook_delivery_log(webhook_id, delivered_at DESC);
ALTER TABLE public.webhook_delivery_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins view webhook logs" ON public.webhook_delivery_log FOR SELECT TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Service role full access webhook logs" ON public.webhook_delivery_log FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 9. provider_adapters_config
CREATE TABLE IF NOT EXISTS public.provider_adapters_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  confidence_weights JSONB NOT NULL DEFAULT '{"api":40,"dom":25,"script":20,"calendar":15}'::jsonb,
  signal_thresholds JSONB NOT NULL DEFAULT '{"open":70,"closed":40}'::jsonb,
  rate_limit_per_minute INTEGER NOT NULL DEFAULT 10,
  use_render BOOLEAN NOT NULL DEFAULT false,
  notes TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.provider_adapters_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage adapter config" ON public.provider_adapters_config FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Authenticated read adapter config" ON public.provider_adapters_config FOR SELECT TO authenticated USING (true);
CREATE POLICY "Service role full access adapter config" ON public.provider_adapters_config FOR ALL TO service_role USING (true) WITH CHECK (true);

INSERT INTO public.provider_adapters_config (provider, display_name, rate_limit_per_minute, use_render) VALUES
  ('VFS Global', 'VFS Global', 10, false),
  ('TLScontact', 'TLScontact', 10, false),
  ('BLS International', 'BLS International', 8, true),
  ('Almaviva', 'Almaviva', 8, true)
ON CONFLICT (provider) DO NOTHING;

-- Triggers
CREATE TRIGGER trg_scan_priorities_updated BEFORE UPDATE ON public.scan_priorities
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_webhooks_updated BEFORE UPDATE ON public.outbound_webhooks
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_adapter_config_updated BEFORE UPDATE ON public.provider_adapters_config
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();