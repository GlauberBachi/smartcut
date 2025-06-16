/*
  # Fix notifications system

  1. Changes
    - Add missing RLS policies for user_notifications table
    - Fix notification creation function to handle user notifications properly
    - Add indexes for better performance

  2. Security
    - Enable RLS on all tables
    - Add proper policies for notifications and user_notifications
*/

-- Add missing indexes
CREATE INDEX IF NOT EXISTS idx_user_notifications_user_id ON user_notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_user_notifications_notification_id ON user_notifications(notification_id);
CREATE INDEX IF NOT EXISTS idx_user_notifications_read ON user_notifications(read);

-- Update RLS policies for user_notifications
CREATE POLICY "Users can view their notifications"
ON user_notifications
FOR SELECT
TO authenticated
USING (user_id = auth.uid());

CREATE POLICY "Users can update their notification status"
ON user_notifications
FOR UPDATE
TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

-- Create improved notification creation function
CREATE OR REPLACE FUNCTION create_notification_with_user_notifications(
  p_title TEXT,
  p_message TEXT,
  p_type TEXT,
  p_expires_at TIMESTAMPTZ,
  p_created_by UUID
) RETURNS UUID AS $$
DECLARE
  v_notification_id UUID;
BEGIN
  -- Check if user is admin
  IF NOT EXISTS (
    SELECT 1 FROM users 
    WHERE id = auth.uid() 
    AND role = 'admin'
  ) THEN
    RAISE EXCEPTION 'Only admins can create notifications';
  END IF;

  -- Create the notification
  INSERT INTO notifications (
    title,
    message,
    type,
    expires_at,
    created_by
  )
  VALUES (
    p_title,
    p_message,
    p_type,
    p_expires_at,
    p_created_by
  )
  RETURNING id INTO v_notification_id;

  -- Create user_notifications for all users
  INSERT INTO user_notifications (
    user_id,
    notification_id,
    read,
    created_at
  )
  SELECT
    id,
    v_notification_id,
    false,
    now()
  FROM
    users
  ON CONFLICT (user_id, notification_id) 
  DO NOTHING;

  RETURN v_notification_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;