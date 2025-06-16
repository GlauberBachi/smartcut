/*
  # Fix Authentication Schema Setup

  1. Changes
    - Ensure auth schema exists
    - Create necessary auth tables if missing
    - Set up proper RLS policies
    - Add trigger for handling new users

  2. Security
    - Enable RLS on all tables
    - Add appropriate policies for user access
*/

-- Create auth schema if it doesn't exist
CREATE SCHEMA IF NOT EXISTS auth;

-- Ensure the auth.users table exists
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'auth' 
    AND table_name = 'users'
  ) THEN
    CREATE TABLE auth.users (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      email text UNIQUE NOT NULL,
      role text DEFAULT 'user'::text NOT NULL,
      created_at timestamptz DEFAULT now(),
      updated_at timestamptz DEFAULT now()
    );
  END IF;
END $$;

-- Ensure RLS is enabled
ALTER TABLE auth.users ENABLE ROW LEVEL SECURITY;

-- Create or replace the function to handle new users
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.users (id, email, role)
  VALUES (NEW.id, NEW.email, 'user')
  ON CONFLICT (id) DO NOTHING;
  
  INSERT INTO public.profiles (id)
  VALUES (NEW.id)
  ON CONFLICT (id) DO NOTHING;
  
  INSERT INTO public.subscriptions (user_id, plan, status)
  VALUES (NEW.id, 'free', 'active')
  ON CONFLICT (user_id) DO NOTHING;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create the trigger if it doesn't exist
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger 
    WHERE tgname = 'on_auth_user_created'
  ) THEN
    CREATE TRIGGER on_auth_user_created
      AFTER INSERT ON auth.users
      FOR EACH ROW
      EXECUTE FUNCTION public.handle_new_user();
  END IF;
END $$;

-- Ensure proper RLS policies exist
DO $$ 
BEGIN
  -- Users table policies
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE policyname = 'Users can read own data'
  ) THEN
    CREATE POLICY "Users can read own data" 
      ON public.users
      FOR SELECT 
      TO authenticated 
      USING (auth.uid() = id);
  END IF;

  -- Profiles table policies
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE policyname = 'Users can read own profile'
  ) THEN
    CREATE POLICY "Users can read own profile" 
      ON public.profiles
      FOR SELECT 
      TO authenticated 
      USING (auth.uid() = id);
  END IF;

  -- Subscriptions table policies
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE policyname = 'Users can view own subscription'
  ) THEN
    CREATE POLICY "Users can view own subscription" 
      ON public.subscriptions
      FOR SELECT 
      TO authenticated 
      USING (auth.uid() = user_id);
  END IF;
END $$;