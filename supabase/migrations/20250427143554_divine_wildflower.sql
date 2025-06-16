/*
  # Update all users to free plan
  
  1. Changes
    - Sets all users to have a free subscription
    - Ensures subscription records exist for all users
    - Sets appropriate defaults for subscription fields
    
  2. Security
    - Maintains existing RLS policies
    - No changes to access control
*/

-- First, ensure all users have a subscription record
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
WHERE id NOT IN (SELECT user_id FROM public.subscriptions)
ON CONFLICT (user_id) DO NOTHING;

-- Then update all existing subscriptions to free plan
UPDATE public.subscriptions
SET 
  plan = 'free',
  status = 'active',
  current_period_end = now() + interval '100 years',
  cancel_at_period_end = false,
  updated_at = now()
WHERE plan != 'free';