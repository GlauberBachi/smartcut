/*
  # Set default free plan for new users

  1. Changes
    - Update handle_new_user function to set free plan for new users
    - Add default values for subscription table
    
  2. Security
    - Maintains existing RLS policies
    - No changes to access control
*/

-- Update the handle_new_user function to ensure free plan creation
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Create default profile
  INSERT INTO public.profiles (id, full_name, phone, birth_date)
  VALUES (new.id, '', '', null);
  
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
    new.id,
    'free',
    'active',
    now() + interval '100 years',
    false,
    now(),
    now()
  );
  
  -- Create user record
  INSERT INTO public.users (id, email)
  VALUES (new.id, new.email);
  
  RETURN new;
END;
$$;