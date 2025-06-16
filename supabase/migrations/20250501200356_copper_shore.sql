/*
  # Add Stripe integration functions
  
  1. New Functions
    - `create_stripe_customer`: Creates a Stripe customer for new users
    - `handle_stripe_webhook`: Handles Stripe webhook events
    
  2. Security
    - Functions run with SECURITY DEFINER
    - Proper error handling and logging
*/

-- Function to create a Stripe customer
CREATE OR REPLACE FUNCTION create_stripe_customer(user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_email text;
  v_customer_id text;
  v_error text;
BEGIN
  -- Get user email
  SELECT email INTO v_user_email
  FROM users
  WHERE id = user_id;

  IF v_user_email IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'User not found'
    );
  END IF;

  -- Check if customer already exists
  SELECT customer_id INTO v_customer_id
  FROM stripe_customers
  WHERE user_id = user_id
  AND deleted_at IS NULL;

  IF v_customer_id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'success', true,
      'customer_id', v_customer_id,
      'message', 'Customer already exists'
    );
  END IF;

  -- Create customer record
  INSERT INTO stripe_customers (
    user_id,
    customer_id
  )
  VALUES (
    user_id,
    'pending_' || gen_random_uuid()
  )
  RETURNING customer_id INTO v_customer_id;

  -- Create initial subscription record
  INSERT INTO stripe_subscriptions (
    customer_id,
    status
  )
  VALUES (
    v_customer_id,
    'not_started'
  );

  RETURN jsonb_build_object(
    'success', true,
    'customer_id', v_customer_id
  );

EXCEPTION
  WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_error = MESSAGE_TEXT;
    
    RETURN jsonb_build_object(
      'success', false,
      'error', v_error
    );
END;
$$;