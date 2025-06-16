/*
  # Add INSERT policy for notifications table

  1. Changes
    - Add new RLS policy to allow admin users to insert notifications
    - Add safety check to prevent duplicate policy error
    
  2. Security
    - Only users with 'admin' role can insert new notifications
    - Policy checks user role in users table
*/

DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'notifications' 
    AND policyname = 'Admins can create notifications'
  ) THEN
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
  END IF;
END $$;