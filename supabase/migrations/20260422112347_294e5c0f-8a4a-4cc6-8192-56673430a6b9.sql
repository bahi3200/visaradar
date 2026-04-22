-- Create visa_appointments table for the calendar feature
CREATE TABLE public.visa_appointments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  country_code TEXT NOT NULL,
  center_name TEXT,
  provider TEXT NOT NULL CHECK (provider IN ('VFS', 'TLS', 'BLS', 'EMBASSY', 'OTHER')),
  appointment_type TEXT NOT NULL CHECK (appointment_type IN ('opening', 'available', 'closed', 'maintenance')),
  appointment_date DATE NOT NULL,
  appointment_time TIME,
  notes TEXT,
  booking_url TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Indexes for fast calendar queries
CREATE INDEX idx_visa_appointments_date ON public.visa_appointments(appointment_date);
CREATE INDEX idx_visa_appointments_country ON public.visa_appointments(country_code);
CREATE INDEX idx_visa_appointments_active ON public.visa_appointments(is_active) WHERE is_active = true;

-- Enable RLS
ALTER TABLE public.visa_appointments ENABLE ROW LEVEL SECURITY;

-- All authenticated users can view active appointments
CREATE POLICY "Authenticated users view appointments"
ON public.visa_appointments
FOR SELECT
TO authenticated
USING (true);

-- Admins can do anything
CREATE POLICY "Admins manage appointments insert"
ON public.visa_appointments
FOR INSERT
TO authenticated
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins manage appointments update"
ON public.visa_appointments
FOR UPDATE
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins manage appointments delete"
ON public.visa_appointments
FOR DELETE
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

-- Moderators can insert and update (but not delete)
CREATE POLICY "Moderators insert appointments"
ON public.visa_appointments
FOR INSERT
TO authenticated
WITH CHECK (has_role(auth.uid(), 'moderator'::app_role));

CREATE POLICY "Moderators update appointments"
ON public.visa_appointments
FOR UPDATE
TO authenticated
USING (has_role(auth.uid(), 'moderator'::app_role));

-- Service role full access
CREATE POLICY "Service role full access appointments"
ON public.visa_appointments
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- Auto-update updated_at
CREATE TRIGGER update_visa_appointments_updated_at
BEFORE UPDATE ON public.visa_appointments
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();