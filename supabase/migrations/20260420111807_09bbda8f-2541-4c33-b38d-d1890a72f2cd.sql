-- Track per-user AI chat usage for rate limiting
CREATE TABLE public.chat_rate_limits (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_chat_rate_limits_user_time
  ON public.chat_rate_limits (user_id, created_at DESC);

ALTER TABLE public.chat_rate_limits ENABLE ROW LEVEL SECURITY;

-- Users can see their own usage (for debugging / showing remaining quota)
CREATE POLICY "Users view own rate limit entries"
  ON public.chat_rate_limits
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Admins can see everything
CREATE POLICY "Admins view all rate limit entries"
  ON public.chat_rate_limits
  FOR SELECT
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

-- Only the service role (edge function) writes entries
CREATE POLICY "Service role manages rate limits"
  ON public.chat_rate_limits
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);