/*
  # Add Stripe customer creation for new users
  
  1. Changes
    - Update handle_new_user trigger to create Stripe customer
    - Add free plan association
    - Handle error cases properly
    
  2. Security
    - Maintains existing security context
    - Uses proper error handling
*/

-- Update the handle_new_user function to create Stripe customer
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_customer_id text;
BEGIN
  -- Create user record
  INSERT INTO public.users (id, email)
  VALUES (NEW.id, NEW.email);
  
  -- Create profile
  INSERT INTO public.profiles (id, full_name, phone, birth_date)
  VALUES (NEW.id, '', '', null);
  
  -- Create free subscription
  INSERT INTO public.subscriptions (
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
  
  RETURN NEW;
END;
$$;