/*
  # Fix user creation trigger function
  
  1. Changes
    - Add explicit error handling for each step
    - Add detailed logging
    - Fix transaction handling
    - Ensure proper order of operations
    
  2. Security
    - Maintains SECURITY DEFINER
    - Preserves existing permissions
*/

-- First drop the trigger that depends on the function
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

-- Now we can safely drop the function
DROP FUNCTION IF EXISTS handle_new_user();

-- Create new function with proper error handling and logging
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_customer_id text;
  v_error text;
  v_step text;
BEGIN
  -- Initialize step
  v_step := 'Starting user creation';
  
  -- Log start of user creation
  INSERT INTO user_creation_logs (user_id, step)
  VALUES (NEW.id, v_step);

  BEGIN
    -- Create user record
    v_step := 'Creating user record';
    INSERT INTO public.users (id, email, role)
    VALUES (NEW.id, NEW.email, 'user');

    -- Log successful user creation
    INSERT INTO user_creation_logs (user_id, step)
    VALUES (NEW.id, v_step || ' - Success');

    -- Create profile
    v_step := 'Creating profile';
    INSERT INTO public.profiles (id, full_name, phone, birth_date)
    VALUES (NEW.id, '', '', null);

    -- Log successful profile creation
    INSERT INTO user_creation_logs (user_id, step)
    VALUES (NEW.id, v_step || ' - Success');

    -- Create free subscription
    v_step := 'Creating free subscription';
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

    -- Log successful subscription creation
    INSERT INTO user_creation_logs (user_id, step)
    VALUES (NEW.id, v_step || ' - Success');

    -- Create temporary Stripe customer record
    v_step := 'Creating temporary Stripe customer';
    INSERT INTO stripe_customers (
      user_id,
      customer_id,
      created_at,
      updated_at
    )
    VALUES (
      NEW.id,
      'temp_' || encode(gen_random_bytes(16), 'hex'),
      now(),
      now()
    )
    RETURNING customer_id INTO v_customer_id;

    -- Log successful Stripe customer creation
    INSERT INTO user_creation_logs (user_id, step)
    VALUES (NEW.id, v_step || ' - Success');

    -- Create temporary Stripe subscription record
    v_step := 'Creating temporary Stripe subscription';
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
      'temp_' || encode(gen_random_bytes(16), 'hex'),
      'price_1RIDwLGMh07VKLbnujKxoJmN',
      'not_started',
      extract(epoch from now()),
      extract(epoch from (now() + interval '100 years')),
      false,
      now(),
      now()
    );

    -- Log successful Stripe subscription creation
    INSERT INTO user_creation_logs (user_id, step)
    VALUES (NEW.id, v_step || ' - Success');

    -- Log completion
    INSERT INTO user_creation_logs (user_id, step)
    VALUES (NEW.id, 'User creation completed successfully');

    RETURN NEW;

  EXCEPTION 
    WHEN OTHERS THEN
      -- Get error details
      GET STACKED DIAGNOSTICS v_error = MESSAGE_TEXT;
      
      -- Log the error with the step that failed
      INSERT INTO user_creation_logs (user_id, step, error)
      VALUES (NEW.id, v_step || ' - Failed', v_error);

      -- Attempt to clean up any created records
      BEGIN
        IF v_customer_id IS NOT NULL THEN
          DELETE FROM stripe_subscriptions WHERE customer_id = v_customer_id;
          DELETE FROM stripe_customers WHERE user_id = NEW.id;
        END IF;
        DELETE FROM subscriptions WHERE user_id = NEW.id;
        DELETE FROM profiles WHERE id = NEW.id;
        DELETE FROM users WHERE id = NEW.id;
      EXCEPTION
        WHEN OTHERS THEN
          -- Log cleanup error
          INSERT INTO user_creation_logs (user_id, step, error)
          VALUES (NEW.id, 'Cleanup after ' || v_step || ' failed', SQLERRM);
      END;

      -- Return NEW to allow auth user creation even if public schema fails
      RETURN NEW;
  END;
END;
$$;

-- Recreate the trigger
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();