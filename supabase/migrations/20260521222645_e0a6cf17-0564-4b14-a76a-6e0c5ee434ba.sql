-- Allow admins to start a conversation with any user by inserting a contact_messages row on their behalf
CREATE POLICY "Admins can create contact messages"
ON public.contact_messages
FOR INSERT
TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));