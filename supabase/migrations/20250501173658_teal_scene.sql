/*
  # Update delete_user function with better error handling

  1. Changes
    - Drop existing function
    - Recreate with jsonb return type for better error reporting
    - Add Stripe data cleanup
    - Improve transaction handling
    
  2. Security
    - Maintains SECURITY DEFINER
    - Preserves existing permissions
*/

-- Drop the existing function
DROP FUNCTION IF EXISTS delete_user(uuid);

-- Create the new function with jsonb return type
CREATE FUNCTION delete_user(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_customer_id text;
  v_error text;
BEGIN
  -- Start transaction
  BEGIN
    -- Get Stripe customer ID if exists
    SELECT customer_id INTO v_customer_id
    FROM stripe_customers
    WHERE user_id = p_user_id
    AND deleted_at IS NULL;

    -- Soft delete Stripe customer if exists
    IF v_customer_id IS NOT NULL THEN
      UPDATE stripe_customers
      SET deleted_at = now()
      WHERE customer_id = v_customer_id;

      -- Soft delete related Stripe subscriptions
      UPDATE stripe_subscriptions
      SET deleted_at = now()
      WHERE customer_id = v_customer_id
      AND deleted_at IS NULL;

      -- Soft delete related Stripe orders
      UPDATE stripe_orders
      SET deleted_at = now()
      WHERE customer_id = v_customer_id
      AND deleted_at IS NULL;
    END IF;

    -- Delete user notifications
    DELETE FROM user_notifications
    WHERE user_id = p_user_id;

    -- Delete profile
    DELETE FROM profiles
    WHERE id = p_user_id;

    -- Delete subscriptions
    DELETE FROM subscriptions
    WHERE user_id = p_user_id;

    -- Delete user record
    DELETE FROM users
    WHERE id = p_user_id;

    RETURN jsonb_build_object(
      'success', true,
      'message', 'User data deleted successfully'
    );

  EXCEPTION
    WHEN OTHERS THEN
      GET STACKED DIAGNOSTICS v_error = MESSAGE_TEXT;
      
      RETURN jsonb_build_object(
        'success', false,
        'error', v_error
      );
  END;
END;
$$;