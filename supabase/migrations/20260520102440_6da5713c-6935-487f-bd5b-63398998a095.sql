-- Track current centers per (country, provider) and change history
CREATE TABLE public.provider_centers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  country_code TEXT NOT NULL,
  provider TEXT NOT NULL,
  centers TEXT[] NOT NULL DEFAULT '{}',
  source_url TEXT,
  last_checked_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (country_code, provider)
);

CREATE TABLE public.provider_center_changes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  country_code TEXT NOT NULL,
  provider TEXT NOT NULL,
  change_type TEXT NOT NULL CHECK (change_type IN ('added','removed')),
  center_name TEXT NOT NULL,
  previous_centers TEXT[],
  new_centers TEXT[],
  detected_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_provider_center_changes_country ON public.provider_center_changes (country_code, detected_at DESC);
CREATE INDEX idx_provider_center_changes_detected ON public.provider_center_changes (detected_at DESC);

ALTER TABLE public.provider_centers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.provider_center_changes ENABLE ROW LEVEL SECURITY;

-- Anyone authenticated can read (subscribers need this to see notifications)
CREATE POLICY "Authenticated can read provider centers"
  ON public.provider_centers FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated can read center changes"
  ON public.provider_center_changes FOR SELECT TO authenticated USING (true);

-- Admins manage centers manually (also lets service role bypass RLS implicitly)
CREATE POLICY "Admins manage provider centers"
  ON public.provider_centers FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins manage center changes"
  ON public.provider_center_changes FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

-- Trigger: when centers array changes, insert change rows automatically
CREATE OR REPLACE FUNCTION public.log_provider_center_changes()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  added_item TEXT;
  removed_item TEXT;
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.centers IS DISTINCT FROM NEW.centers THEN
    -- Added centers
    FOREACH added_item IN ARRAY (
      SELECT COALESCE(array_agg(c), '{}') FROM (
        SELECT unnest(NEW.centers) EXCEPT SELECT unnest(OLD.centers)
      ) AS s(c)
    ) LOOP
      INSERT INTO public.provider_center_changes
        (country_code, provider, change_type, center_name, previous_centers, new_centers)
      VALUES (NEW.country_code, NEW.provider, 'added', added_item, OLD.centers, NEW.centers);
    END LOOP;

    FOREACH removed_item IN ARRAY (
      SELECT COALESCE(array_agg(c), '{}') FROM (
        SELECT unnest(OLD.centers) EXCEPT SELECT unnest(NEW.centers)
      ) AS s(c)
    ) LOOP
      INSERT INTO public.provider_center_changes
        (country_code, provider, change_type, center_name, previous_centers, new_centers)
      VALUES (NEW.country_code, NEW.provider, 'removed', removed_item, OLD.centers, NEW.centers);
    END LOOP;

    NEW.updated_at := now();
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_log_provider_center_changes
  BEFORE UPDATE ON public.provider_centers
  FOR EACH ROW EXECUTE FUNCTION public.log_provider_center_changes();

-- Seed current known centers (mirrors src/pages/SubscribeRequest.tsx countryOptions)
INSERT INTO public.provider_centers (country_code, provider, centers, source_url) VALUES
  ('IT', 'VFS Global',          ARRAY['الجزائر العاصمة','وهران'],          'https://visa.vfsglobal.com/dza/ar/ita'),
  ('FR', 'Capago (TLScontact)', ARRAY['الجزائر العاصمة','وهران','عنابة'], 'https://fr.tlscontact.com/dz'),
  ('ES', 'BLS International',   ARRAY['الجزائر العاصمة','وهران'],          'https://algeria.blsspainglobal.com/'),
  ('DE', 'VFS Global',          ARRAY['الجزائر العاصمة'],                  'https://visa.vfsglobal.com/dza/ar/deu'),
  ('GR', 'VFS Global',          ARRAY['الجزائر العاصمة'],                  'https://visa.vfsglobal.com/dza/ar/grc');