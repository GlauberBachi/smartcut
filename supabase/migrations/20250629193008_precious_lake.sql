/*
  # Fix User Creation Timing Issues
  
  1. Changes
    - Simplify the trigger to only create essential local records
    - Remove Stripe operations from trigger completely
    - Add better error handling and logging
    - Ensure proper transaction handling
    
  2. Security
    - Maintains SECURITY DEFINER
    - Preserves existing permissions
*/

-- Drop existing trigger and function
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS handle_new_user();

-- Create simplified and more reliable user creation function
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_error text;
  v_step text;
BEGIN
  -- Log start of user creation
  v_step := 'Starting user creation process';
  INSERT INTO user_creation_logs (user_id, step)
  VALUES (NEW.id, v_step || ' at ' || now()::text);

  BEGIN
    -- Step 1: Create user record (CRITICAL - this must succeed)
    v_step := 'Creating user record';
    INSERT INTO public.users (id, email, role, created_at, updated_at)
    VALUES (
      NEW.id, 
      NEW.email, 
      'user', 
      now(), 
      now()
    );
    
    INSERT INTO user_creation_logs (user_id, step)
    VALUES (NEW.id, v_step || ' - SUCCESS');

    -- Step 2: Create profile record
    v_step := 'Creating profile record';
    INSERT INTO public.profiles (id, full_name, phone, birth_date, created_at, updated_at)
    VALUES (
      NEW.id, 
      '', 
      '', 
      null, 
      now(), 
      now()
    );
    
    INSERT INTO user_creation_logs (user_id, step)
    VALUES (NEW.id, v_step || ' - SUCCESS');

    -- Step 3: Create free subscription
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
    
    INSERT INTO user_creation_logs (user_id, step)
    VALUES (NEW.id, v_step || ' - SUCCESS');

    -- Log successful completion
    INSERT INTO user_creation_logs (user_id, step)
    VALUES (NEW.id, 'Local user creation completed successfully');

    RETURN NEW;

  EXCEPTION 
    WHEN OTHERS THEN
      -- Get detailed error information
      GET STACKED DIAGNOSTICS v_error = MESSAGE_TEXT;
      
      -- Log the specific step that failed
      INSERT INTO user_creation_logs (user_id, step, error)
      VALUES (NEW.id, v_step || ' - FAILED', v_error);

      -- Attempt cleanup (in reverse order)
      BEGIN
        DELETE FROM subscriptions WHERE user_id = NEW.id;
        DELETE FROM profiles WHERE id = NEW.id;
        DELETE FROM users WHERE id = NEW.id;
        
        INSERT INTO user_creation_logs (user_id, step)
        VALUES (NEW.id, 'Cleanup completed after error');
      EXCEPTION
        WHEN OTHERS THEN
          INSERT INTO user_creation_logs (user_id, step, error)
          VALUES (NEW.id, 'Cleanup failed', SQLERRM);
      END;

      -- Still return NEW to allow auth.users creation
      -- This prevents orphaned auth records
      RETURN NEW;
  END;
END;
$$;

-- Recreate the trigger
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();