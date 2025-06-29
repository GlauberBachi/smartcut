/*
  # Fix duplicate Stripe user creation with idempotency
  
  1. Changes
    - Update create_user_complete function to be more robust
    - Add better state management and locking
    - Ensure atomic operations to prevent race conditions
    
  2. Security
    - Maintains SECURITY DEFINER
    - Preserves existing permissions
*/

-- Update the create_user_complete function with better idempotency
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
    v_temp_uuid text;
    v_existing_lock timestamptz;
BEGIN
    -- Check if user creation is already in progress or completed
    SELECT id, state, locked_at INTO v_state_id, v_existing_state, v_existing_lock
    FROM user_creation_state
    WHERE user_id = p_user_id;

    -- If completed and not forcing recreate, return success immediately
    IF v_existing_state = 'completed' AND NOT p_force_recreate THEN
        -- Get the existing customer_id
        SELECT customer_id INTO v_customer_id
        FROM stripe_customers
        WHERE user_id = p_user_id AND deleted_at IS NULL;
        
        RETURN jsonb_build_object(
            'success', true,
            'message', 'User already exists',
            'state', 'completed',
            'customer_id', v_customer_id
        );
    END IF;

    -- Check for active locks (prevent concurrent creation)
    IF v_existing_state = 'locked' AND v_existing_lock IS NOT NULL THEN
        -- If lock is recent (less than 5 minutes), return busy
        IF v_existing_lock > now() - interval '5 minutes' THEN
            RETURN jsonb_build_object(
                'success', false,
                'message', 'User creation in progress by another process',
                'state', 'locked'
            );
        END IF;
    END IF;

    -- Attempt to acquire lock atomically
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
        'Acquiring lock for user creation', 
        now(),
        now()
    )
    ON CONFLICT (user_id) DO UPDATE SET
        state = 'locked',
        step = 'Re-acquiring lock for user creation',
        locked_at = now(),
        updated_at = now(),
        retry_count = user_creation_state.retry_count + 1
    RETURNING id INTO v_state_id;

    -- Double-check that we actually got the lock
    SELECT state, locked_at INTO v_existing_state, v_existing_lock
    FROM user_creation_state
    WHERE id = v_state_id;

    IF v_existing_state != 'locked' OR v_existing_lock IS NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'message', 'Failed to acquire lock',
            'state', v_existing_state
        );
    END IF;

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

        -- Step 4: Ensure temporary Stripe customer exists (if not already real)
        v_step := 'Ensuring Stripe customer record';
        UPDATE user_creation_state 
        SET step = v_step, updated_at = now() 
        WHERE id = v_state_id;

        -- Check if we already have a customer record
        SELECT customer_id INTO v_customer_id
        FROM stripe_customers
        WHERE user_id = p_user_id AND deleted_at IS NULL;

        -- Only create temp customer if none exists or if it's still temp
        IF v_customer_id IS NULL OR v_customer_id LIKE 'temp_%' THEN
            -- Generate temporary customer ID using UUID
            v_temp_uuid := replace(gen_random_uuid()::text, '-', '');
            v_customer_id := 'temp_' || substr(v_temp_uuid, 1, 16);

            INSERT INTO stripe_customers (
                user_id, customer_id, created_at, updated_at
            )
            VALUES (
                p_user_id, v_customer_id, now(), now()
            )
            ON CONFLICT (user_id) DO UPDATE SET
                customer_id = CASE 
                    WHEN stripe_customers.customer_id LIKE 'temp_%' THEN EXCLUDED.customer_id
                    ELSE stripe_customers.customer_id
                END,
                updated_at = now()
            RETURNING customer_id INTO v_customer_id;
        END IF;

        -- Step 5: Ensure temporary Stripe subscription exists
        v_step := 'Ensuring Stripe subscription record';
        UPDATE user_creation_state 
        SET step = v_step, updated_at = now() 
        WHERE id = v_state_id;

        -- Generate temporary subscription ID using UUID
        v_temp_uuid := replace(gen_random_uuid()::text, '-', '');

        INSERT INTO stripe_subscriptions (
            customer_id, subscription_id, price_id, status,
            current_period_start, current_period_end, cancel_at_period_end,
            created_at, updated_at
        )
        VALUES (
            v_customer_id, 'temp_' || substr(v_temp_uuid, 1, 16),
            'price_1RIDwLGMh07VKLbnujKxoJmN', 'not_started',
            extract(epoch from now()), extract(epoch from (now() + interval '100 years')),
            false, now(), now()
        )
        ON CONFLICT (customer_id) DO UPDATE SET
            updated_at = now();

        -- Keep the lock but mark as ready for Stripe integration
        UPDATE user_creation_state 
        SET 
            step = 'Ready for Stripe integration',
            updated_at = now()
        WHERE id = v_state_id;

        RETURN jsonb_build_object(
            'success', true,
            'message', 'User records prepared, ready for Stripe integration',
            'state', 'locked',
            'customer_id', v_customer_id
        );

    EXCEPTION
        WHEN OTHERS THEN
            GET STACKED DIAGNOSTICS v_error = MESSAGE_TEXT;
            
            -- Mark as failed and release lock
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

-- Add function to clean up old locks
CREATE OR REPLACE FUNCTION cleanup_stale_user_creation_locks()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_cleaned integer := 0;
BEGIN
    -- Clean up locks older than 10 minutes
    UPDATE user_creation_state 
    SET 
        state = 'failed',
        error_message = 'Lock timeout - process abandoned',
        locked_at = null,
        updated_at = now()
    WHERE state = 'locked' 
    AND locked_at < now() - interval '10 minutes';
    
    GET DIAGNOSTICS v_cleaned = ROW_COUNT;
    
    RETURN v_cleaned;
END;
$$;

-- Grant necessary permissions
GRANT EXECUTE ON FUNCTION cleanup_stale_user_creation_locks() TO authenticated;