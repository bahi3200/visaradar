
-- Refine realtime channel subscription RLS
-- Drop the prior admin-only policy and replace with role-aware policies.
DROP POLICY IF EXISTS "Admins can subscribe to realtime channels" ON realtime.messages;
DROP POLICY IF EXISTS "Admins subscribe realtime" ON realtime.messages;
DROP POLICY IF EXISTS "Owners subscribe own realtime channels" ON realtime.messages;
DROP POLICY IF EXISTS "Public realtime channels readable" ON realtime.messages;

-- 1) Admins: full access to any channel
CREATE POLICY "Admins subscribe realtime"
ON realtime.messages
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role));

-- 2) Channel owners: topic must be 'user:{uid}' or 'private:{uid}:...'
CREATE POLICY "Owners subscribe own realtime channels"
ON realtime.messages
FOR SELECT
TO authenticated
USING (
  realtime.topic() = ('user:' || auth.uid()::text)
  OR realtime.topic() LIKE ('private:' || auth.uid()::text || ':%')
);

-- 3) Explicitly public channels (topic starts with 'public:')
CREATE POLICY "Public realtime channels readable"
ON realtime.messages
FOR SELECT
TO authenticated
USING (realtime.topic() LIKE 'public:%');
