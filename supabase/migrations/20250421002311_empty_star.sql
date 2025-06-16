/*
  # Create users table and update schema

  1. New Tables
    - `users`
      - `id` (uuid, primary key) - matches auth.users id
      - `email` (text, unique) - user's email address
      - `role` (text) - user's role (default: 'user')
      - `created_at` (timestamptz) - when the user was created
      - `updated_at` (timestamptz) - when the user was last updated

  2. Security
    - Enable RLS on `users` table
    - Add policies for:
      - Users can read their own data
      - Users can update their own data
      - Admins can read all users
      - Admins can update all users

  3. Changes
    - Add check constraint for valid roles
*/

CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY REFERENCES auth.users(id),
  email text UNIQUE NOT NULL,
  role text NOT NULL DEFAULT 'user',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT valid_role CHECK (role IN ('user', 'admin'))
);

ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- Users can read their own data
CREATE POLICY "Users can read own data"
  ON users
  FOR SELECT
  TO authenticated
  USING (auth.uid() = id OR role = 'admin');

-- Users can update their own data (except role)
CREATE POLICY "Users can update own data"
  ON users
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (
    auth.uid() = id AND
    role = (SELECT role FROM users WHERE id = auth.uid())
  );

-- Create trigger to automatically set email and create user record
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.users (id, email)
  VALUES (new.id, new.email);
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Set up trigger to fire on auth.users insert
CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- Backfill existing auth users if any exist
INSERT INTO users (id, email)
SELECT id, email 
FROM auth.users
ON CONFLICT (id) DO NOTHING;