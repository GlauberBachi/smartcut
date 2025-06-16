/*
  # Fix user deletion function

  1. Changes
    - Add proper deletion order to handle foreign key constraints
    - Handle Stripe-related records first
    - Add proper error handling and transaction management
    
  2. Security
    - Maintain SECURITY DEFINER setting
    - Keep existing RLS policies
*/

-- Drop existing function
DROP FUNCTION IF EXISTS delete_user(uuid);

-- Create new function with proper deletion order
CREATE OR REPLACE FUNCTION delete_user(p_user_id uuid)
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

    -- Delete Stripe-related records first
    IF v_customer_id IS NOT NULL THEN
      -- Delete Stripe orders
      DELETE FROM stripe_orders
      WHERE customer_id = v_customer_id;

      -- Delete Stripe subscriptions
      DELETE FROM stripe_subscriptions
      WHERE customer_id = v_customer_id;

      -- Delete Stripe customer
      DELETE FROM stripe_customers
      WHERE customer_id = v_customer_id;
    END IF;

    -- Delete user notifications
    DELETE FROM user_notifications
    WHERE user_id = p_user_id;

    -- Delete subscriptions
    DELETE FROM subscriptions
    WHERE user_id = p_user_id;

    -- Delete profile
    DELETE FROM profiles
    WHERE id = p_user_id;

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
      RAISE NOTICE 'Error in delete_user: %', v_error;
      
      RETURN jsonb_build_object(
        'success', false,
        'error', v_error
      );
  END;
END;
$$;