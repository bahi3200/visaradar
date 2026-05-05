-- Ensure telegram linked timestamp is maintained on profile changes
CREATE OR REPLACE FUNCTION public.set_telegram_linked_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.telegram_id IS NOT NULL
     AND (TG_OP = 'INSERT' OR OLD.telegram_id IS DISTINCT FROM NEW.telegram_id) THEN
    NEW.telegram_linked_at = now();
  END IF;

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

-- Ensure link/unlink changes are logged for admin diagnostics
CREATE OR REPLACE FUNCTION public.log_telegram_link_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_action text;
  v_chat_id text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.telegram_id IS NOT NULL THEN
      v_action := 'linked';
      v_chat_id := NEW.telegram_id;
    ELSE
      RETURN NEW;
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.telegram_id IS NULL AND NEW.telegram_id IS NOT NULL THEN
      v_action := 'linked';
      v_chat_id := NEW.telegram_id;
    ELSIF OLD.telegram_id IS NOT NULL AND NEW.telegram_id IS NULL THEN
      v_action := 'unlinked';
      v_chat_id := OLD.telegram_id;
    ELSIF OLD.telegram_id IS DISTINCT FROM NEW.telegram_id THEN
      v_action := 'relinked';
      v_chat_id := NEW.telegram_id;
    ELSE
      RETURN NEW;
    END IF;
  ELSE
    RETURN NEW;
  END IF;

  INSERT INTO public.telegram_link_log (user_id, chat_id, username, action, status, source)
  VALUES (
    NEW.user_id,
    v_chat_id,
    COALESCE(NEW.telegram_username, OLD.telegram_username),
    v_action,
    'success',
    'profiles-trigger'
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_log_telegram_link_change ON public.profiles;
CREATE TRIGGER trg_log_telegram_link_change
AFTER INSERT OR UPDATE OF telegram_id ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.log_telegram_link_change();

-- Backfill linked_at for any profile that already has Telegram saved
UPDATE public.profiles
SET telegram_linked_at = COALESCE(telegram_linked_at, updated_at, now())
WHERE telegram_id IS NOT NULL AND telegram_linked_at IS NULL;