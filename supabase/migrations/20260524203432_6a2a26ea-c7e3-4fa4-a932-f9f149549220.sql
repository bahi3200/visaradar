
-- Remove sensitive tables from realtime publication to prevent broadcast leaks
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'alert_delivery_log',
    'contact_message_replies',
    'subscription_requests',
    'telegram_link_log',
    'subscriptions',
    'profiles'
  ] LOOP
    BEGIN
      EXECUTE format('ALTER PUBLICATION supabase_realtime DROP TABLE public.%I', t);
    EXCEPTION WHEN OTHERS THEN
      -- table not in publication, ignore
      NULL;
    END;
  END LOOP;
END $$;

-- Lock down realtime.messages: only admins can subscribe to any channel by default.
-- Specific user-scoped channels can be added later if needed.
ALTER TABLE IF EXISTS realtime.messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins only realtime access" ON realtime.messages;
CREATE POLICY "Admins only realtime access"
ON realtime.messages
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role));
