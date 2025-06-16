/*
  # Fix Stripe subscription creation
  
  1. Changes
    - Remove Stripe-related operations from handle_new_user function
    - Keep only local database record creation
    - Improve error handling and logging
    
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
  v_error text;
BEGIN
  -- Start transaction
  BEGIN
    -- Create user record first (required for foreign key constraints)
    INSERT INTO public.users (id, email, role)
    VALUES (NEW.id, NEW.email, 'user');

    -- Create profile
    INSERT INTO public.profiles (id, full_name, phone, birth_date)
    VALUES (NEW.id, '', '', null);

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

    -- Log successful creation
    INSERT INTO user_creation_logs (user_id, step)
    VALUES (NEW.id, 'Local user records created successfully');

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
          -- Log cleanup error but don't throw it
          INSERT INTO user_creation_logs (user_id, step, error)
          VALUES (NEW.id, 'Error during cleanup', SQLERRM);
      END;

      -- Return NEW to allow auth user creation even if public schema fails
      -- This prevents auth user orphaning
      RETURN NEW;
  END;
END;
$$;