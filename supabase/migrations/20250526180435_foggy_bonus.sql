/*
  # Fix delete_user function return type
  
  1. Changes
    - Drop existing function
    - Create composite type for return value
    - Recreate function with proper return type
    
  2. Security
    - Maintains SECURITY DEFINER
    - Preserves existing permissions
*/

-- Drop existing function first
DROP FUNCTION IF EXISTS delete_user(uuid);

-- Create composite type for return value
DROP TYPE IF EXISTS delete_user_result;
CREATE TYPE delete_user_result AS (
  success boolean,
  error text
);

-- Recreate the function with new return type
CREATE FUNCTION delete_user(p_user_id uuid)
RETURNS delete_user_result
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  result delete_user_result;
BEGIN
  -- Start with soft deletes for tables that support it
  UPDATE stripe_customers
  SET deleted_at = now()
  WHERE user_id = p_user_id
  AND deleted_at IS NULL;

  UPDATE stripe_subscriptions ss
  SET deleted_at = now()
  WHERE ss.customer_id IN (
    SELECT customer_id 
    FROM stripe_customers 
    WHERE user_id = p_user_id
  )
  AND deleted_at IS NULL;

  UPDATE stripe_orders so
  SET deleted_at = now()
  WHERE so.customer_id IN (
    SELECT customer_id 
    FROM stripe_customers 
    WHERE user_id = p_user_id
  )
  AND deleted_at IS NULL;

  -- Delete records from tables without soft delete
  DELETE FROM user_notifications
  WHERE user_id = p_user_id;

  DELETE FROM subscriptions
  WHERE user_id = p_user_id;

  DELETE FROM profiles
  WHERE id = p_user_id;

  DELETE FROM users
  WHERE id = p_user_id;

  result.success := true;
  result.error := null;
  RETURN result;

EXCEPTION
  WHEN OTHERS THEN
    result.success := false;
    result.error := SQLERRM;
    RETURN result;
END;
$$;