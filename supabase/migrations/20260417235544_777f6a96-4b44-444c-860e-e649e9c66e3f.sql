
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS telegram_linked_at TIMESTAMPTZ;

-- Backfill existing linked profiles
UPDATE public.profiles
SET telegram_linked_at = COALESCE(updated_at, now())
WHERE telegram_id IS NOT NULL AND telegram_linked_at IS NULL;

-- Trigger function to maintain telegram_linked_at automatically
CREATE OR REPLACE FUNCTION public.set_telegram_linked_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  -- Newly linked (was null, now set)
  IF NEW.telegram_id IS NOT NULL
     AND (TG_OP = 'INSERT' OR OLD.telegram_id IS DISTINCT FROM NEW.telegram_id) THEN
    NEW.telegram_linked_at = now();
  END IF;

  -- Unlinked (was set, now null)
  IF NEW.telegram_id IS NULL AND TG_OP = 'UPDATE' AND OLD.telegram_id IS NOT NULL THEN
    NEW.telegram_linked_at = NULL;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_telegram_linked_at ON public.profiles;
CREATE TRIGGER trg_set_telegram_linked_at
BEFORE INSERT OR UPDATE OF telegram_id ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.set_telegram_linked_at();
