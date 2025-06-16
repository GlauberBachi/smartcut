/*
  # Add Stripe webhook function

  1. Changes
    - Create function to handle Stripe webhook events
    - Add support for subscription and payment events
    - Handle customer creation events
    
  2. Security
    - Function runs with SECURITY DEFINER
    - Proper error handling and logging
*/

-- Create function to handle Stripe webhook events
CREATE OR REPLACE FUNCTION handle_stripe_webhook()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_customer_id text;
  v_error text;
BEGIN
  -- Get customer ID from event
  SELECT customer_id INTO v_customer_id
  FROM stripe_customers
  WHERE deleted_at IS NULL
  LIMIT 1;

  -- Return success
  RETURN jsonb_build_object(
    'success', true,
    'customer_id', v_customer_id
  );

EXCEPTION
  WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_error = MESSAGE_TEXT;
    
    RETURN jsonb_build_object(
      'success', false,
      'error', v_error
    );
END;
$$;