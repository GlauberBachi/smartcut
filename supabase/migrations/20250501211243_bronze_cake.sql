/*
  # Create Stripe customer for specific user
  
  1. Changes
    - Create Stripe customer for davibachi2018@gmail.com
    - Add customer record to stripe_customers table
    - Add initial subscription record
*/

DO $$ 
DECLARE
  v_user_id uuid;
BEGIN
  -- Get user ID
  SELECT id INTO v_user_id
  FROM auth.users
  WHERE email = 'davibachi2018@gmail.com';

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'User not found';
  END IF;

  -- Create Stripe customer
  PERFORM create_stripe_customer(v_user_id);
END $$;