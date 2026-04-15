ALTER TABLE public.payment_settings
RENAME COLUMN referral_bonus_days TO referrer_bonus_days;

ALTER TABLE public.payment_settings
ADD COLUMN referred_bonus_days integer NOT NULL DEFAULT 7;