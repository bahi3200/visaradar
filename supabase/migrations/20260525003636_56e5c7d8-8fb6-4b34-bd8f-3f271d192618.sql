
-- Clean up and enforce strict realtime.messages policies
DROP POLICY IF EXISTS "Admins only realtime access" ON realtime.messages;
DROP POLICY IF EXISTS "Admins subscribe realtime" ON realtime.messages;
DROP POLICY IF EXISTS "Owners subscribe own realtime channels" ON realtime.messages;
DROP POLICY IF EXISTS "Public realtime channels readable" ON realtime.messages;
DROP POLICY IF EXISTS "Admins full realtime access" ON realtime.messages;
DROP POLICY IF EXISTS "Owners access own realtime channels" ON realtime.messages;
DROP POLICY IF EXISTS "Authenticated access public realtime" ON realtime.messages;

ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY;

-- 1) Admins: full access to any channel (subscribe + broadcast + presence)
CREATE POLICY "Admins full realtime access"
ON realtime.messages
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::public.app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

-- 2) Owners: can subscribe to and broadcast on their own personal channels
--    Allowed topics: user:<uid>  or  private:<uid>:*
CREATE POLICY "Owners access own realtime channels"
ON realtime.messages
FOR ALL
TO authenticated
USING (
  auth.uid() IS NOT NULL
  AND (
    realtime.topic() = ('user:' || auth.uid()::text)
    OR realtime.topic() LIKE ('private:' || auth.uid()::text || ':%')
  )
)
WITH CHECK (
  auth.uid() IS NOT NULL
  AND (
    realtime.topic() = ('user:' || auth.uid()::text)
    OR realtime.topic() LIKE ('private:' || auth.uid()::text || ':%')
  )
);

-- 3) Public channels: any authenticated user may subscribe (read), but NOT broadcast
CREATE POLICY "Authenticated read public realtime"
ON realtime.messages
FOR SELECT
TO authenticated
USING (realtime.topic() LIKE 'public:%');
