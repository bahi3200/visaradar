-- Add service_type to packages
ALTER TABLE public.packages 
ADD COLUMN service_type text NOT NULL DEFAULT 'both' 
CHECK (service_type IN ('visa', 'jobs', 'both'));

-- Add service_type to subscription_requests
ALTER TABLE public.subscription_requests 
ADD COLUMN service_type text NOT NULL DEFAULT 'both'
CHECK (service_type IN ('visa', 'jobs', 'both'));

-- Add service_type to subscriptions
ALTER TABLE public.subscriptions 
ADD COLUMN service_type text NOT NULL DEFAULT 'both'
CHECK (service_type IN ('visa', 'jobs', 'both'));

-- Update existing packages: regular ones default to 'both'
UPDATE public.packages SET service_type = 'both';