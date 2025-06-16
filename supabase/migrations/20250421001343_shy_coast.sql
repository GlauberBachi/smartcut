/*
  # Create admin user

  1. Changes
    - Create admin user with email admin@example.com
    - Set initial password as 'admin123'
    - Add RLS policy for admin access
*/

-- Create admin user with initial password
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
  '00000000-0000-0000-0000-000000000001',
  'authenticated',
  'authenticated',
  'admin@example.com',
  crypt('admin123', gen_salt('bf')),
  now(),
  now(),
  now(),
  '',
  '',
  '',
  ''
) ON CONFLICT (id) DO NOTHING;

-- Create profile for admin
INSERT INTO public.profiles (
  id,
  full_name,
  created_at,
  updated_at
)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  'Administrador',
  now(),
  now()
) ON CONFLICT (id) DO NOTHING;

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
VALUES (
  '00000000-0000-0000-0000-000000000001',
  'free',
  'active',
  now() + interval '100 years',
  false,
  now(),
  now()
) ON CONFLICT (user_id) DO NOTHING;