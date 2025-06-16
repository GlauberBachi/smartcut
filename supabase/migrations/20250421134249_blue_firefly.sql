/*
  # Create notification stored procedure

  1. New Function
    - `create_notification_with_user_notifications`
      - Creates a new notification
      - Creates user_notification entries for all users
      - Handles transaction management
      - Returns the created notification ID

  2. Parameters
    - `p_title` - Notification title
    - `p_message` - Notification message
    - `p_type` - Notification type
    - `p_expires_at` - Expiration date (optional)
    - `p_created_by` - User ID who created the notification

  3. Security
    - Function is executed with SECURITY DEFINER
    - Proper error handling and rollback on failure
*/

CREATE OR REPLACE FUNCTION create_notification_with_user_notifications(
  p_title text,
  p_message text,
  p_type text,
  p_expires_at timestamptz,
  p_created_by uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_notification_id uuid;
BEGIN
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
    auth.users;

  RETURN v_notification_id;
END;
$$;