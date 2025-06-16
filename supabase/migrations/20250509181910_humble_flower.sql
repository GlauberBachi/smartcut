/*
  # Add error logging to handle_new_user function
  
  1. Changes
    - Add detailed error logging to handle_new_user function
    - Add transaction handling
    - Add specific error states for each operation
    - Return detailed error information
    
  2. Security
    - Maintains SECURITY DEFINER
    - Keeps proper schema search path
*/

-- Create error logging table
CREATE TABLE IF NOT EXISTS user_creation_logs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL,
    step text NOT NULL,
    error text,
    created_at timestamptz DEFAULT now()
);

-- Update the handle_new_user function with error logging
CREATE OR REPLACE FUNCTION public.handle_new_user()
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
    -- Start transaction
    BEGIN
        v_step := 'Creating user record';
        INSERT INTO public.users (id, email)
        VALUES (NEW.id, NEW.email);

        v_step := 'Creating profile';
        INSERT INTO public.profiles (id, full_name, phone, birth_date)
        VALUES (NEW.id, '', '', null);

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

        v_step := 'Creating Stripe customer record';
        INSERT INTO stripe_customers (
            user_id,
            customer_id,
            created_at,
            updated_at
        )
        VALUES (
            NEW.id,
            'cus_' || encode(gen_random_bytes(16), 'hex'),
            now(),
            now()
        )
        RETURNING customer_id INTO v_customer_id;

        v_step := 'Creating initial Stripe subscription record';
        INSERT INTO stripe_subscriptions (
            customer_id,
            status,
            created_at,
            updated_at
        )
        VALUES (
            v_customer_id,
            'not_started'::stripe_subscription_status,
            now(),
            now()
        );

        -- Log successful completion
        INSERT INTO user_creation_logs (user_id, step)
        VALUES (NEW.id, 'User creation completed successfully');

        RETURN NEW;

    EXCEPTION
        WHEN OTHERS THEN
            GET STACKED DIAGNOSTICS v_error = MESSAGE_TEXT;
            
            -- Log the error
            INSERT INTO user_creation_logs (user_id, step, error)
            VALUES (NEW.id, v_step, v_error);

            -- Clean up any created records in reverse order
            BEGIN
                IF v_customer_id IS NOT NULL THEN
                    DELETE FROM stripe_subscriptions WHERE customer_id = v_customer_id;
                    DELETE FROM stripe_customers WHERE customer_id = v_customer_id;
                END IF;

                DELETE FROM subscriptions WHERE user_id = NEW.id;
                DELETE FROM profiles WHERE id = NEW.id;
                DELETE FROM users WHERE id = NEW.id;
            EXCEPTION
                WHEN OTHERS THEN
                    -- Log cleanup error but don't throw it
                    INSERT INTO user_creation_logs (user_id, step, error)
                    VALUES (NEW.id, 'Cleanup after error', SQLERRM);
            END;

            RAISE EXCEPTION 'Error during user creation at step "%": %', v_step, v_error;
    END;
END;
$$;