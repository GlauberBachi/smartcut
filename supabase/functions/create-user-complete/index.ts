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

    // Step 1: Create all local database records
    console.log('Creating local database records...');
    const { data: createResult, error: createError } = await supabaseAdmin
      .rpc('create_user_complete', {
        p_user_id: user.id,
        p_email: user.email,
        p_force_recreate: forceRecreate
      });

    if (createError) {
      console.error('Error creating local records:', createError);
      await logStripeEvent(supabaseAdmin, user.id, null, 'local_creation_failed', null, null, createError);
      return new Response(
        JSON.stringify({ 
          error: 'Failed to create local user records',
          details: createError.message 
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 500
        }
      );
    }

    if (!createResult.success) {
      console.error('Local creation failed:', createResult);
      return new Response(
        JSON.stringify({ 
          error: 'Failed to create user records',
          details: createResult.message,
          state: createResult.state
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400
        }
      );
    }

    console.log('Local records created successfully');

    // Step 2: Check if we already have a real Stripe customer
    const { data: existingCustomer } = await supabaseAdmin
      .from('stripe_customers')
      .select('customer_id')
      .eq('user_id', user.id)
      .is('deleted_at', null)
      .maybeSingle();

    if (existingCustomer?.customer_id && !existingCustomer.customer_id.startsWith('temp_')) {
      console.log('Real Stripe customer already exists:', existingCustomer.customer_id);
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

    // Step 3: Create real Stripe customer
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

      // Step 4: Create free subscription
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

      // Step 5: Update database with real Stripe IDs
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