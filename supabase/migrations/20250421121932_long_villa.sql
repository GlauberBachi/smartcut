/*
  # Clean database and recreate admin user

  1. Changes
    - Remove all existing users and related data
    - Create new admin user with proper relationships
    - Ensure all foreign key constraints are respected
    
  2. Security
    - Maintains RLS protection
    - Sets up proper admin role
*/

DO $$ 
DECLARE
  new_user_id uuid;
BEGIN
  -- First, disable RLS temporarily to allow cleanup
  ALTER TABLE users DISABLE ROW LEVEL SECURITY;
  ALTER TABLE profiles DISABLE ROW LEVEL SECURITY;
  ALTER TABLE subscriptions DISABLE ROW LEVEL SECURITY;
  ALTER TABLE notifications DISABLE ROW LEVEL SECURITY;
  ALTER TABLE user_notifications DISABLE ROW LEVEL SECURITY;

  -- Delete all data in reverse order of dependencies
  DELETE FROM user_notifications;
  DELETE FROM notifications;
  DELETE FROM subscriptions;
  DELETE FROM profiles;
  DELETE FROM users;
  DELETE FROM auth.users;

  -- Re-enable RLS
  ALTER TABLE users ENABLE ROW LEVEL SECURITY;
  ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
  ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
  ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
  ALTER TABLE user_notifications ENABLE ROW LEVEL SECURITY;

  -- Create new admin user
  INSERT INTO auth.users (
    instance_id,
    id,
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
    '00000000-0000-0000-0000-000000000000',
    gen_random_uuid(),
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
  )
  RETURNING id INTO new_user_id;

  -- Small delay to ensure trigger completes
  PERFORM pg_sleep(0.1);

  -- Update the user role to admin
  UPDATE public.users
  SET role = 'admin'
  WHERE email = 'admin@admin.com';

  -- Create profile for admin
  INSERT INTO public.profiles (
    id,
    full_name,
    created_at,
    updated_at
  )
  SELECT
    id,
    'Administrador',
    now(),
    now()
  FROM auth.users
  WHERE email = 'admin@admin.com';

  -- Create subscription for admin
  INSERT INTO public.subscriptions (
    user_id,
    plan,
    status,
    current_period_end,
    cancel_at_period_end,
    created_at,
    updated_at
  )
  SELECT
    id,
    'free',
    'active',
    now() + interval '100 years',
    false,
    now(),
    now()
  FROM auth.users
  WHERE email = 'admin@admin.com';

END $$;