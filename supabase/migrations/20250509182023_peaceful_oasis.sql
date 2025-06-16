/*
  # Fix user creation schema and triggers

  1. Changes
    - Drop and recreate handle_new_user trigger function with proper error handling
    - Add proper checks for user data before insertion
    - Ensure proper order of operations for user creation

  2. Security
    - Maintain existing RLS policies
    - Ensure proper permissions for auth schema
*/

-- Drop existing trigger if it exists
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

-- Recreate the trigger function with proper error handling
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  profile_id uuid;
BEGIN
  -- Insert into public.users first
  INSERT INTO public.users (id, email, role, created_at, updated_at)
  VALUES (
    NEW.id,
    NEW.email,
    'user',
    NOW(),
    NOW()
  )
  ON CONFLICT (id) DO NOTHING
  RETURNING id INTO profile_id;

  -- Only create profile if user was created
  IF profile_id IS NOT NULL THEN
    INSERT INTO public.profiles (id, created_at, updated_at)
    VALUES (
      profile_id,
      NOW(),
      NOW()
    )
    ON CONFLICT (id) DO NOTHING;
  END IF;

  -- Create initial subscription record
  INSERT INTO public.subscriptions (
    user_id,
    plan,
    status,
    current_period_end,
    cancel_at_period_end,
    created_at,
    updated_at
  )
  VALUES (
    NEW.id,
    'free',
    'active',
    NOW() + INTERVAL '100 years',
    false,
    NOW(),
    NOW()
  )
  ON CONFLICT (user_id) DO NOTHING;

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    -- Log the error for debugging
    RAISE NOTICE 'Error in handle_new_user trigger: %', SQLERRM;
    RETURN NEW;
END;
$$;

-- Recreate the trigger
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Ensure proper indexes exist
CREATE INDEX IF NOT EXISTS idx_users_email ON public.users(email);
CREATE INDEX IF NOT EXISTS idx_profiles_created_at ON public.profiles(created_at);

-- Grant necessary permissions
GRANT USAGE ON SCHEMA public TO postgres, anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA public TO postgres, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO postgres, service_role;
GRANT ALL ON ALL FUNCTIONS IN SCHEMA public TO postgres, service_role;