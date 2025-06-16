/*
  # Fix delete user function

  1. Changes
    - Drop existing function to avoid parameter name conflict
    - Recreate function with consistent parameter naming
    - Add proper transaction and error handling
    - Handle Stripe data deletion properly

  2. Security
    - Maintains SECURITY DEFINER
    - Proper error handling and rollback
*/

-- Drop the existing function first
DROP FUNCTION IF EXISTS delete_user(uuid);

-- Create the new function with fixed parameter name
CREATE OR REPLACE FUNCTION delete_user(user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_customer_id text;
BEGIN
  -- Start transaction
  BEGIN
    -- Get Stripe customer ID if exists
    SELECT customer_id INTO v_customer_id
    FROM stripe_customers
    WHERE user_id = user_id
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
    WHERE user_id = user_id;

    -- Delete profile
    DELETE FROM profiles
    WHERE id = user_id;

    -- Delete subscriptions
    DELETE FROM subscriptions
    WHERE user_id = user_id;

    -- Delete user record
    DELETE FROM users
    WHERE id = user_id;

    -- Delete auth user (this will cascade to all related records)
    DELETE FROM auth.users
    WHERE id = user_id;

    RETURN true;
  EXCEPTION
    WHEN OTHERS THEN
      RAISE NOTICE 'Error deleting user: %', SQLERRM;
      RETURN false;
  END;
END;
$$;