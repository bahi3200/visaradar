-- Replies thread for contact messages (admin <-> user)
CREATE TABLE public.contact_message_replies (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  message_id UUID NOT NULL REFERENCES public.contact_messages(id) ON DELETE CASCADE,
  sender_role TEXT NOT NULL CHECK (sender_role IN ('admin','user')),
  sender_id UUID NOT NULL,
  body TEXT NOT NULL,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_contact_message_replies_message ON public.contact_message_replies(message_id, created_at);

ALTER TABLE public.contact_message_replies ENABLE ROW LEVEL SECURITY;

-- Admins: full access
CREATE POLICY "Admins view all replies"
ON public.contact_message_replies FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins insert replies"
ON public.contact_message_replies FOR INSERT TO authenticated
WITH CHECK (
  public.has_role(auth.uid(), 'admin'::app_role)
  AND sender_role = 'admin'
  AND sender_id = auth.uid()
);

CREATE POLICY "Admins update replies"
ON public.contact_message_replies FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role));

-- Users: view replies on their own message thread
CREATE POLICY "Users view own thread replies"
ON public.contact_message_replies FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.contact_messages cm
    WHERE cm.id = contact_message_replies.message_id
      AND cm.user_id = auth.uid()
  )
);

-- Users: reply on their own thread
CREATE POLICY "Users insert own thread replies"
ON public.contact_message_replies FOR INSERT TO authenticated
WITH CHECK (
  sender_role = 'user'
  AND sender_id = auth.uid()
  AND EXISTS (
    SELECT 1 FROM public.contact_messages cm
    WHERE cm.id = contact_message_replies.message_id
      AND cm.user_id = auth.uid()
  )
);

-- Allow logged-in users to view their own contact_messages list
CREATE POLICY "Users view own contact messages"
ON public.contact_messages FOR SELECT TO authenticated
USING (user_id IS NOT NULL AND auth.uid() = user_id);

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.contact_message_replies;