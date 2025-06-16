/*
  # Create admin user with explicit ID
  
  1. Changes
    - Remove existing admin users
    - Create new admin user with explicit UUID
    - Set up admin role and related records
    
  2. Security
    - Password is securely hashed
    - Admin role is properly configured
*/

DO $$ 
DECLARE
  new_user_id uuid := gen_random_uuid();
BEGIN
  -- First, remove any existing admin users and related records
  DELETE FROM public.subscriptions WHERE user_id IN (SELECT id FROM auth.users WHERE email IN ('admin@admin.com', 'admin@example.com'));
  DELETE FROM public.profiles WHERE id IN (SELECT id FROM auth.users WHERE email IN ('admin@admin.com', 'admin@example.com'));
  DELETE FROM public.users WHERE email IN ('admin@admin.com', 'admin@example.com');
  DELETE FROM auth.users WHERE email IN ('admin@admin.com', 'admin@example.com');

  -- Create the user in auth.users first with explicit ID
  INSERT INTO auth.users (
    id,
    instance_id,
    aud,
    role,
    email,
    encrypted_password,
    email_confirmed_at,
    created_at,
    updated_at,
    confirmation_token,
    email_change_token_current,
    email_change_token_new,
    recovery_token
  )
  VALUES (
    new_user_id,
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'admin@admin.com',
    crypt('admin2330', gen_salt('bf')),
    now(),
    now(),
    now(),
    '',
    '',
    '',
    ''
  );

  -- Small delay to ensure trigger completes
  PERFORM pg_sleep(0.1);

  -- Update the user role to admin
  UPDATE public.users
  SET role = 'admin'
  WHERE id = new_user_id;

  -- Create profile
  INSERT INTO public.profiles (
    id,
    full_name,
    created_at,
    updated_at
  )
  VALUES (
    new_user_id,
    'Administrador',
    now(),
    now()
  );

  -- Create subscription
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
    new_user_id,
    'free',
    'active',
    now() + interval '100 years',
    false,
    now(),
    now()
  );
END $$;