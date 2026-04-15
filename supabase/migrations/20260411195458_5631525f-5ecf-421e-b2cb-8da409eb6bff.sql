
CREATE TABLE public.email_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_email text NOT NULL,
  recipient_name text DEFAULT '',
  subject text NOT NULL,
  html_body text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  sent_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.email_notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view all email notifications"
  ON public.email_notifications FOR SELECT
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can insert email notifications"
  ON public.email_notifications FOR INSERT
  TO authenticated
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Also allow service role inserts (from edge functions)
CREATE POLICY "Service role can insert"
  ON public.email_notifications FOR INSERT
  TO service_role
  WITH CHECK (true);

CREATE POLICY "Service role can select"
  ON public.email_notifications FOR SELECT
  TO service_role
  USING (true);

CREATE POLICY "Service role can update"
  ON public.email_notifications FOR UPDATE
  TO service_role
  USING (true);
