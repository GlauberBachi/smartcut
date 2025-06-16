/*
  # Add free plan support
  
  1. Changes
    - Add check constraint to ensure valid plan values
    - Update default plan to 'free'
    - Add index on plan column for better performance
    
  2. Security
    - Maintains existing RLS policies
*/

-- Add check constraint for valid plans
ALTER TABLE subscriptions 
DROP CONSTRAINT IF EXISTS valid_plan;

ALTER TABLE subscriptions
ADD CONSTRAINT valid_plan CHECK (
  plan IN ('free', 'monthly', 'annual')
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