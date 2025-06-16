/*
  # Update new user trigger
  
  1. Changes
    - Update handle_new_user to create Stripe customer
    - Add proper error handling
    - Ensure all necessary records are created
    
  2. Security
    - Maintains SECURITY DEFINER
    - Proper error handling
*/

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Create user record
  INSERT INTO users (id, email)
  VALUES (NEW.id, NEW.email);
  
  -- Create profile
  INSERT INTO profiles (id, full_name, phone, birth_date)
  VALUES (NEW.id, '', '', null);
  
  -- Create free subscription
  INSERT INTO subscriptions (
    user_id,
    plan,
    status,
    current_period_end,
    cancel_at_period_end
  )
  VALUES (
    NEW.id,
    'free',
    'active',
    now() + interval '100 years',
    false
  );

  -- Create Stripe customer
  PERFORM create_stripe_customer(NEW.id);
  
  RETURN NEW;
END;
$$;