-- Conversations table
CREATE TABLE public.chat_conversations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  title TEXT NOT NULL DEFAULT 'محادثة جديدة',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_chat_conversations_user ON public.chat_conversations(user_id, updated_at DESC);

ALTER TABLE public.chat_conversations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own conversations" ON public.chat_conversations
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users insert own conversations" ON public.chat_conversations
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own conversations" ON public.chat_conversations
  FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users delete own conversations" ON public.chat_conversations
  FOR DELETE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Admins view all conversations" ON public.chat_conversations
  FOR SELECT TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER update_chat_conversations_updated_at
  BEFORE UPDATE ON public.chat_conversations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Messages table
CREATE TABLE public.chat_messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  conversation_id UUID NOT NULL REFERENCES public.chat_conversations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_chat_messages_conversation ON public.chat_messages(conversation_id, created_at);

ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own messages" ON public.chat_messages
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users insert own messages" ON public.chat_messages
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users delete own messages" ON public.chat_messages
  FOR DELETE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Admins view all messages" ON public.chat_messages
  FOR SELECT TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));

-- Bump conversation updated_at when a new message is added
CREATE OR REPLACE FUNCTION public.bump_conversation_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.chat_conversations SET updated_at = now() WHERE id = NEW.conversation_id;
  RETURN NEW;
END;
$$;

CREATE TRIGGER bump_conv_on_new_message
  AFTER INSERT ON public.chat_messages
  FOR EACH ROW EXECUTE FUNCTION public.bump_conversation_updated_at();