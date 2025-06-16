/*
  # Update subscription plans

  1. Changes
    - Add check constraint for new plan values
    - Update default plan to 'free'
    - Add index for better performance
    
  2. Security
    - Maintains existing RLS policies
*/

-- Update the valid_plan constraint to include all plan types
ALTER TABLE subscriptions 
DROP CONSTRAINT IF EXISTS valid_plan;

ALTER TABLE subscriptions
ADD CONSTRAINT valid_plan CHECK (
  plan IN ('free', 'monthly', 'yearly')
);

-- Set default plan to free
ALTER TABLE subscriptions
ALTER COLUMN plan SET DEFAULT 'free';

-- Add index for plan column if it doesn't exist
CREATE INDEX IF NOT EXISTS idx_subscriptions_plan 
ON subscriptions(plan);

-- Update any existing null plans to free
UPDATE subscriptions 
SET plan = 'free' 
WHERE plan IS NULL;