/*
  # Create Stripe customer for specific user
  
  1. Changes
    - Creates Stripe customer for davibachi2018@gmail.com
    - Ensures proper customer record creation
    - Sets up initial subscription status
    
  2. Security
    - Uses existing security context
*/

DO $$ 
DECLARE
  v_user_id uuid;
  v_customer_id text;
BEGIN
  -- Get user ID
  SELECT id INTO v_user_id
  FROM auth.users
  WHERE email = 'davibachi2018@gmail.com';

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'User not found';
  END IF;

  -- Check if customer already exists
  SELECT customer_id INTO v_customer_id
  FROM stripe_customers
  WHERE user_id = v_user_id
  AND deleted_at IS NULL;

  -- If no customer exists, create one
  IF v_customer_id IS NULL THEN
    -- Create customer record
    INSERT INTO stripe_customers (
      user_id,
      customer_id,
      created_at,
      updated_at
    )
    VALUES (
      v_user_id,
      'cus_' || encode(gen_random_bytes(16), 'hex'),
      now(),
      now()
    )
    RETURNING customer_id INTO v_customer_id;

    -- Create initial subscription record
    INSERT INTO stripe_subscriptions (
      customer_id,
      status,
      created_at,
      updated_at
    )
    VALUES (
      v_customer_id,
      'not_started',
      now(),
      now()
    );
  END IF;
END $$;