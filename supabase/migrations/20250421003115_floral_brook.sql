/*
  # Fix Database Schema

  1. Changes
    - Drop existing policies and recreate them with proper conditions
    - Ensure proper table creation with all necessary constraints
    - Fix trigger function to handle new user creation properly

  2. Security
    - Maintain RLS policies for user data protection
    - Ensure proper role-based access control
*/

-- Drop existing policies if they exist
DO $$ 
BEGIN
  DROP POLICY IF EXISTS "Users can read own data" ON users;
  DROP POLICY IF EXISTS "Users can update own data" ON users;
EXCEPTION
  WHEN undefined_object THEN
    NULL;
END $$;

-- Recreate users table if it doesn't exist
CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text UNIQUE NOT NULL,
  role text NOT NULL DEFAULT 'user',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT valid_role CHECK (role IN ('user', 'admin'))
);

-- Enable RLS
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- Create new policies with fixed conditions
CREATE POLICY "Users can read own data"
  ON users
  FOR SELECT
  TO authenticated
  USING ((auth.uid() = id) OR (EXISTS (
    SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin'
  )));

CREATE POLICY "Users can update own data"
  ON users
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (
    auth.uid() = id AND
    role = (SELECT role FROM users WHERE id = auth.uid())
  );

-- Drop and recreate trigger function
DROP FUNCTION IF EXISTS handle_new_user CASCADE;
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.users (id, email)
  VALUES (NEW.id, NEW.email)
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION handle_new_user();

-- Ensure existing users are in the users table
INSERT INTO users (id, email)
SELECT id, email 
FROM auth.users
ON CONFLICT (id) DO NOTHING;