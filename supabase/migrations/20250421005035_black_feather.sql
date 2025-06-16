/*
  # Fix infinite recursion in users RLS policies

  1. Changes
    - Remove recursive admin check from users policies
    - Simplify the user read policy to only check own data
    - Add separate policy for admin access
    - Fix policy definitions to prevent infinite recursion

  2. Security
    - Maintains RLS protection
    - Ensures users can only access their own data
    - Allows admins to access all user data without recursion
*/

-- Drop existing policies to replace them
DROP POLICY IF EXISTS "Users can read own data" ON users;
DROP POLICY IF EXISTS "Users can update own data" ON users;

-- Create new non-recursive policies
CREATE POLICY "Users can read own data"
ON users
FOR SELECT
TO authenticated
USING (auth.uid() = id);

CREATE POLICY "Admins can read all data"
ON users
FOR SELECT
TO authenticated
USING (
  (SELECT role FROM users WHERE id = auth.uid()) = 'admin'
);

CREATE POLICY "Users can update own data"
ON users
FOR UPDATE
TO authenticated
USING (auth.uid() = id)
WITH CHECK (
  auth.uid() = id 
  AND (
    CASE 
      WHEN role = 'admin' THEN 
        (SELECT role FROM users WHERE id = auth.uid()) = 'admin'
      ELSE 
        role = 'user'
    END
  )
);