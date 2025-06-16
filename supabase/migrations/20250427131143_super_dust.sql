/*
  # Add default subscription for new users
  
  1. Changes
    - Update handle_new_user function to create free subscription
    - Ensure all required user records are created in correct order
    
  2. Security
    - Maintains existing RLS policies
    - Function runs with SECURITY DEFINER
*/

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
  
  RETURN NEW;
END;
$$;