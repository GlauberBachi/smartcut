/*
  # Fix delete_user function to handle stripe_integration_logs constraint
  
  1. Changes
    - Update delete_user function to delete stripe_integration_logs first
    - Ensure proper deletion order to respect all foreign key constraints
    - Add better error handling and logging
    
  2. Security
    - Maintains SECURITY DEFINER
    - Preserves existing permissions
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

    -- Step 1: Delete stripe_integration_logs first (has FK to users table)
    DELETE FROM stripe_integration_logs
    WHERE user_id = p_user_id;

    -- Step 2: Handle Stripe data (soft delete)
    IF v_customer_id IS NOT NULL THEN
      -- Mark Stripe orders as deleted
      UPDATE stripe_orders
      SET deleted_at = now()
      WHERE customer_id = v_customer_id
      AND deleted_at IS NULL;

      -- Mark Stripe subscriptions as deleted
      UPDATE stripe_subscriptions
      SET deleted_at = now()
      WHERE customer_id = v_customer_id
      AND deleted_at IS NULL;

      -- Mark Stripe customer as deleted
      UPDATE stripe_customers
      SET deleted_at = now()
      WHERE customer_id = v_customer_id
      AND deleted_at IS NULL;
    END IF;

    -- Step 3: Delete user notifications
    DELETE FROM user_notifications
    WHERE user_id = p_user_id;

    -- Step 4: Delete subscriptions
    DELETE FROM subscriptions
    WHERE user_id = p_user_id;

    -- Step 5: Delete profile
    DELETE FROM profiles
    WHERE id = p_user_id;

    -- Step 6: Delete user record
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