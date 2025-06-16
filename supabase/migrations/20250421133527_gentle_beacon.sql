/*
  # Add admin insert policy for notifications

  1. Security Changes
    - Add RLS policy to allow administrators to insert notifications
    - Policy checks user role from users table to verify admin status
    - Ensures only admins can create new notifications

  Note: This complements existing policies while maintaining security
*/

CREATE POLICY "Admins can create notifications"
ON notifications
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM users
    WHERE users.id = auth.uid()
    AND users.role = 'admin'
  )
);