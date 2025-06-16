/*
  # Add subscriptions management
  
  1. New Tables
    - `subscriptions`
      - `id` (uuid, primary key)
      - `user_id` (uuid, references auth.users)
      - `plan` (text) - Plan type (free, monthly, yearly)
      - `status` (text) - Subscription status
      - `current_period_end` (timestamptz)
      - `cancel_at_period_end` (boolean)
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)
  
  2. Changes
    - Add default free plan for new users
    - Add RLS policies for subscriptions table
  
  3. Security
    - Enable RLS on subscriptions table
    - Users can only read their own subscription
*/

-- Create subscriptions table
CREATE TABLE IF NOT EXISTS public.subscriptions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid REFERENCES auth.users(id) NOT NULL,
    plan text NOT NULL DEFAULT 'free',
    status text NOT NULL DEFAULT 'active',
    current_period_end timestamptz NOT NULL DEFAULT (now() + interval '100 years'),
    cancel_at_period_end boolean NOT NULL DEFAULT false,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),
    UNIQUE(user_id)
);

-- Enable RLS
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

-- Policies for subscriptions
CREATE POLICY "Users can view own subscription"
    ON public.subscriptions
    FOR SELECT
    TO authenticated
    USING (auth.uid() = user_id);

-- Function to create default subscription for new users
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
  INSERT INTO public.subscriptions (user_id, plan, status)
  VALUES (new.id, 'free', 'active');
  
  RETURN new;
END;
$$;

-- Drop existing trigger if it exists
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

-- Create trigger for new user signup
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();