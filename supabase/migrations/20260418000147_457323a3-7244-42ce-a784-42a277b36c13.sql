-- Function to log telegram link/unlink events
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

  INSERT INTO public.telegram_link_log (user_id, chat_id, username, action)
  VALUES (
    NEW.user_id,
    v_chat_id,
    COALESCE(NEW.telegram_username, OLD.telegram_username),
    v_action
  );

  RETURN NEW;
END;
$$;

-- Drop existing trigger if any
DROP TRIGGER IF EXISTS trg_log_telegram_link_change ON public.profiles;

-- Create trigger on profiles
CREATE TRIGGER trg_log_telegram_link_change
AFTER INSERT OR UPDATE OF telegram_id ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.log_telegram_link_change();