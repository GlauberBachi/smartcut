/*
  # Fix users table and policies
  
  1. Changes
    - Drop existing policies before recreating
    - Create users table with proper constraints
    - Enable RLS
    - Add policies for user data access
    - Create trigger for new user creation
    - Backfill existing users

  2. Security
    - Enable RLS on users table
    - Add policy for users to read their own data
    - Add policy for users to update their own data (except role)
*/

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Users can read own data" ON users;
DROP POLICY IF EXISTS "Users can update own data" ON users;

-- Create users table if it doesn't exist
CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY REFERENCES auth.users(id),
  email text UNIQUE NOT NULL,
  role text NOT NULL DEFAULT 'user',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT valid_role CHECK (role IN ('user', 'admin'))
);

-- Enable RLS
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- Users can read their own data or admins can read all
CREATE POLICY "Users can read own data"
  ON users
  FOR SELECT
  TO authenticated
  USING ((auth.uid() = id) OR (role = 'admin'));

-- Users can update their own data (except role)
CREATE POLICY "Users can update own data"
  ON users
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (
    auth.uid() = id AND
    (role = (SELECT role FROM users WHERE id = auth.uid()))
  );

-- Create function to handle new user creation
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.users (id, email)
  VALUES (new.id, new.email);
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger for new user creation
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- Backfill existing users
INSERT INTO users (id, email)
SELECT id, email 
FROM auth.users
ON CONFLICT (id) DO NOTHING;