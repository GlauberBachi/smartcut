-- Drop existing trigger and function completely
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS handle_new_user();

-- Simplify user creation - only create essential local records
-- Stripe integration will be handled by Edge Function
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
  v_step := 'Starting local user creation';
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
    VALUES (NEW.id, 'Local user creation completed successfully at ' || now()::text);

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

-- Update the create_user_complete function to handle Stripe creation
CREATE OR REPLACE FUNCTION create_user_complete(
    p_user_id uuid,
    p_email text,
    p_force_recreate boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_state_id uuid;
    v_customer_id text;
    v_error text;
    v_step text;
    v_existing_state text;
    v_lock_timeout timestamptz;
BEGIN
    -- Check if user creation is already in progress or completed
    SELECT id, state INTO v_state_id, v_existing_state
    FROM user_creation_state
    WHERE user_id = p_user_id;

    -- If completed and not forcing recreate, return success
    IF v_existing_state = 'completed' AND NOT p_force_recreate THEN
        RETURN jsonb_build_object(
            'success', true,
            'message', 'User already exists',
            'state', 'completed'
        );
    END IF;

    -- Check for locks (prevent concurrent creation)
    v_lock_timeout := now() - interval '5 minutes';
    IF v_existing_state = 'locked' THEN
        SELECT locked_at INTO v_lock_timeout
        FROM user_creation_state
        WHERE user_id = p_user_id;
        
        -- If lock is recent, return busy
        IF v_lock_timeout > now() - interval '5 minutes' THEN
            RETURN jsonb_build_object(
                'success', false,
                'message', 'User creation in progress',
                'state', 'locked'
            );
        END IF;
    END IF;

    -- Create or update state record with lock
    INSERT INTO user_creation_state (
        user_id, 
        state, 
        step, 
        locked_at,
        updated_at
    )
    VALUES (
        p_user_id, 
        'locked', 
        'Starting complete user creation', 
        now(),
        now()
    )
    ON CONFLICT (user_id) DO UPDATE SET
        state = 'locked',
        step = 'Restarting complete user creation',
        locked_at = now(),
        updated_at = now(),
        retry_count = user_creation_state.retry_count + 1
    RETURNING id INTO v_state_id;

    BEGIN
        -- Step 1: Ensure user record exists
        v_step := 'Ensuring user record';
        UPDATE user_creation_state 
        SET step = v_step, updated_at = now() 
        WHERE id = v_state_id;

        INSERT INTO public.users (id, email, role, created_at, updated_at)
        VALUES (p_user_id, p_email, 'user', now(), now())
        ON CONFLICT (id) DO UPDATE SET
            email = EXCLUDED.email,
            updated_at = now();

        -- Step 2: Ensure profile exists
        v_step := 'Ensuring profile';
        UPDATE user_creation_state 
        SET step = v_step, updated_at = now() 
        WHERE id = v_state_id;

        INSERT INTO public.profiles (id, full_name, phone, birth_date, created_at, updated_at)
        VALUES (p_user_id, '', '', null, now(), now())
        ON CONFLICT (id) DO UPDATE SET
            updated_at = now();

        -- Step 3: Ensure subscription exists
        v_step := 'Ensuring subscription';
        UPDATE user_creation_state 
        SET step = v_step, updated_at = now() 
        WHERE id = v_state_id;

        INSERT INTO public.subscriptions (
            user_id, plan, status, current_period_end, 
            cancel_at_period_end, created_at, updated_at
        )
        VALUES (
            p_user_id, 'free', 'active', now() + interval '100 years',
            false, now(), now()
        )
        ON CONFLICT (user_id) DO UPDATE SET
            plan = EXCLUDED.plan,
            status = EXCLUDED.status,
            updated_at = now();

        -- Step 4: Create temporary Stripe customer (will be updated by Edge Function)
        v_step := 'Creating temporary Stripe customer';
        UPDATE user_creation_state 
        SET step = v_step, updated_at = now() 
        WHERE id = v_state_id;

        INSERT INTO stripe_customers (
            user_id, customer_id, created_at, updated_at
        )
        VALUES (
            p_user_id, 'temp_' || encode(gen_random_bytes(16), 'hex'),
            now(), now()
        )
        ON CONFLICT (user_id) DO UPDATE SET
            updated_at = now()
        RETURNING customer_id INTO v_customer_id;

        -- Get customer_id if not returned
        IF v_customer_id IS NULL THEN
            SELECT customer_id INTO v_customer_id
            FROM stripe_customers
            WHERE user_id = p_user_id AND deleted_at IS NULL;
        END IF;

        -- Step 5: Create temporary Stripe subscription
        v_step := 'Creating temporary Stripe subscription';
        UPDATE user_creation_state 
        SET step = v_step, updated_at = now() 
        WHERE id = v_state_id;

        INSERT INTO stripe_subscriptions (
            customer_id, subscription_id, price_id, status,
            current_period_start, current_period_end, cancel_at_period_end,
            created_at, updated_at
        )
        VALUES (
            v_customer_id, 'temp_' || encode(gen_random_bytes(16), 'hex'),
            'price_1RIDwLGMh07VKLbnujKxoJmN', 'not_started',
            extract(epoch from now()), extract(epoch from (now() + interval '100 years')),
            false, now(), now()
        )
        ON CONFLICT (customer_id) DO UPDATE SET
            updated_at = now();

        -- Mark as completed
        UPDATE user_creation_state 
        SET 
            state = 'completed',
            step = 'Complete user creation finished successfully',
            completed_at = now(),
            locked_at = null,
            updated_at = now()
        WHERE id = v_state_id;

        RETURN jsonb_build_object(
            'success', true,
            'message', 'User created successfully',
            'state', 'completed',
            'customer_id', v_customer_id
        );

    EXCEPTION
        WHEN OTHERS THEN
            GET STACKED DIAGNOSTICS v_error = MESSAGE_TEXT;
            
            -- Mark as failed
            UPDATE user_creation_state 
            SET 
                state = 'failed',
                step = v_step || ' - FAILED',
                error_message = v_error,
                locked_at = null,
                updated_at = now()
            WHERE id = v_state_id;

            RETURN jsonb_build_object(
                'success', false,
                'message', 'User creation failed',
                'error', v_error,
                'step', v_step,
                'state', 'failed'
            );
    END;
END;
$$;

-- Grant necessary permissions
GRANT EXECUTE ON FUNCTION create_user_complete(uuid, text, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION get_user_creation_status(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION cleanup_failed_user_creation() TO authenticated;