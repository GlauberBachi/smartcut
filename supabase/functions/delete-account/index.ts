import { createClient } from 'npm:@supabase/supabase-js@2.39.8'
import Stripe from 'npm:stripe@14.21.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: corsHeaders,
    })
  }

  try {
    // Only allow POST requests
    if (req.method !== 'POST') {
      throw new Error('Method not allowed')
    }

    // Get the authorization header
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      throw new Error('No authorization header')
    }

    // Initialize Stripe
    const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') ?? '', {
      apiVersion: '2023-10-16',
    })

    // Create a Supabase client with the service role key
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    )

    // Create a client to verify the user's token
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    )

    // Verify the user's JWT
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser(
      authHeader.replace('Bearer ', '')
    )

    if (authError || !user) {
      throw new Error('Invalid token')
    }

    // Get the Stripe customer ID for the user
    const { data: stripeCustomer, error: customerError } = await supabaseAdmin
      .from('stripe_customers')
      .select('customer_id')
      .eq('user_id', user.id)
      .single()

    if (customerError && customerError.code !== 'PGRST116') {
      throw customerError
    }

    // If there's a Stripe customer, handle Stripe cleanup
    if (stripeCustomer?.customer_id) {
      try {
        // Get all subscriptions for the customer
        const subscriptions = await stripe.subscriptions.list({
          customer: stripeCustomer.customer_id,
        })

        // Cancel all subscriptions
        for (const subscription of subscriptions.data) {
          await stripe.subscriptions.cancel(subscription.id)
        }

        // Delete the customer in Stripe
        await stripe.customers.del(stripeCustomer.customer_id)

        // Soft delete the stripe_customers record
        const { error: deleteCustomerError } = await supabaseAdmin
          .from('stripe_customers')
          .update({ deleted_at: new Date().toISOString() })
          .eq('user_id', user.id)

        if (deleteCustomerError) {
          throw deleteCustomerError
        }
      } catch (stripeError) {
        console.error('Stripe cleanup error:', stripeError)
        // Continue with deletion even if Stripe cleanup fails
      }
    }

    // Call the database function to clean up user data
    const { data: dbResult, error: dbError } = await supabaseAdmin.rpc(
      'delete_user',
      { p_user_id: user.id }
    )

    if (dbError) {
      throw dbError
    }

    if (!dbResult.success) {
      throw new Error(dbResult.error || 'Failed to delete user data')
    }

    // Delete the auth user using admin API
    const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(
      user.id
    )

    if (deleteError) {
      throw deleteError
    }

    return new Response(
      JSON.stringify({ message: 'Account deleted successfully' }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    )
  } catch (error) {
    console.error('Error:', error)
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : 'An unknown error occurred',
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      }
    )
  }
})