
-- Enable required extensions for cron jobs
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- Enable realtime on visa_notifications so users get instant alerts when site is open
ALTER TABLE public.visa_notifications REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.visa_notifications;

-- Enable realtime on subscription_requests for instant approval/rejection alerts
ALTER TABLE public.subscription_requests REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.subscription_requests;
