/*
  # Update delete_user function to handle Stripe records

  1. Changes
    - Update delete_user function to soft delete Stripe-related records before deleting user data
    - Add proper handling of stripe_customers and stripe_subscriptions tables
    - Ensure all Stripe-related records are soft deleted by setting deleted_at timestamp

  2. Security
    - Function remains security definer to run with elevated privileges
    - Only authenticated users can call this function through the delete-account edge function
*/

CREATE OR REPLACE FUNCTION delete_user(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_customer_id text;
  v_result jsonb;
BEGIN
  -- Get the customer_id before soft deleting records
  SELECT customer_id INTO v_customer_id
  FROM stripe_customers
  WHERE user_id = p_user_id
  AND deleted_at IS NULL;

  -- Soft delete stripe_subscriptions if customer exists
  IF v_customer_id IS NOT NULL THEN
    UPDATE stripe_subscriptions
    SET deleted_at = NOW()
    WHERE customer_id = v_customer_id
    AND deleted_at IS NULL;
  END IF;

  -- Soft delete stripe_customers
  UPDATE stripe_customers
  SET deleted_at = NOW()
  WHERE user_id = p_user_id
  AND deleted_at IS NULL;

  -- Delete user notifications
  DELETE FROM user_notifications
  WHERE user_id = p_user_id;

  -- Delete user profile
  DELETE FROM profiles
  WHERE id = p_user_id;

  -- Delete user record
  DELETE FROM users
  WHERE id = p_user_id;

  v_result := jsonb_build_object(
    'success', true,
    'message', 'User data deleted successfully'
  );

  RETURN v_result;
EXCEPTION
  WHEN OTHERS THEN
    v_result := jsonb_build_object(
      'success', false,
      'error', SQLERRM
    );
    RETURN v_result;
END;
$$;