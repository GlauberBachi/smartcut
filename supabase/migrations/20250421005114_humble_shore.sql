/*
  # Fix recursive policies for notifications table

  1. Changes
    - Remove recursive policy check for admin users
    - Create new, optimized policies for notifications table
    
  2. Security
    - Maintain RLS security while avoiding recursion
    - Ensure admins can still manage notifications
    - Allow authenticated users to view active notifications
*/

-- Drop existing policies to recreate them
DROP POLICY IF EXISTS "Admins can manage notifications" ON notifications;
DROP POLICY IF EXISTS "Users can view active notifications" ON notifications;

-- Create new, non-recursive policies
CREATE POLICY "Admins can manage notifications"
ON notifications
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM users
    WHERE users.id = auth.uid()
    AND users.role = 'admin'
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM users
    WHERE users.id = auth.uid()
    AND users.role = 'admin'
  )
);

CREATE POLICY "Users can view active notifications"
ON notifications
FOR SELECT
TO authenticated
USING (
  (expires_at IS NULL) OR (expires_at > now())
);