-- Add telegram link token columns to profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS telegram_link_token text,
  ADD COLUMN IF NOT EXISTS telegram_link_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS telegram_username text;

CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_telegram_link_token
  ON public.profiles (telegram_link_token)
  WHERE telegram_link_token IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_profiles_telegram_id
  ON public.profiles (telegram_id)
  WHERE telegram_id IS NOT NULL;

-- Singleton table to track getUpdates offset
CREATE TABLE IF NOT EXISTS public.telegram_bot_state (
  id int PRIMARY KEY CHECK (id = 1),
  update_offset bigint NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.telegram_bot_state (id, update_offset)
VALUES (1, 0)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.telegram_bot_state ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role full access bot state" ON public.telegram_bot_state;
CREATE POLICY "Service role full access bot state"
  ON public.telegram_bot_state FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Admins can view bot state" ON public.telegram_bot_state;
CREATE POLICY "Admins can view bot state"
  ON public.telegram_bot_state FOR SELECT
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

-- Log of link events for auditing
CREATE TABLE IF NOT EXISTS public.telegram_link_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  chat_id text NOT NULL,
  username text,
  action text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.telegram_link_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role full access link log" ON public.telegram_link_log;
CREATE POLICY "Service role full access link log"
  ON public.telegram_link_log FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Admins view link log" ON public.telegram_link_log;
CREATE POLICY "Admins view link log"
  ON public.telegram_link_log FOR SELECT
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Users view own link log" ON public.telegram_link_log;
CREATE POLICY "Users view own link log"
  ON public.telegram_link_log FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);