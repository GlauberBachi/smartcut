import { supabase } from './supabaseClient';

export async function createCheckoutSession(mode: 'payment' | 'subscription', locale = 'pt-BR') {
  // First check if we have a session
  const { data: { session }, error: sessionError } = await supabase.auth.getSession();

  if (sessionError) {
    throw new Error('Failed to get session: ' + sessionError.message);
  }

  if (!session?.access_token) {
    throw new Error('Please sign in to continue with checkout.');
  }

  // Verify the session is still valid
  const { data: { user }, error: userError } = await supabase.auth.getUser(session.access_token);
  
  if (userError || !user) {
    // Session is invalid, clear it
    await supabase.auth.signOut();
    throw new Error('Your session has expired. Please sign in again.');
  }

  const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/stripe-checkout`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({
      success_url: `${window.location.origin}/success`,
      cancel_url: `${window.location.origin}/pricing`,
      mode: mode,
      locale: locale,
      allow_promotion_codes: true,
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to create checkout session');
  }

  const { url } = await response.json();
  return url;
}

export async function redirectToCheckout(mode: 'payment' | 'subscription') {
  try {
    const url = await createCheckoutSession(mode, 'pt-BR');
    window.location.href = url;
  } catch (error) {
    console.error('Error redirecting to checkout:', error);
    throw error;
  }
}