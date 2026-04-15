-- Create payment_settings table (single-row config table)
CREATE TABLE public.payment_settings (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  ccp_number text NOT NULL DEFAULT '',
  ccp_key text NOT NULL DEFAULT '',
  rip_number text NOT NULL DEFAULT '',
  account_holder text NOT NULL DEFAULT '',
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.payment_settings ENABLE ROW LEVEL SECURITY;

-- Everyone can read payment settings (needed for subscribe page)
CREATE POLICY "Anyone can view payment settings"
ON public.payment_settings FOR SELECT
TO public
USING (true);

-- Only admins can update
CREATE POLICY "Admins can update payment settings"
ON public.payment_settings FOR UPDATE
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

-- Only admins can insert
CREATE POLICY "Admins can insert payment settings"
ON public.payment_settings FOR INSERT
TO authenticated
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Insert default row
INSERT INTO public.payment_settings (ccp_number, ccp_key, rip_number, account_holder)
VALUES ('', '', '', '');