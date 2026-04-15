ALTER TABLE public.referrals
ADD COLUMN referrer_bonus_days integer NOT NULL DEFAULT 0,
ADD COLUMN referred_bonus_days integer NOT NULL DEFAULT 0;