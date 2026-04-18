CREATE TABLE public.telegram_admin_messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  sender_id UUID NOT NULL,
  recipient_user_id UUID,
  chat_id TEXT NOT NULL,
  recipient_label TEXT,
  message TEXT NOT NULL,
  template_id TEXT,
  status TEXT NOT NULL DEFAULT 'sent',
  error_message TEXT,
  telegram_message_id BIGINT,
  batch_id UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_tg_admin_msgs_sender ON public.telegram_admin_messages(sender_id, created_at DESC);
CREATE INDEX idx_tg_admin_msgs_chat ON public.telegram_admin_messages(chat_id, created_at DESC);
CREATE INDEX idx_tg_admin_msgs_batch ON public.telegram_admin_messages(batch_id);

ALTER TABLE public.telegram_admin_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view admin messages"
  ON public.telegram_admin_messages
  FOR SELECT
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Service role full access admin messages"
  ON public.telegram_admin_messages
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);