/*
  # Fix user creation flow and timing
  
  1. Changes
    - Update handle_new_user to ensure records are committed
    - Add proper transaction handling
    - Add detailed logging
    - Remove premature Stripe record creation
    
  2. Security
    - Maintains SECURITY DEFINER
    - Preserves RLS policies
*/

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
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
    VALUES (NEW.id, 'Free subscription created');

    -- Force commit the transaction to ensure records are available
    COMMIT;

    -- Start new transaction for final logging
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