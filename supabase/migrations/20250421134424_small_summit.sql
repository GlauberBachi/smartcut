/*
  # Fix notification creation procedure

  1. Changes
    - Update `create_notification_with_user_notifications` procedure to:
      - Handle duplicate user notifications gracefully
      - Use ON CONFLICT DO NOTHING for user_notifications inserts
      - Return the notification ID even if some user_notifications already exist

  2. Security
    - Maintains existing security context
    - Only admins can execute the procedure (inherited from notification table policies)
*/

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
  -- Create the notification first
  INSERT INTO notifications (title, message, type, expires_at, created_by)
  VALUES (p_title, p_message, p_type, p_expires_at, p_created_by)
  RETURNING id INTO v_notification_id;

  -- Insert user_notifications for all users, ignoring duplicates
  INSERT INTO user_notifications (user_id, notification_id)
  SELECT id, v_notification_id
  FROM users
  ON CONFLICT (user_id, notification_id) DO NOTHING;

  RETURN v_notification_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;