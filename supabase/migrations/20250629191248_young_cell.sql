/*
  # Fix user creation timing issues
  
  1. Changes
    - Improve handle_new_user function with better error handling
    - Add more detailed logging
    - Ensure proper transaction handling
    - Add retry mechanism for database operations
    
  2. Security
    - Maintains SECURITY DEFINER
    - Preserves existing permissions
*/

-- Drop existing trigger and function
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS handle_new_user();

-- Create improved user creation function
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
  v_retry_count integer := 0;
  v_max_retries integer := 3;
BEGIN
  -- Log start of user creation
  v_step := 'Starting user creation process';
  INSERT INTO user_creation_logs (user_id, step)
  VALUES (NEW.id, v_step);

  -- Retry loop for database operations
  WHILE v_retry_count < v_max_retries LOOP
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

      -- Step 4: Create temporary Stripe customer record
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
      
      INSERT INTO user_creation_logs (user_id, step)
      VALUES (NEW.id, v_step || ' - SUCCESS');

      -- Step 5: Create temporary Stripe subscription record
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
      
      INSERT INTO user_creation_logs (user_id, step)
      VALUES (NEW.id, v_step || ' - SUCCESS');

      -- Log successful completion
      INSERT INTO user_creation_logs (user_id, step)
      VALUES (NEW.id, 'User creation completed successfully');

      -- Exit retry loop on success
      EXIT;

    EXCEPTION 
      WHEN OTHERS THEN
        -- Get detailed error information
        GET STACKED DIAGNOSTICS v_error = MESSAGE_TEXT;
        
        -- Log the specific step that failed
        INSERT INTO user_creation_logs (user_id, step, error)
        VALUES (NEW.id, v_step || ' - FAILED (attempt ' || (v_retry_count + 1) || ')', v_error);

        -- Increment retry count
        v_retry_count := v_retry_count + 1;

        -- If we've exhausted retries, attempt cleanup
        IF v_retry_count >= v_max_retries THEN
          BEGIN
            DELETE FROM stripe_subscriptions WHERE customer_id = v_customer_id;
            DELETE FROM stripe_customers WHERE user_id = NEW.id;
            DELETE FROM subscriptions WHERE user_id = NEW.id;
            DELETE FROM profiles WHERE id = NEW.id;
            DELETE FROM users WHERE id = NEW.id;
            
            INSERT INTO user_creation_logs (user_id, step)
            VALUES (NEW.id, 'Cleanup completed after max retries');
          EXCEPTION
            WHEN OTHERS THEN
              INSERT INTO user_creation_logs (user_id, step, error)
              VALUES (NEW.id, 'Cleanup failed', SQLERRM);
          END;
          
          -- Exit retry loop
          EXIT;
        ELSE
          -- Wait a bit before retrying
          PERFORM pg_sleep(0.5);
        END IF;
    END;
  END LOOP;

  -- Always return NEW to allow auth.users creation
  RETURN NEW;
END;
$$;

-- Recreate the trigger
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- Add index to improve performance on user_creation_logs
CREATE INDEX IF NOT EXISTS idx_user_creation_logs_user_id_created_at 
ON user_creation_logs(user_id, created_at DESC);

-- Ensure RLS is properly configured
ALTER TABLE user_creation_logs ENABLE ROW LEVEL SECURITY;

-- Update policies for better debugging access
DROP POLICY IF EXISTS "Enable insert for authentication service" ON user_creation_logs;
DROP POLICY IF EXISTS "Users can view their own creation logs" ON user_creation_logs;

CREATE POLICY "Enable insert for authentication service"
  ON user_creation_logs
  FOR INSERT
  TO public
  WITH CHECK (true);

CREATE POLICY "Users can view their own creation logs"
  ON user_creation_logs
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());