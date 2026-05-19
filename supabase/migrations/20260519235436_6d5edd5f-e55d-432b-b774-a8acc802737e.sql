
CREATE POLICY "Users insert own payment events"
ON public.payment_events FOR INSERT TO authenticated
WITH CHECK (auth.uid() = user_id);
