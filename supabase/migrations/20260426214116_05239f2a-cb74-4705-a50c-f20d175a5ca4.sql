ALTER TABLE public.packages
  ADD COLUMN IF NOT EXISTS promo_price numeric NULL,
  ADD COLUMN IF NOT EXISTS promo_starts_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS promo_ends_at timestamptz NULL;

CREATE INDEX IF NOT EXISTS idx_packages_promo_window
  ON public.packages (promo_starts_at, promo_ends_at)
  WHERE promo_price IS NOT NULL;