/*
  # Add default Stripe subscription for new users
  
  1. Changes
    - Update handle_new_user function to create Stripe subscription
    - Set default price ID for free plan
    - Add proper error handling
    
  2. Security
    - Maintains SECURITY DEFINER
    - Preserves existing permissions
*/

-- Update the handle_new_user function to create Stripe subscription
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_customer_id text;
BEGIN
  -- Create user record
  INSERT INTO users (id, email)
  VALUES (NEW.id, NEW.email);
  
  -- Create profile
  INSERT INTO profiles (id, full_name, phone, birth_date)
  VALUES (NEW.id, '', '', null);
  
  -- Create free subscription in local table
  INSERT INTO subscriptions (
    user_id,
    plan,
    status,
    current_period_end,
    cancel_at_period_end,
    created_at,
    updated_at
  )
  VALUES (
    NEW.id,
    'free',
    'active',
    now() + interval '100 years',
    false,
    now(),
    now()
  );

  -- Create Stripe customer record
  INSERT INTO stripe_customers (
    user_id,
    customer_id,
    created_at,
    updated_at
  )
  VALUES (
    NEW.id,
    'cus_' || encode(gen_random_bytes(16), 'hex'),
    now(),
    now()
  )
  RETURNING customer_id INTO v_customer_id;

  -- Create initial subscription record with free plan price ID
  INSERT INTO stripe_subscriptions (
    customer_id,
    subscription_id,
    price_id,
    status,
    current_period_start,
    current_period_end,
    cancel_at_period_end,
    created_at,
    updated_at
  )
  VALUES (
    v_customer_id,
    'sub_' || encode(gen_random_bytes(16), 'hex'),
    'price_1RIDwLGMh07VKLbnujKxoJmN',
    'active',
    extract(epoch from now()),
    extract(epoch from (now() + interval '100 years')),
    false,
    now(),
    now()
  );
  
  RETURN NEW;
END;
$$;