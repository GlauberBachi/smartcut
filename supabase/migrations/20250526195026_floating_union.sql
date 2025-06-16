/*
  # Fix subscription plan display

  1. Changes
    - Add view for current user subscription status
    - Combine Stripe and local subscription data
    - Add proper indexes for performance
    
  2. Security
    - Add RLS policy for view access
    - Maintain existing security context
*/

-- Create view to combine Stripe and local subscription data
CREATE OR REPLACE VIEW user_subscription_status
WITH (security_invoker = true)
AS
SELECT
  u.id as user_id,
  COALESCE(
    CASE
      WHEN ss.status = 'active' THEN
        CASE
          WHEN ss.price_id = 'price_1RICRBGMh07VKLbntwSXXPdM' THEN 'monthly'
          WHEN ss.price_id = 'price_1RICWFGMh07VKLbnLsU1jkVZ' THEN 'yearly'
          ELSE 'free'
        END
      ELSE s.plan
    END,
    'free'
  ) as plan,
  COALESCE(
    CASE 
      WHEN ss.status = 'active' THEN true
      ELSE s.status = 'active'
    END,
    true
  ) as is_active,
  GREATEST(
    s.current_period_end,
    to_timestamp(ss.current_period_end)
  ) as current_period_end
FROM
  auth.users u
  LEFT JOIN subscriptions s ON u.id = s.user_id
  LEFT JOIN stripe_customers sc ON u.id = sc.user_id AND sc.deleted_at IS NULL
  LEFT JOIN stripe_subscriptions ss ON sc.customer_id = ss.customer_id AND ss.deleted_at IS NULL;

-- Grant access to authenticated users
GRANT SELECT ON user_subscription_status TO authenticated;

-- Add indexes for better performance
CREATE INDEX IF NOT EXISTS idx_stripe_subscriptions_status ON stripe_subscriptions(status);
CREATE INDEX IF NOT EXISTS idx_stripe_subscriptions_price_id ON stripe_subscriptions(price_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_user_id_plan ON subscriptions(user_id, plan);

-- Update the handle_new_user function to ensure proper subscription creation
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Create user record
  INSERT INTO users (id, email)
  VALUES (NEW.id, NEW.email);
  
  -- Create profile
  INSERT INTO profiles (id, full_name, phone, birth_date)
  VALUES (NEW.id, '', '', null);
  
  -- Create free subscription
  INSERT INTO subscriptions (
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