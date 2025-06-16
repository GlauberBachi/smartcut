/*
  # Fix notification system

  1. Changes
    - Add new RLS policies for notifications and user_notifications
    - Ensure notifications are visible to all authenticated users
    - Fix user_notifications policies to allow proper access

  2. Security
    - Maintain admin-only creation/management of notifications
    - Allow users to manage their own notification status
*/

-- Drop existing policies
DROP POLICY IF EXISTS "Users can view active notifications" ON notifications;
DROP POLICY IF EXISTS "Admins can create notifications" ON notifications;
DROP POLICY IF EXISTS "Admins can manage notifications" ON notifications;
DROP POLICY IF EXISTS "Users can manage their own notification status" ON user_notifications;
DROP POLICY IF EXISTS "Users can update their notification status" ON user_notifications;
DROP POLICY IF EXISTS "Users can view their notifications" ON user_notifications;

-- Create new notification policies
CREATE POLICY "Users can view notifications"
ON notifications FOR SELECT
TO authenticated
USING (true);

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

-- Create new user_notifications policies
CREATE POLICY "Users can manage their notifications"
ON user_notifications FOR ALL
TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

-- Create function to automatically create user_notifications
CREATE OR REPLACE FUNCTION handle_new_notification()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO user_notifications (user_id, notification_id)
  SELECT 
    users.id,
    NEW.id
  FROM users
  WHERE users.id != COALESCE(NEW.created_by, '00000000-0000-0000-0000-000000000000'::uuid);
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;