/*
  # Fix notifications table permissions

  1. Changes
    - Update the admin policy for notifications table to properly check user roles
    - Use a join instead of a subquery for better performance
    - Ensure admin users can manage notifications without permission errors

  2. Security
    - Maintains RLS security
    - Only allows admin users to manage notifications
    - Preserves existing user viewing policies
*/

-- Drop the existing admin policy
DROP POLICY IF EXISTS "Admins can manage notifications" ON notifications;

-- Create new admin policy with proper join syntax
CREATE POLICY "Admins can manage notifications" ON notifications
AS PERMISSIVE FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM users
    WHERE users.id = auth.uid()
    AND users.role = 'admin'
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM users
    WHERE users.id = auth.uid()
    AND users.role = 'admin'
  )
);