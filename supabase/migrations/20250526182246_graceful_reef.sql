-- First drop existing foreign key constraints
ALTER TABLE stripe_customers 
DROP CONSTRAINT IF EXISTS stripe_customers_user_id_fkey;

-- Recreate the constraint with ON DELETE CASCADE
ALTER TABLE stripe_customers
ADD CONSTRAINT stripe_customers_user_id_fkey
FOREIGN KEY (user_id)
REFERENCES auth.users(id)
ON DELETE CASCADE;

-- Drop existing function
DROP FUNCTION IF EXISTS delete_user(uuid);

-- Create simplified function that relies on cascading deletes
CREATE OR REPLACE FUNCTION delete_user(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_error text;
BEGIN
  -- Start transaction
  BEGIN
    -- Delete user notifications first (no cascade)
    DELETE FROM user_notifications
    WHERE user_id = p_user_id;

    -- Delete subscriptions (no cascade)
    DELETE FROM subscriptions
    WHERE user_id = p_user_id;

    -- Delete profile (has cascade)
    DELETE FROM profiles
    WHERE id = p_user_id;

    -- Delete user record (will cascade to stripe_customers)
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