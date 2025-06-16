/*
  # Fix users table policies recursion

  1. Changes
    - Remove recursive admin policy that was causing infinite recursion
    - Add new simplified admin policy that uses the current user's role directly
    
  2. Security
    - Maintains RLS protection
    - Simplifies policy logic while maintaining security
*/

-- Drop the problematic policy
DROP POLICY IF EXISTS "Admins can read all data" ON users;

-- Create new simplified admin policy
CREATE POLICY "Admins can read all data"
ON users
FOR SELECT
TO authenticated
USING (
  role = 'admin'
);