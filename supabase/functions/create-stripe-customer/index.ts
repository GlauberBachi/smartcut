import { createClient } from 'npm:@supabase/supabase-js@2.39.8';
import Stripe from 'npm:stripe@17.7.0';

const PRICES = {
  free: 'price_1RIDwLGMh07VKLbnujKxoJmN',
  monthly: 'price_1RICRBGMh07VKLbntwSXXPdM',
  yearly: 'price_1RICWFGMh07VKLbnLsU1jkVZ'
} as const;

const stripeKey = Deno.env.get('STRIPE_SECRET_KEY')?.trim();
if (!stripeKey) {
  throw new Error('Missing STRIPE_SECRET_KEY');
}

const stripe = new Stripe(stripeKey, {
  apiVersion: '2023-10-16',
});

// Add logging function
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

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

const waitForUserData = async (supabaseClient: any, userId: string, retries = 20, delay = 2000): Promise<any> => {
  for (let i = 0; i < retries; i++) {
    console.log(`Attempt ${i + 1}: Checking for user data...`);
    
    try {
      // Check if user exists in auth.users first
      const { data: authUser, error: authError } = await supabaseClient.auth.admin.getUserById(userId);
      
      if (authError || !authUser?.user) {
        console.log(`Attempt ${i + 1}: Auth user not found yet`);
        if (i < retries - 1) {
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }
        return { data: null, error: new Error('Auth user not found') };
      }

      // Check if user exists in public.users table
      const { data: userData, error: userError } = await supabaseClient
        .from('users')
        .select('email, role')
        .eq('id', userId)
        .maybeSingle();

      if (userError) {
        console.log(`Attempt ${i + 1} user table error:`, userError.message);
      }

      if (!userData) {
        console.log(`Attempt ${i + 1}: User not found in public.users table yet`);
        if (i < retries - 1) {
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }
        return { data: null, error: new Error('User not found in public.users table') };
      }

      // Check if profile exists
      const { data: profile, error: profileError } = await supabaseClient
        .from('profiles')
        .select('id')
        .eq('id', userId)
        .maybeSingle();

      if (profileError) {
        console.log(`Attempt ${i + 1} profile error:`, profileError.message);
      }

      if (!profile) {
        console.log(`Attempt ${i + 1}: Profile not found yet`);
        if (i < retries - 1) {
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }
        return { data: null, error: new Error('Profile not found') };
      }

      // Check if subscription exists
      const { data: subscription, error: subscriptionError } = await supabaseClient
        .from('subscriptions')
        .select('id')
        .eq('user_id', userId)
        .maybeSingle();

      if (subscriptionError) {
        console.log(`Attempt ${i + 1} subscription error:`, subscriptionError.message);
      }

      if (!subscription) {
        console.log(`Attempt ${i + 1}: Subscription not found yet`);
        if (i < retries - 1) {
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }
        return { data: null, error: new Error('Subscription not found') };
      }

      console.log(`Attempt ${i + 1}: All user data found successfully`);
      return { data: userData, error: null };

    } catch (error) {
      console.log(`Attempt ${i + 1} unexpected error:`, error);
      if (i < retries - 1) {
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }
      return { data: null, error };
    }
  }

  console.log('Failed to find complete user data after all attempts');
  return { data: null, error: new Error('User data not found after multiple attempts') };
};

Deno.serve(async (req) => {
  try {
    if (req.method === 'OPTIONS') {
      return new Response('ok', { headers: corsHeaders });
    }
    
    console.log('Starting create-stripe-customer function');

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

    // Create Supabase client
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    );

    // Get the user from the token
    const { data: { user }, error: userError } = await supabaseClient.auth.getUser(token);

    if (userError || !user) {
      await logStripeEvent(supabaseClient, 'unknown', null, 'auth_error', null, null, userError);
      console.error('Error getting user:', userError);
      return new Response(
        JSON.stringify({ error: 'Invalid token' }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 401 
        }
      );
    }

    console.log('Got user:', user.id);

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

    // Check if customer already exists (including temporary ones)
    const { data: existingCustomer } = await supabaseAdmin
      .from('stripe_customers')
      .select('customer_id, user_id')
      .eq('user_id', user.id)
      .is('deleted_at', null)
      .maybeSingle();

    if (existingCustomer?.customer_id && !existingCustomer.customer_id.startsWith('temp_')) {
      console.log('Real Stripe customer already exists:', existingCustomer.customer_id);
      return new Response(
        JSON.stringify({ customerId: existingCustomer.customer_id }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200,
        }
      );
    }

    // Wait for user data to be available with longer timeout and more retries
    const { data: userData, error: userDataError } = await waitForUserData(supabaseClient, user.id, 20, 2000);

    if (userDataError || !userData) {
      console.error('Error getting complete user data after retries:', userDataError);
      await logStripeEvent(supabaseClient, user.id, null, 'user_data_not_found', null, null, userDataError);
      return new Response(
        JSON.stringify({ error: 'Complete user data not found after multiple attempts. Please try again.' }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 404
        }
      );
    }

    // Create Stripe customer
    const customerData = {
      email: userData.email,
      description: `${userData.role} user`,
      metadata: {
        userId: user.id,
        role: userData.role
      }
    };

    await logStripeEvent(supabaseClient, user.id, null, 'create_customer_request', customerData);

    const customer = await stripe.customers.create(customerData);

    await logStripeEvent(supabaseClient, user.id, customer.id, 'create_customer_response', null, customer);

    console.log('Created Stripe customer:', customer.id);

    // Create free subscription for the customer
    const subscription = await stripe.subscriptions.create({
      customer: customer.id,
      items: [{ 
        price: PRICES.free,
        quantity: 1
      }],
      trial_period_days: 36500, // 100 years trial for free plan
      metadata: {
        userId: user.id
      }
    });

    console.log('Created free subscription:', subscription.id);
    await logStripeEvent(supabaseClient, user.id, customer.id, 'create_subscription_response', null, subscription);

    // Update or create customer record with real Stripe ID
    const { error: customerUpsertError } = await supabaseAdmin
      .from('stripe_customers')
      .upsert({
        user_id: user.id,
        customer_id: customer.id,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'user_id'
      });

    if (customerUpsertError) {
      await logStripeEvent(supabaseClient, user.id, customer.id, 'db_customer_error', null, null, customerUpsertError);
      console.error('Error upserting customer in database:', customerUpsertError);
      
      // Try to delete the Stripe customer if database operation fails
      try {
        await stripe.customers.del(customer.id);
        await stripe.subscriptions.cancel(subscription.id);
      } catch (deleteError) {
        await logStripeEvent(supabaseClient, user.id, customer.id, 'cleanup_error', null, null, deleteError);
        console.error('Error cleaning up Stripe resources:', deleteError);
      }
      throw customerUpsertError;
    }

    // Update or create subscription record with real Stripe data
    const { error: subUpsertError } = await supabaseAdmin
      .from('stripe_subscriptions')
      .upsert({
        customer_id: customer.id,
        subscription_id: subscription.id,
        price_id: PRICES.free,
        status: 'active',
        current_period_start: subscription.current_period_start,
        current_period_end: subscription.current_period_end,
        cancel_at_period_end: false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'customer_id'
      });

    if (subUpsertError) {
      console.error('Error upserting subscription record:', subUpsertError.message);
      await logStripeEvent(supabaseClient, user.id, customer.id, 'db_subscription_error', null, null, subUpsertError);
    }

    console.log('Successfully created and stored Stripe customer and subscription');

    return new Response(
      JSON.stringify({ 
        customerId: customer.id,
        subscriptionId: subscription.id,
        status: 'success'
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );

  } catch (error) {
    console.error('Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
    console.error('Detailed error:', errorMessage);
    return new Response(
      JSON.stringify({
        error: errorMessage
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      },
    );
  }
});