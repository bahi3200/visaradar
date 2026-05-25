ALTER TABLE public.subscriptions DROP CONSTRAINT IF EXISTS subscriptions_status_check;
ALTER TABLE public.subscriptions ADD CONSTRAINT subscriptions_status_check CHECK (status = ANY (ARRAY['active'::text, 'paused'::text, 'expired'::text, 'cancelled'::text]));
ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS paused_at timestamp with time zone;
ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS paused_remaining_seconds integer;