import { createClient } from 'npm:@supabase/supabase-js@2.39.8';
import Stripe from 'npm:stripe@17.7.0';

const PRICES = {
  free: 'price_1RIDwLGMh07VKLbnujKxoJmN',
  monthly: 'price_1RICRBGMh07VKLbntwSXXPdM',
  yearly: 'price_1RICWFGMh07VKLbnLsU1jkVZ'
} as const;

// Get and validate Stripe key
const stripeKey = Deno.env.get('STRIPE_SECRET_KEY');
if (!stripeKey) {
  console.error('STRIPE_SECRET_KEY environment variable is not set');
  throw new Error('Missing STRIPE_SECRET_KEY');
}

// Validate key format
if (!stripeKey.startsWith('sk_')) {
  console.error('Invalid Stripe key format. Key should start with sk_');
  throw new Error('Invalid STRIPE_SECRET_KEY format');
}

console.log('Stripe key loaded, length:', stripeKey.length, 'prefix:', stripeKey.substring(0, 7));

const stripe = new Stripe(stripeKey, {
  apiVersion: '2023-10-16',
});

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

async function logStripeEvent(
  supabaseClient: any,
  userId: string,
  customerId: string | null,
  eventType: string,
  request?: any,
  response?: any,
  error?: any
) {
  try {
    await supabaseClient
      .from('stripe_integration_logs')
      .insert({
        user_id: userId,
        customer_id: customerId,
        event_type: eventType,
        request_payload: request,
        response_payload: response,
        error_message: error?.message
      });
  } catch (logError) {
    console.error('Error logging Stripe event:', logError);
  }
}

async function waitForUserData(supabaseClient: any, userId: string, retries = 20, delay = 1000): Promise<any> {
  for (let i = 0; i < retries; i++) {
    console.log(`Attempt ${i + 1}: Checking for user data...`);
    
    try {
      // Check if auth user exists
      const { data: authUser, error: authError } = await supabaseClient.auth.admin.getUserById(userId);
      
      if (authError || !authUser?.user) {
        console.log(`Attempt ${i + 1}: Auth user not found yet -`, authError?.message || 'User not found');
        if (i < retries - 1) {
          await new Promise(resolve => setTimeout(resolve, delay));
          delay = Math.min(delay * 1.1, 5000); // Gradual backoff, max 5 seconds
          continue;
        }
        return { data: null, error: new Error('Auth user not found after retries') };
      }

      console.log('Auth user found:', authUser.user.email);
      return { data: authUser.user, error: null };
      
    } catch (error) {
      console.log(`Attempt ${i + 1} error:`, error.message);
      if (i < retries - 1) {
        await new Promise(resolve => setTimeout(resolve, delay));
        delay = Math.min(delay * 1.1, 5000);
        continue;
      }
      return { data: null, error };
    }
  }

  console.log('Failed to find user data after all attempts');
  return { data: null, error: new Error('User data not found after multiple attempts') };
}

Deno.serve(async (req) => {
  try {
    if (req.method === 'OPTIONS') {
      return new Response('ok', { headers: corsHeaders });
    }
    
    console.log('Starting create-user-complete function');
    console.log('Environment check - Stripe key present:', !!stripeKey);

    // Get the authorization header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      console.error('No authorization header provided');
      return new Response(
        JSON.stringify({ error: 'No authorization header' }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 401 
        }
      );
    }
    
    const token = authHeader.replace('Bearer ', '');
    if (!token) {
      console.error('Empty token provided');
      return new Response(
        JSON.stringify({ error: 'Invalid authorization header' }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 401 
        }
      );
    }

    // Parse request body
    let requestBody: any = {};
    try {
      requestBody = await req.json();
    } catch (e) {
      // Body is optional
    }

    const forceRecreate = requestBody.force_recreate || false;

    // Create Supabase admin client
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    );

    // Get the user from the token
    const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser(token);

    if (userError || !user) {
      console.error('Error getting user:', userError);
      return new Response(
        JSON.stringify({ error: 'Invalid token' }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 401 
        }
      );
    }

    console.log('Got user:', user.id, 'email:', user.email);

    // Step 1: Check if user already has a real Stripe customer (quick check)
    console.log('Quick check for existing Stripe customer...');
    const { data: quickCheck } = await supabaseAdmin
      .from('stripe_customers')
      .select('customer_id')
      .eq('user_id', user.id)
      .is('deleted_at', null)
      .maybeSingle();

    if (quickCheck?.customer_id && !quickCheck.customer_id.startsWith('temp_')) {
      console.log('User already has real Stripe customer:', quickCheck.customer_id);
      return new Response(
        JSON.stringify({ 
          success: true,
          customerId: quickCheck.customer_id,
          message: 'User already exists with Stripe customer'
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200,
        }
      );
    }

    // Step 2: Call the PostgreSQL function to ensure local records and acquire lock
    console.log('Calling create_user_complete RPC function...');
    const { data: rpcResult, error: rpcError } = await supabaseAdmin
      .rpc('create_user_complete', {
        p_user_id: user.id,
        p_email: user.email,
        p_force_recreate: forceRecreate
      });

    if (rpcError) {
      console.error('Error calling create_user_complete RPC:', rpcError);
      await logStripeEvent(supabaseAdmin, user.id, null, 'rpc_call_failed', null, null, rpcError);
      return new Response(
        JSON.stringify({ 
          error: 'Failed to initialize user creation',
          details: rpcError.message 
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 500
        }
      );
    }

    console.log('RPC result:', rpcResult);

    // Check if user creation is already completed
    if (rpcResult.success && rpcResult.state === 'completed') {
      console.log('User creation already completed');
      return new Response(
        JSON.stringify({ 
          success: true,
          message: 'User already exists with complete Stripe integration',
          state: 'completed'
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200,
        }
      );
    }

    // Check if we failed to acquire lock (another process is working)
    if (!rpcResult.success && rpcResult.state === 'locked') {
      console.log('User creation in progress by another process');
      return new Response(
        JSON.stringify({ 
          success: false,
          message: 'User creation in progress',
          state: 'locked'
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 409, // Conflict
        }
      );
    }

    // If RPC failed for other reasons
    if (!rpcResult.success) {
      console.error('RPC failed:', rpcResult);
      return new Response(
        JSON.stringify({ 
          error: 'Failed to prepare user creation',
          details: rpcResult.error || rpcResult.message
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 500
        }
      );
    }

    // Step 3: Final check if Stripe customer already exists (race condition protection)
    console.log('Re-checking Stripe customer status...');
    const { data: existingCustomer } = await supabaseAdmin
      .from('stripe_customers')
      .select('customer_id')
      .eq('user_id', user.id)
      .is('deleted_at', null)
      .maybeSingle();

    // If customer_id is real (not temp_), another process already created the Stripe customer
    if (existingCustomer?.customer_id && !existingCustomer.customer_id.startsWith('temp_')) {
      console.log('Real Stripe customer already exists:', existingCustomer.customer_id);
      
      // Update state to completed
      await supabaseAdmin
        .from('user_creation_state')
        .update({
          state: 'completed',
          step: 'Stripe customer already existed',
          completed_at: new Date().toISOString(),
          locked_at: null,
          updated_at: new Date().toISOString()
        })
        .eq('user_id', user.id);

      return new Response(
        JSON.stringify({ 
          success: true,
          customerId: existingCustomer.customer_id,
          message: 'User already exists with Stripe customer'
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200,
        }
      );
    }

    // Wait for auth user to be fully available
    const { data: authUserData, error: authUserError } = await waitForUserData(supabaseAdmin, user.id);
    
    if (authUserError || !authUserData) {
      console.error('Auth user not available after retries:', authUserError);
      await logStripeEvent(supabaseAdmin, user.id, null, 'auth_user_not_found', null, null, authUserError);
      return new Response(
        JSON.stringify({ 
          error: 'Auth user not available',
          details: authUserError?.message 
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 404
        }
      );
    }

    // Step 4: Create real Stripe customer (we have the lock and no real customer exists)
    console.log('Creating real Stripe customer...');
    console.log('Using Stripe key prefix:', stripeKey.substring(0, 7));
    
    const customerData = {
      email: user.email,
      description: 'SmartCut user',
      metadata: {
        userId: user.id,
        source: 'smartcut_app'
      }
    };

    await logStripeEvent(supabaseAdmin, user.id, null, 'create_customer_request', customerData);

    try {
      const customer = await stripe.customers.create(customerData);

      await logStripeEvent(supabaseAdmin, user.id, customer.id, 'create_customer_response', null, customer);

      console.log('Created Stripe customer:', customer.id);

      // Step 5: Create free subscription
      const subscription = await stripe.subscriptions.create({
        customer: customer.id,
        items: [{ 
          price: PRICES.free,
          quantity: 1
        }],
        trial_period_days: 36500, // 100 years trial for free plan
        metadata: {
          userId: user.id,
          plan: 'free'
        }
      });

      console.log('Created free subscription:', subscription.id);
      await logStripeEvent(supabaseAdmin, user.id, customer.id, 'create_subscription_response', null, subscription);

      // Step 6: Update database with real Stripe IDs
      const { error: customerUpdateError } = await supabaseAdmin
        .from('stripe_customers')
        .update({
          customer_id: customer.id,
          updated_at: new Date().toISOString()
        })
        .eq('user_id', user.id);

      if (customerUpdateError) {
        console.error('Error updating customer record:', customerUpdateError);
        await logStripeEvent(supabaseAdmin, user.id, customer.id, 'db_customer_update_error', null, null, customerUpdateError);
        
        // Try to cleanup Stripe resources
        try {
          await stripe.subscriptions.cancel(subscription.id);
          await stripe.customers.del(customer.id);
        } catch (cleanupError) {
          console.error('Error cleaning up Stripe resources:', cleanupError);
        }
        
        throw customerUpdateError;
      }

      // Step 7: Update subscription record
      const { error: subscriptionUpdateError } = await supabaseAdmin
        .from('stripe_subscriptions')
        .update({
          subscription_id: subscription.id,
          price_id: PRICES.free,
          status: 'active',
          current_period_start: subscription.current_period_start,
          current_period_end: subscription.current_period_end,
          cancel_at_period_end: false,
          updated_at: new Date().toISOString()
        })
        .eq('customer_id', customer.id);

      if (subscriptionUpdateError) {
        console.error('Error updating subscription record:', subscriptionUpdateError);
        await logStripeEvent(supabaseAdmin, user.id, customer.id, 'db_subscription_update_error', null, null, subscriptionUpdateError);
      }

      // Step 8: Update user creation state to completed
      await supabaseAdmin
        .from('user_creation_state')
        .update({
          state: 'completed',
          step: 'Stripe integration completed successfully',
          completed_at: new Date().toISOString(),
          locked_at: null,
          updated_at: new Date().toISOString()
        })
        .eq('user_id', user.id);

      console.log('Successfully created complete user with Stripe integration');

      return new Response(
        JSON.stringify({ 
          success: true,
          customerId: customer.id,
          subscriptionId: subscription.id,
          message: 'User created successfully with Stripe integration'
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200,
        }
      );

    } catch (stripeError: any) {
      console.error('Stripe API Error:', stripeError);
      await logStripeEvent(supabaseAdmin, user.id, null, 'stripe_api_error', customerData, null, stripeError);
      
      // Update user creation state to failed
      await supabaseAdmin
        .from('user_creation_state')
        .update({
          state: 'failed',
          step: 'Stripe API error',
          error_message: stripeError.message,
          locked_at: null,
          updated_at: new Date().toISOString()
        })
        .eq('user_id', user.id);

      // Return detailed error information
      return new Response(
        JSON.stringify({
          error: 'Stripe API Error',
          details: stripeError.message,
          type: stripeError.type,
          code: stripeError.code,
          success: false
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400,
        }
      );
    }

  } catch (error) {
    console.error('Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
    console.error('Detailed error:', errorMessage);
    return new Response(
      JSON.stringify({
        error: errorMessage,
        success: false
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      },
    );
  }
});