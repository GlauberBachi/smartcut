/*
  # Fix user sessions policies and ensure proper logging

  1. Security
    - Update RLS policies for user_sessions table
    - Ensure admins can view all sessions
    - Users can view their own sessions
    
  2. Indexes
    - Add indexes for better performance
    - Optimize queries for admin panel
*/

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Users can view own sessions" ON user_sessions;
DROP POLICY IF EXISTS "Admins can view all sessions" ON user_sessions;
DROP POLICY IF EXISTS "Enable insert for authenticated users" ON user_sessions;
DROP POLICY IF EXISTS "Users can update own sessions" ON user_sessions;

-- Create comprehensive policies for user_sessions
CREATE POLICY "Users can view own sessions"
  ON user_sessions
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all sessions"
  ON user_sessions
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users 
      WHERE users.id = auth.uid() 
      AND users.role = 'admin'
    )
  );

CREATE POLICY "Enable insert for authenticated users"
  ON user_sessions
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own sessions"
  ON user_sessions
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Add indexes for better performance
CREATE INDEX IF NOT EXISTS idx_user_sessions_user_id_active 
  ON user_sessions (user_id, is_active) 
  WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_user_sessions_login_at_desc 
  ON user_sessions (login_at DESC);

CREATE INDEX IF NOT EXISTS idx_user_sessions_is_active 
  ON user_sessions (is_active) 
  WHERE is_active = true;

-- Ensure the foreign key constraint exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'user_sessions_user_id_fkey'
    AND table_name = 'user_sessions'
  ) THEN
    ALTER TABLE user_sessions 
    ADD CONSTRAINT user_sessions_user_id_fkey 
    FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
  END IF;
END $$;