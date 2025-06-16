/*
  # Fix user creation trigger and function
  
  1. Changes
    - Drop trigger before function to avoid dependency error
    - Recreate function with proper error handling
    - Add detailed logging for each step
    
  2. Security
    - Maintains SECURITY DEFINER
    - Preserves existing permissions
*/

-- First drop the trigger that depends on the function
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

-- Now we can safely drop the function
DROP FUNCTION IF EXISTS handle_new_user();

-- Create new function with proper error handling
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_error text;
BEGIN
  -- Log start of user creation
  INSERT INTO user_creation_logs (user_id, step)
  VALUES (NEW.id, 'Starting user creation process');

  BEGIN
    -- Create user record first
    INSERT INTO public.users (id, email, role)
    VALUES (NEW.id, NEW.email, 'user');

    -- Log successful user creation
    INSERT INTO user_creation_logs (user_id, step)
    VALUES (NEW.id, 'User record created successfully');

    -- Create profile
    INSERT INTO public.profiles (id, full_name, phone, birth_date)
    VALUES (NEW.id, '', '', null);

    -- Log successful profile creation
    INSERT INTO user_creation_logs (user_id, step)
    VALUES (NEW.id, 'Profile created successfully');

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

    -- Log successful subscription creation
    INSERT INTO user_creation_logs (user_id, step)
    VALUES (NEW.id, 'Free subscription created successfully');

    -- Log completion
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

      -- Return NEW to allow auth user creation even if public schema fails
      RETURN NEW;
  END;
END;
$$;

-- Recreate the trigger
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();