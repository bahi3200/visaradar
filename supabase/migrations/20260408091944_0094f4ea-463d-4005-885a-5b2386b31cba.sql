
-- Track active devices per user
CREATE TABLE public.user_devices (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  device_fingerprint TEXT NOT NULL,
  device_name TEXT,
  browser TEXT,
  os TEXT,
  ip_address TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  last_active_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, device_fingerprint)
);

ALTER TABLE public.user_devices ENABLE ROW LEVEL SECURITY;

-- Users see their own devices
CREATE POLICY "Users can view own devices"
ON public.user_devices FOR SELECT
USING (auth.uid() = user_id);

-- Users can insert their own devices
CREATE POLICY "Users can register devices"
ON public.user_devices FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Users can update their own devices (last_active)
CREATE POLICY "Users can update own devices"
ON public.user_devices FOR UPDATE
USING (auth.uid() = user_id);

-- Admins can view all devices
CREATE POLICY "Admins can view all devices"
ON public.user_devices FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- Admins can update any device (block)
CREATE POLICY "Admins can update devices"
ON public.user_devices FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- Security definer function to count active devices
CREATE OR REPLACE FUNCTION public.count_active_devices(_user_id UUID)
RETURNS INTEGER
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COUNT(*)::INTEGER
  FROM public.user_devices
  WHERE user_id = _user_id
    AND is_active = true
    AND last_active_at > now() - interval '30 days'
$$;

-- Function to check if device limit exceeded (max 2)
CREATE OR REPLACE FUNCTION public.is_device_allowed(_user_id UUID, _fingerprint TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT (
    -- Device already registered
    EXISTS (
      SELECT 1 FROM public.user_devices
      WHERE user_id = _user_id AND device_fingerprint = _fingerprint AND is_active = true
    )
    OR
    -- Under limit
    (SELECT COUNT(*) FROM public.user_devices
     WHERE user_id = _user_id AND is_active = true
     AND last_active_at > now() - interval '30 days') < 2
  )
$$;

CREATE INDEX idx_user_devices_user ON public.user_devices(user_id);
CREATE INDEX idx_user_devices_active ON public.user_devices(user_id, is_active);
