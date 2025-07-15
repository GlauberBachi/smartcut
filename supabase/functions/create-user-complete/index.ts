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

// Global lock manager para evitar múltiplas execuções simultâneas
const activeLocks = new Map<string, Promise<any>>();

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

async function acquireDistributedLock(supabaseClient: any, userId: string, timeoutMs = 30000): Promise<boolean> {
  const lockId = `user_creation_${userId}`;
  const expiresAt = new Date(Date.now() + timeoutMs);
  
  try {
    // Tentar adquirir o lock
    const { data, error } = await supabaseClient
      .from('user_creation_state')
      .upsert({
        user_id: userId,
        state: 'locked',
        step: 'Acquiring distributed lock',
        locked_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'user_id',
        ignoreDuplicates: false
      })
      .select();

    if (error) {
      console.error('Error acquiring lock:', error);
      return false;
    }

    // Verificar se conseguimos o lock (não havia outro processo)
    const { data: lockCheck } = await supabaseClient
      .from('user_creation_state')
      .select('locked_at, state')
      .eq('user_id', userId)
      .single();

    if (lockCheck?.state === 'locked' && lockCheck.locked_at) {
      const lockTime = new Date(lockCheck.locked_at);
      const now = new Date();
      
      // Se o lock é muito antigo (mais de 5 minutos), consideramos expirado
      if (now.getTime() - lockTime.getTime() > 300000) {
        console.log('Lock expired, taking over');
        return true;
      }
      
      // Se o lock é nosso (mesmo timestamp), temos o lock
      return true;
    }

    return false;
  } catch (error) {
    console.error('Error in acquireDistributedLock:', error);
    return false;
  }
}

async function releaseDistributedLock(supabaseClient: any, userId: string, finalState: string = 'completed') {
  try {
    await supabaseClient
      .from('user_creation_state')
      .update({
        state: finalState,
        locked_at: null,
        completed_at: finalState === 'completed' ? new Date().toISOString() : null,
        updated_at: new Date().toISOString()
      })
      .eq('user_id', userId);
  } catch (error) {
    console.error('Error releasing lock:', error);
  }
}

async function findExistingStripeCustomer(email: string): Promise<string | null> {
  try {
    console.log('Searching for existing Stripe customer with email:', email);
    
    const customers = await stripe.customers.list({
      email: email,
      limit: 10
    });

    if (customers.data.length > 0) {
      // Procurar por customer ativo (não deletado)
      const activeCustomer = customers.data.find(c => !c.deleted);
      if (activeCustomer) {
        console.log('Found existing active Stripe customer:', activeCustomer.id);
        return activeCustomer.id;
      }
    }

    console.log('No existing Stripe customer found for email:', email);
    return null;
  } catch (error) {
    console.error('Error searching for existing Stripe customer:', error);
    return null;
  }
}

async function cleanupDuplicateStripeCustomers(email: string, keepCustomerId: string) {
  try {
    console.log('Cleaning up duplicate Stripe customers for email:', email);
    
    const customers = await stripe.customers.list({
      email: email,
      limit: 100
    });

    const duplicates = customers.data.filter(c => c.id !== keepCustomerId && !c.deleted);
    
    for (const duplicate of duplicates) {
      try {
        console.log('Deleting duplicate Stripe customer:', duplicate.id);
        
        // Cancelar todas as subscriptions do customer duplicado
        const subscriptions = await stripe.subscriptions.list({
          customer: duplicate.id,
          status: 'all'
        });

        for (const sub of subscriptions.data) {
          if (sub.status === 'active' || sub.status === 'trialing') {
            await stripe.subscriptions.cancel(sub.id);
            console.log('Cancelled subscription:', sub.id);
          }
        }

        // Deletar o customer duplicado
        await stripe.customers.del(duplicate.id);
        console.log('Successfully deleted duplicate customer:', duplicate.id);
      } catch (deleteError) {
        console.error('Error deleting duplicate customer:', duplicate.id, deleteError);
      }
    }
  } catch (error) {
    console.error('Error in cleanupDuplicateStripeCustomers:', error);
  }
}

Deno.serve(async (req) => {
  try {
    if (req.method === 'OPTIONS') {
      return new Response('ok', { headers: corsHeaders });
    }
    
    console.log('=== Starting create-user-complete function ===');

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

    console.log('Processing user:', user.id, 'email:', user.email);

    // STEP 1: Verificar se já existe um lock ativo para este usuário
    if (activeLocks.has(user.id)) {
      console.log('User creation already in progress (memory lock)');
      try {
        const result = await activeLocks.get(user.id);
        return new Response(
          JSON.stringify(result),
          {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: result.success ? 200 : 409,
          }
        );
      } catch (error) {
        console.log('Previous process failed, continuing...');
        activeLocks.delete(user.id);
      }
    }

    // STEP 2: Verificação rápida se usuário já está completo
    console.log('Quick check for existing complete user...');
    const { data: quickCheck } = await supabaseAdmin
      .from('stripe_customers')
      .select('customer_id')
      .eq('user_id', user.id)
      .is('deleted_at', null)
      .maybeSingle();

    if (quickCheck?.customer_id && !quickCheck.customer_id.startsWith('temp_')) {
      console.log('User already has real Stripe customer:', quickCheck.customer_id);
      
      // Verificar se o customer ainda existe no Stripe
      try {
        const stripeCustomer = await stripe.customers.retrieve(quickCheck.customer_id);
        if (!stripeCustomer.deleted) {
          return new Response(
            JSON.stringify({ 
              success: true,
              customerId: quickCheck.customer_id,
              message: 'User already exists with valid Stripe customer'
            }),
            {
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
              status: 200,
            }
          );
        }
      } catch (stripeError) {
        console.log('Stripe customer not found, will recreate:', stripeError.message);
      }
    }

    // STEP 3: Criar promise para o lock de memória
    const creationPromise = (async () => {
      try {
        // STEP 4: Adquirir lock distribuído
        console.log('Acquiring distributed lock...');
        const lockAcquired = await acquireDistributedLock(supabaseAdmin, user.id);
        
        if (!lockAcquired) {
          console.log('Failed to acquire distributed lock');
          return {
            success: false,
            message: 'User creation in progress by another process',
            state: 'locked'
          };
        }

        console.log('Distributed lock acquired successfully');

        try {
          // STEP 5: Verificar novamente se já existe customer (race condition protection)
          const { data: existingCustomer } = await supabaseAdmin
            .from('stripe_customers')
            .select('customer_id')
            .eq('user_id', user.id)
            .is('deleted_at', null)
            .maybeSingle();

          if (existingCustomer?.customer_id && !existingCustomer.customer_id.startsWith('temp_')) {
            console.log('Customer created by another process:', existingCustomer.customer_id);
            await releaseDistributedLock(supabaseAdmin, user.id, 'completed');
            return {
              success: true,
              customerId: existingCustomer.customer_id,
              message: 'User already exists with Stripe customer'
            };
          }

          // STEP 6: Procurar por customer existente no Stripe
          let stripeCustomerId = await findExistingStripeCustomer(user.email!);
          
          if (stripeCustomerId) {
            console.log('Found existing Stripe customer, will reuse:', stripeCustomerId);
            
            // Limpar duplicatas
            await cleanupDuplicateStripeCustomers(user.email!, stripeCustomerId);
          } else {
            // STEP 7: Criar novo customer no Stripe
            console.log('Creating new Stripe customer...');
            
            const customerData = {
              email: user.email,
              description: 'SmartCut user',
              metadata: {
                userId: user.id,
                source: 'smartcut_app',
                created_at: new Date().toISOString()
              }
            };

            await logStripeEvent(supabaseAdmin, user.id, null, 'create_customer_request', customerData);

            const customer = await stripe.customers.create(customerData);
            stripeCustomerId = customer.id;

            await logStripeEvent(supabaseAdmin, user.id, customer.id, 'create_customer_response', null, customer);
            console.log('Created new Stripe customer:', customer.id);
          }

          // STEP 8: Verificar se já existe subscription ativa
          let subscriptionId: string | null = null;
          let existingSubscription: any = null;
          
          try {
            const subscriptions = await stripe.subscriptions.list({
              customer: stripeCustomerId,
              status: 'all',
              limit: 1
            });

            if (subscriptions.data.length > 0) {
              existingSubscription = subscriptions.data[0];
              subscriptionId = existingSubscription.id;
              console.log('Found existing subscription:', subscriptionId, 'status:', existingSubscription.status);
            }
          } catch (subError) {
            console.log('Error checking existing subscriptions:', subError.message);
          }

          // STEP 9: Criar subscription se não existir
          if (!subscriptionId || (existingSubscription && existingSubscription.status === 'canceled')) {
            console.log('Creating free subscription...');
            
            try {
              const subscriptionData = {
                customer: stripeCustomerId,
                items: [{ 
                  price: PRICES.free,
                  quantity: 1
                }],
                trial_period_days: 36500, // 100 years trial for free plan
                metadata: {
                  userId: user.id,
                  plan: 'free',
                  created_by: 'smartcut_app'
                }
              };

              await logStripeEvent(supabaseAdmin, user.id, stripeCustomerId, 'create_subscription_request', subscriptionData);

              const subscription = await stripe.subscriptions.create(subscriptionData);

              subscriptionId = subscription.id;
              existingSubscription = subscription;
              console.log('Created free subscription:', subscription.id);
              await logStripeEvent(supabaseAdmin, user.id, stripeCustomerId, 'create_subscription_response', null, subscription);
            } catch (subscriptionError) {
              console.error('Error creating free subscription:', subscriptionError);
              await logStripeEvent(supabaseAdmin, user.id, stripeCustomerId, 'create_subscription_error', null, null, subscriptionError);
              
              // Não falha o processo se a subscription não for criada
              // O usuário ainda pode usar o sistema sem subscription ativa
              console.log('Continuing without subscription - user can still access free features');
            }
          } else if (existingSubscription && existingSubscription.status === 'active') {
            console.log('User already has active subscription:', subscriptionId);
          }


          // STEP 10: Chamar função RPC para criar/atualizar registros locais
          console.log('Calling create_user_complete RPC function...');
          const { data: rpcResult, error: rpcError } = await supabaseAdmin
            .rpc('create_user_complete', {
              p_user_id: user.id,
              p_email: user.email,
              p_force_recreate: forceRecreate
            });

          if (rpcError) {
            console.error('Error calling create_user_complete RPC:', rpcError);
            throw rpcError;
          }

          // STEP 11: Atualizar registros com IDs reais do Stripe
          const { error: customerUpdateError } = await supabaseAdmin
            .from('stripe_customers')
            .upsert({
              user_id: user.id,
              customer_id: stripeCustomerId,
              updated_at: new Date().toISOString()
            }, {
              onConflict: 'user_id'
            });

          if (customerUpdateError) {
            console.error('Error updating customer record:', customerUpdateError);
            throw customerUpdateError;
          }

          // STEP 12: Atualizar subscription record
          if (subscriptionId && existingSubscription) {
            try {
              // Se não temos os dados completos, buscar do Stripe
              const subscriptionData = existingSubscription.id ? existingSubscription : await stripe.subscriptions.retrieve(subscriptionId);
            
              const { error: subscriptionUpdateError } = await supabaseAdmin
                .from('stripe_subscriptions')
                .upsert({
                  customer_id: stripeCustomerId,
                  subscription_id: subscriptionId,
                  price_id: subscriptionData.items?.data?.[0]?.price?.id || PRICES.free,
                  status: subscriptionData.status,
                  current_period_start: subscriptionData.current_period_start,
                  current_period_end: subscriptionData.current_period_end,
                  cancel_at_period_end: subscriptionData.cancel_at_period_end,
                  updated_at: new Date().toISOString()
                }, {
                  onConflict: 'customer_id'
                });

              if (subscriptionUpdateError) {
                console.error('Error updating subscription record:', subscriptionUpdateError);
                // Log mas não falha o processo
              } else {
                console.log('Successfully updated subscription record in database');
              }
            } catch (subscriptionUpdateError) {
              console.error('Error updating subscription record:', subscriptionUpdateError);
              // Log mas não falha o processo
            }
          } else {
            console.log('No subscription to update in database');
          }

          // STEP 13: Liberar lock e marcar como completo
          await releaseDistributedLock(supabaseAdmin, user.id, 'completed');

          console.log('=== User creation completed successfully ===');

          return {
            success: true,
            customerId: stripeCustomerId,
            subscriptionId: subscriptionId,
            message: 'User created successfully with Stripe integration'
          };

        } catch (error) {
          console.error('Error during user creation:', error);
          await releaseDistributedLock(supabaseAdmin, user.id, 'failed');
          throw error;
        }

      } catch (error) {
        console.error('Error in creation promise:', error);
        throw error;
      }
    })();

    // STEP 14: Armazenar promise no lock de memória
    activeLocks.set(user.id, creationPromise);

    try {
      const result = await creationPromise;
      activeLocks.delete(user.id);
      
      return new Response(
        JSON.stringify(result),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: result.success ? 200 : 409,
        }
      );
    } catch (error) {
      activeLocks.delete(user.id);
      throw error;
    }

  } catch (error) {
    console.error('=== Error in create-user-complete ===:', error);
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
    
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