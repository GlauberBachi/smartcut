/*
  # Reescrita completa do sistema de criação de usuários
  
  1. Mudanças Drásticas
    - Remove trigger automático completamente
    - Cria sistema manual de criação via Edge Function
    - Adiciona tabela de controle de estado
    - Implementa sistema de retry robusto
    
  2. Nova Arquitetura
    - Edge Function controla todo o processo
    - Tabela de estado para tracking
    - Sistema de locks para evitar duplicação
    - Rollback automático em caso de erro
*/

-- Drop existing trigger and function completely
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS handle_new_user();

-- Create user creation state tracking table
CREATE TABLE IF NOT EXISTS user_creation_state (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid UNIQUE NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    state text NOT NULL DEFAULT 'pending',
    step text,
    error_message text,
    retry_count integer DEFAULT 0,
    locked_at timestamptz,
    completed_at timestamptz,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),
    CONSTRAINT valid_state CHECK (state IN ('pending', 'in_progress', 'completed', 'failed', 'locked'))
);

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_user_creation_state_user_id ON user_creation_state(user_id);
CREATE INDEX IF NOT EXISTS idx_user_creation_state_state ON user_creation_state(state);
CREATE INDEX IF NOT EXISTS idx_user_creation_state_locked_at ON user_creation_state(locked_at);

-- Enable RLS
ALTER TABLE user_creation_state ENABLE ROW LEVEL SECURITY;

-- Add policies
CREATE POLICY "Users can view their own creation state"
    ON user_creation_state
    FOR SELECT
    TO authenticated
    USING (user_id = auth.uid());

-- Create comprehensive user creation function
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
        'Starting user creation', 
        now(),
        now()
    )
    ON CONFLICT (user_id) DO UPDATE SET
        state = 'locked',
        step = 'Restarting user creation',
        locked_at = now(),
        updated_at = now(),
        retry_count = user_creation_state.retry_count + 1
    RETURNING id INTO v_state_id;

    BEGIN
        -- Step 1: Create user record
        v_step := 'Creating user record';
        UPDATE user_creation_state 
        SET step = v_step, updated_at = now() 
        WHERE id = v_state_id;

        INSERT INTO public.users (id, email, role, created_at, updated_at)
        VALUES (p_user_id, p_email, 'user', now(), now())
        ON CONFLICT (id) DO UPDATE SET
            email = EXCLUDED.email,
            updated_at = now();

        -- Step 2: Create profile
        v_step := 'Creating profile';
        UPDATE user_creation_state 
        SET step = v_step, updated_at = now() 
        WHERE id = v_state_id;

        INSERT INTO public.profiles (id, full_name, phone, birth_date, created_at, updated_at)
        VALUES (p_user_id, '', '', null, now(), now())
        ON CONFLICT (id) DO UPDATE SET
            updated_at = now();

        -- Step 3: Create subscription
        v_step := 'Creating subscription';
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

        -- Step 4: Create Stripe customer
        v_step := 'Creating Stripe customer';
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

        -- Step 5: Create Stripe subscription
        v_step := 'Creating Stripe subscription';
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
            step = 'User creation completed successfully',
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

            -- Attempt cleanup
            BEGIN
                DELETE FROM stripe_subscriptions WHERE customer_id = v_customer_id;
                DELETE FROM stripe_customers WHERE user_id = p_user_id;
                DELETE FROM subscriptions WHERE user_id = p_user_id;
                DELETE FROM profiles WHERE id = p_user_id;
                DELETE FROM users WHERE id = p_user_id;
            EXCEPTION
                WHEN OTHERS THEN
                    -- Log cleanup error but don't fail
                    UPDATE user_creation_state 
                    SET error_message = v_error || ' | Cleanup failed: ' || SQLERRM
                    WHERE id = v_state_id;
            END;

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

-- Create function to check user creation status
CREATE OR REPLACE FUNCTION get_user_creation_status(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_state record;
    v_has_user boolean := false;
    v_has_profile boolean := false;
    v_has_subscription boolean := false;
    v_has_stripe_customer boolean := false;
    v_has_stripe_subscription boolean := false;
BEGIN
    -- Get creation state
    SELECT * INTO v_state
    FROM user_creation_state
    WHERE user_id = p_user_id;

    -- Check what records exist
    SELECT EXISTS(SELECT 1 FROM users WHERE id = p_user_id) INTO v_has_user;
    SELECT EXISTS(SELECT 1 FROM profiles WHERE id = p_user_id) INTO v_has_profile;
    SELECT EXISTS(SELECT 1 FROM subscriptions WHERE user_id = p_user_id) INTO v_has_subscription;
    SELECT EXISTS(SELECT 1 FROM stripe_customers WHERE user_id = p_user_id AND deleted_at IS NULL) INTO v_has_stripe_customer;
    SELECT EXISTS(
        SELECT 1 FROM stripe_subscriptions ss 
        JOIN stripe_customers sc ON ss.customer_id = sc.customer_id 
        WHERE sc.user_id = p_user_id AND sc.deleted_at IS NULL AND ss.deleted_at IS NULL
    ) INTO v_has_stripe_subscription;

    RETURN jsonb_build_object(
        'user_id', p_user_id,
        'state', COALESCE(v_state.state, 'not_started'),
        'step', v_state.step,
        'error', v_state.error_message,
        'retry_count', COALESCE(v_state.retry_count, 0),
        'created_at', v_state.created_at,
        'completed_at', v_state.completed_at,
        'records', jsonb_build_object(
            'user', v_has_user,
            'profile', v_has_profile,
            'subscription', v_has_subscription,
            'stripe_customer', v_has_stripe_customer,
            'stripe_subscription', v_has_stripe_subscription
        )
    );
END;
$$;

-- Create cleanup function for failed states
CREATE OR REPLACE FUNCTION cleanup_failed_user_creation()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_cleaned integer := 0;
    v_user_id uuid;
BEGIN
    -- Clean up old locked states (older than 10 minutes)
    FOR v_user_id IN 
        SELECT user_id 
        FROM user_creation_state 
        WHERE state = 'locked' 
        AND locked_at < now() - interval '10 minutes'
    LOOP
        UPDATE user_creation_state 
        SET 
            state = 'failed',
            error_message = 'Lock timeout - process abandoned',
            locked_at = null,
            updated_at = now()
        WHERE user_id = v_user_id;
        
        v_cleaned := v_cleaned + 1;
    END LOOP;

    RETURN v_cleaned;
END;
$$;

-- Grant necessary permissions
GRANT EXECUTE ON FUNCTION create_user_complete(uuid, text, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION get_user_creation_status(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION cleanup_failed_user_creation() TO authenticated;