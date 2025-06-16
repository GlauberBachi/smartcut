/*
  # Add Stripe integration logging
  
  1. Changes
    - Create stripe_integration_logs table if not exists
    - Add indexes for performance
    - Add RLS policy for admin access
    
  2. Security
    - Only admins can view logs
    - Proper RLS protection
*/

-- Create logging table
CREATE TABLE IF NOT EXISTS stripe_integration_logs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid REFERENCES auth.users(id),
    customer_id text,
    event_type text NOT NULL,
    request_payload jsonb,
    response_payload jsonb,
    error_message text,
    created_at timestamptz DEFAULT now()
);

-- Add index for better query performance
CREATE INDEX IF NOT EXISTS idx_stripe_logs_user_id ON stripe_integration_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_stripe_logs_customer_id ON stripe_integration_logs(customer_id);
CREATE INDEX IF NOT EXISTS idx_stripe_logs_created_at ON stripe_integration_logs(created_at);

-- Enable RLS
ALTER TABLE stripe_integration_logs ENABLE ROW LEVEL SECURITY;

-- Drop existing policy if it exists
DROP POLICY IF EXISTS "Admins can view logs" ON stripe_integration_logs;

-- Create new policy
CREATE POLICY "Admins can view logs"
    ON stripe_integration_logs
    FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM users
            WHERE users.id = auth.uid()
            AND users.role = 'admin'
        )
    );