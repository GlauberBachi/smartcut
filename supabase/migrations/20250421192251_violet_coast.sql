/*
  # Update notification policies

  1. Changes
    - Update notification policies to allow all authenticated users to view notifications
    - Keep admin-only restrictions for creating and managing notifications
    - Ensure notifications respect expiration dates

  2. Security
    - Maintain admin-only access for creating and managing notifications
    - Allow all authenticated users to view active notifications
*/

-- Drop existing policies
DROP POLICY IF EXISTS "Users can view active notifications" ON notifications;
DROP POLICY IF EXISTS "Admins can create notifications" ON notifications;
DROP POLICY IF EXISTS "Admins can manage notifications" ON notifications;

-- Create new policies
CREATE POLICY "Users can view active notifications" 
ON notifications FOR SELECT 
TO authenticated 
USING (
  (expires_at IS NULL OR expires_at > now())
);

CREATE POLICY "Admins can create notifications" 
ON notifications FOR INSERT 
TO authenticated 
WITH CHECK (
  EXISTS (
    SELECT 1 
    FROM users 
    WHERE users.id = auth.uid() 
    AND users.role = 'admin'
  )
);

CREATE POLICY "Admins can manage notifications" 
ON notifications FOR ALL 
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