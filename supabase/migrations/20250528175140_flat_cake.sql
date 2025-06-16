/*
  # Fix Stripe customer creation process

  1. Changes
    - Update handle_new_user function to create temporary Stripe records
    - Add proper transaction handling and error logging
    - Ensure records are created in correct order
    - Add temporary IDs that will be updated by Edge Function
    
  2. Security
    - Maintains SECURITY DEFINER
    - Preserves existing permissions
*/

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_customer_id text;
  v_error text;
BEGIN
  -- Start transaction
  BEGIN
    -- Log start of user creation
    INSERT INTO user_creation_logs (user_id, step)
    VALUES (NEW.id, 'Starting user creation process');

    -- Create user record first (required for foreign key constraints)
    INSERT INTO public.users (id, email, role)
    VALUES (NEW.id, NEW.email, 'user');

    -- Log user record creation
    INSERT INTO user_creation_logs (user_id, step)
    VALUES (NEW.id, 'User record created');

    -- Create profile
    INSERT INTO public.profiles (id, full_name, phone, birth_date)
    VALUES (NEW.id, '', '', null);

    -- Log profile creation
    INSERT INTO user_creation_logs (user_id, step)
    VALUES (NEW.id, 'Profile created');

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

    -- Log subscription creation
    INSERT INTO user_creation_logs (user_id, step)
    VALUES (NEW.id, 'Local subscription created');

    -- Create temporary Stripe customer record
    INSERT INTO stripe_customers (
      user_id,
      customer_id,
      created_at,
      updated_at
    )
    VALUES (
      NEW.id,
      'temp_cus_' || encode(gen_random_bytes(16), 'hex'),
      now(),
      now()
    )
    RETURNING customer_id INTO v_customer_id;

    -- Log Stripe customer creation
    INSERT INTO user_creation_logs (user_id, step)
    VALUES (NEW.id, 'Temporary Stripe customer created');

    -- Create temporary Stripe subscription record
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
      'temp_sub_' || encode(gen_random_bytes(16), 'hex'),
      'price_1RIDwLGMh07VKLbnujKxoJmN',
      'not_started',
      extract(epoch from now()),
      extract(epoch from (now() + interval '100 years')),
      false,
      now(),
      now()
    );

    -- Log Stripe subscription creation
    INSERT INTO user_creation_logs (user_id, step)
    VALUES (NEW.id, 'Temporary Stripe subscription created');

    -- Log successful completion
    INSERT INTO user_creation_logs (user_id, step)
    VALUES (NEW.id, 'User creation completed successfully');

    RETURN NEW;

  EXCEPTION
    WHEN OTHERS THEN
      -- Get error details
      GET STACKED DIAGNOSTICS v_error = MESSAGE_TEXT;
      
      -- Log the error
      INSERT INTO user_creation_logs (user_id, step, error)
      VALUES (NEW.id, 'Error during user creation', v_error);

      -- Attempt to clean up any created records
      BEGIN
        DELETE FROM stripe_subscriptions WHERE customer_id = v_customer_id;
        DELETE FROM stripe_customers WHERE user_id = NEW.id;
        DELETE FROM subscriptions WHERE user_id = NEW.id;
        DELETE FROM profiles WHERE id = NEW.id;
        DELETE FROM users WHERE id = NEW.id;
      EXCEPTION
        WHEN OTHERS THEN
          -- Log cleanup error
          INSERT INTO user_creation_logs (user_id, step, error)
          VALUES (NEW.id, 'Error during cleanup', SQLERRM);
      END;

      RETURN NEW;
  END;
END;
$$;