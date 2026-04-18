-- Create visa_profiles table for storing visa application data
CREATE TABLE public.visa_profiles (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  
  -- Profile identification
  profile_label text NOT NULL DEFAULT 'ملفي',
  is_primary boolean NOT NULL DEFAULT false,
  
  -- Personal info
  full_name_ar text,
  full_name_latin text,
  gender text,
  birth_date date,
  birth_place text,
  nationality text,
  marital_status text,
  
  -- Passport info
  passport_number text,
  passport_issue_date date,
  passport_expiry_date date,
  passport_issue_place text,
  national_id text,
  
  -- Contact & address
  phone text,
  email text,
  address text,
  city text,
  wilaya text,
  postal_code text,
  
  -- Profession
  profession text,
  employer_name text,
  employer_address text,
  employer_phone text,
  monthly_income text,
  
  -- Travel
  destination_country text,
  travel_purpose text,
  travel_date date,
  return_date date,
  duration_days integer,
  hotel_or_host text,
  
  -- Family info
  father_name text,
  mother_name text,
  spouse_name text,
  children_count integer,
  children_details text,
  
  -- Free notes
  notes text,
  
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX idx_visa_profiles_user_id ON public.visa_profiles(user_id);

ALTER TABLE public.visa_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own visa profiles"
  ON public.visa_profiles FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own visa profiles"
  ON public.visa_profiles FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own visa profiles"
  ON public.visa_profiles FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own visa profiles"
  ON public.visa_profiles FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all visa profiles"
  ON public.visa_profiles FOR SELECT
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER update_visa_profiles_updated_at
  BEFORE UPDATE ON public.visa_profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();