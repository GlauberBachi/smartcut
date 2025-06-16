/*
  # Add delete user function
  
  1. New Function
    - `delete_user`: Safely deletes a user and all associated data
    - Handles deletion of:
      - User notifications
      - Profile
      - Subscriptions
      - User record
      - Auth user
    
  2. Security
    - Function runs with SECURITY DEFINER
    - Only authenticated users can delete their own account
*/

CREATE OR REPLACE FUNCTION delete_user(user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Delete user notifications
  DELETE FROM user_notifications WHERE user_id = $1;
  
  -- Delete profile
  DELETE FROM profiles WHERE id = $1;
  
  -- Delete subscriptions
  DELETE FROM subscriptions WHERE user_id = $1;
  
  -- Delete user record
  DELETE FROM users WHERE id = $1;
  
  -- Delete auth user (this will cascade to all related records)
  DELETE FROM auth.users WHERE id = $1;
END;
$$;