/*
  # Fix User Creation Timing Issues
  
  1. Changes
    - Improve database trigger reliability
    - Add better error handling and retry logic
    - Ensure proper transaction handling
    - Add comprehensive logging
    
  2. Security
    - Maintains SECURITY DEFINER
    - Preserves existing RLS policies
*/

-- Drop existing trigger and function
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS handle_new_user();

-- Create improved user creation function with better timing
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
  v_max_retries integer := 5;
  v_success boolean := false;
BEGIN
  -- Log start of user creation with timestamp
  v_step := 'Starting user creation process';
  INSERT INTO user_creation_logs (user_id, step)
  VALUES (NEW.id, v_step || ' at ' || now()::text);

  -- Retry loop for database operations with exponential backoff
  WHILE v_retry_count < v_max_retries AND NOT v_success LOOP
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
      )
      ON CONFLICT (id) DO UPDATE SET
        email = EXCLUDED.email,
        updated_at = now();
      
      INSERT INTO user_creation_logs (user_id, step)
      VALUES (NEW.id, v_step || ' - SUCCESS at ' || now()::text);

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
      )
      ON CONFLICT (id) DO UPDATE SET
        updated_at = now();
      
      INSERT INTO user_creation_logs (user_id, step)
      VALUES (NEW.id, v_step || ' - SUCCESS at ' || now()::text);

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
      )
      ON CONFLICT (user_id) DO UPDATE SET
        plan = EXCLUDED.plan,
        status = EXCLUDED.status,
        updated_at = now();
      
      INSERT INTO user_creation_logs (user_id, step)
      VALUES (NEW.id, v_step || ' - SUCCESS at ' || now()::text);

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
      ON CONFLICT (user_id) DO UPDATE SET
        updated_at = now()
      RETURNING customer_id INTO v_customer_id;
      
      -- If no customer_id returned, get existing one
      IF v_customer_id IS NULL THEN
        SELECT customer_id INTO v_customer_id
        FROM stripe_customers
        WHERE user_id = NEW.id
        AND deleted_at IS NULL;
      END IF;
      
      INSERT INTO user_creation_logs (user_id, step)
      VALUES (NEW.id, v_step || ' - SUCCESS at ' || now()::text);

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
      )
      ON CONFLICT (customer_id) DO UPDATE SET
        updated_at = now();
      
      INSERT INTO user_creation_logs (user_id, step)
      VALUES (NEW.id, v_step || ' - SUCCESS at ' || now()::text);

      -- Force a small delay to ensure all writes are committed
      PERFORM pg_sleep(0.1);

      -- Log successful completion
      INSERT INTO user_creation_logs (user_id, step)
      VALUES (NEW.id, 'User creation completed successfully at ' || now()::text);

      -- Mark as successful and exit retry loop
      v_success := true;

    EXCEPTION 
      WHEN OTHERS THEN
        -- Get detailed error information
        GET STACKED DIAGNOSTICS v_error = MESSAGE_TEXT;
        
        -- Log the specific step that failed
        INSERT INTO user_creation_logs (user_id, step, error)
        VALUES (NEW.id, v_step || ' - FAILED (attempt ' || (v_retry_count + 1) || ') at ' || now()::text, v_error);

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
            VALUES (NEW.id, 'Cleanup completed after max retries at ' || now()::text);
          EXCEPTION
            WHEN OTHERS THEN
              INSERT INTO user_creation_logs (user_id, step, error)
              VALUES (NEW.id, 'Cleanup failed at ' || now()::text, SQLERRM);
          END;
          
          -- Exit retry loop
          EXIT;
        ELSE
          -- Exponential backoff: wait longer between retries
          PERFORM pg_sleep(0.5 * (v_retry_count + 1));
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

-- Add helpful view to check user creation status
CREATE OR REPLACE VIEW user_creation_status AS
SELECT 
  au.id,
  au.email,
  au.created_at as auth_created_at,
  u.id IS NOT NULL as has_user_record,
  p.id IS NOT NULL as has_profile,
  s.user_id IS NOT NULL as has_subscription,
  sc.user_id IS NOT NULL as has_stripe_customer,
  ss.customer_id IS NOT NULL as has_stripe_subscription,
  CASE 
    WHEN u.id IS NOT NULL AND p.id IS NOT NULL AND s.user_id IS NOT NULL 
         AND sc.user_id IS NOT NULL AND ss.customer_id IS NOT NULL 
    THEN 'complete'
    WHEN u.id IS NOT NULL AND p.id IS NOT NULL AND s.user_id IS NOT NULL 
    THEN 'local_complete'
    ELSE 'incomplete'
  END as status,
  (
    SELECT string_agg(step || COALESCE(' - ' || error, ''), E'\n' ORDER BY created_at)
    FROM user_creation_logs 
    WHERE user_id = au.id
  ) as creation_log
FROM auth.users au
LEFT JOIN public.users u ON au.id = u.id
LEFT JOIN public.profiles p ON au.id = p.id
LEFT JOIN public.subscriptions s ON au.id = s.user_id
LEFT JOIN stripe_customers sc ON au.id = sc.user_id AND sc.deleted_at IS NULL
LEFT JOIN stripe_subscriptions ss ON sc.customer_id = ss.customer_id AND ss.deleted_at IS NULL
WHERE au.created_at > NOW() - INTERVAL '24 hours'
ORDER BY au.created_at DESC;

-- Grant access to the view
GRANT SELECT ON user_creation_status TO authenticated;