
CREATE TABLE public.monitored_telegram_sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chat_id TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  username TEXT,
  chat_type TEXT NOT NULL DEFAULT 'channel',
  country_code TEXT,
  category TEXT,
  keywords TEXT[] NOT NULL DEFAULT '{موعد,مواعيد,rdv,rendez-vous,appointment,slot,disponible,available,فتح,opened,open}'::text[],
  is_active BOOLEAN NOT NULL DEFAULT true,
  auto_broadcast BOOLEAN NOT NULL DEFAULT false,
  notes TEXT,
  last_post_at TIMESTAMPTZ,
  posts_captured INTEGER NOT NULL DEFAULT 0,
  added_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.monitored_telegram_sources ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage telegram sources"
  ON public.monitored_telegram_sources FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Service role full access telegram sources"
  ON public.monitored_telegram_sources FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE TRIGGER trg_monitored_telegram_sources_updated
  BEFORE UPDATE ON public.monitored_telegram_sources
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.telegram_channel_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id UUID REFERENCES public.monitored_telegram_sources(id) ON DELETE CASCADE,
  chat_id TEXT NOT NULL,
  message_id BIGINT NOT NULL,
  text TEXT,
  matched_keywords TEXT[] NOT NULL DEFAULT '{}'::text[],
  detected_country TEXT,
  detected_category TEXT,
  is_signal BOOLEAN NOT NULL DEFAULT false,
  broadcasted BOOLEAN NOT NULL DEFAULT false,
  broadcast_signal_id UUID,
  posted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  raw JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (chat_id, message_id)
);

ALTER TABLE public.telegram_channel_posts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins view channel posts"
  ON public.telegram_channel_posts FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Service role full access channel posts"
  ON public.telegram_channel_posts FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE INDEX idx_tg_posts_source ON public.telegram_channel_posts (source_id, posted_at DESC);
CREATE INDEX idx_tg_posts_signal ON public.telegram_channel_posts (is_signal, broadcasted, posted_at DESC);
