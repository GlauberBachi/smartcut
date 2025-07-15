import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { PRICING_TABLE_ID, STRIPE_PUBLISHABLE_KEY } from '../stripe-config';
import { supabase } from '../lib/supabaseClient';

declare global {
  namespace JSX {
    interface IntrinsicElements {
      'stripe-pricing-table': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement> & {
        'pricing-table-id': string;
        'publishable-key': string;
        'client-reference-id'?: string;
      }, HTMLElement>;
    }
  }
}

const Pricing = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [currentPlan, setCurrentPlan] = useState<string>('free');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    console.log('Pricing component mounted');
    const loadUserPlan = async () => {
      if (!user) {
        console.log('No user found in Pricing component');
        setLoading(false);
        return;
      }

      console.log('Loading user plan for:', user.email);
      try {
        // First check Stripe subscriptions for active plans
        const { data: stripeData, error: stripeError } = await supabase
          .from('stripe_user_subscriptions')
          .select('price_id, subscription_status')
          .limit(1)
          .maybeSingle();

        console.log('Stripe subscription data:', stripeData);
        console.log('Stripe subscription error:', stripeError);

        if (!stripeError && stripeData) {
          console.log('Found Stripe subscription data:', {
            price_id: stripeData.price_id,
            status: stripeData.subscription_status
          });
          
          // Map Stripe price_id to plan name
          const planMap: { [key: string]: string } = {
            'price_1RIDwLGMh07VKLbnujKxoJmN': 'free',
            'price_1RICRBGMh07VKLbntwSXXPdM': 'monthly',
            'price_1RICWFGMh07VKLbnLsU1jkVZ': 'yearly'
          };
          
          const mappedPlan = planMap[stripeData.price_id] || 'free';
          console.log('Mapped plan from Stripe:', mappedPlan, 'for price_id:', stripeData.price_id);
          console.log('Subscription status:', stripeData.subscription_status);
          
          // Accept both 'active' and 'not_started' status for free plan
          if (stripeData.subscription_status === 'active' || 
              (mappedPlan === 'free' && ['not_started', 'incomplete'].includes(stripeData.subscription_status))) {
            console.log('Setting plan to:', mappedPlan);
            setCurrentPlan(mappedPlan);
            setLoading(false);
            return;
          } else {
            console.log('Stripe subscription not active, status:', stripeData.subscription_status);
          }
        }
        
        // If no valid Stripe subscription, check regular subscriptions
        console.log('No active Stripe subscription, checking regular subscriptions...');
        
        const { data: subscription, error: subscriptionError } = await supabase
          .from('subscriptions')
          .select('plan')
          .eq('user_id', user.id)
          .maybeSingle();

        console.log('Regular subscription data:', subscription);
        console.log('Regular subscription error:', subscriptionError);

        if (subscriptionError) {
          console.error('Error loading subscription:', subscriptionError);
          setCurrentPlan('free'); // Default to free on error
        } else {
          const plan = subscription?.plan || 'free';
          console.log('Setting plan from regular subscription:', plan);
          setCurrentPlan(plan);
        }
        
      } catch (error) {
        console.error('Error loading subscription:', error);
        setCurrentPlan('free'); // Default to free on error
      } finally {
        setLoading(false);
      }
    };

    loadUserPlan();
  }, [user]);

  // Debug: Log current plan changes
  useEffect(() => {
    console.log('Current plan changed to:', currentPlan);
  }, [currentPlan]);

  const getPlanBadge = (plan: string) => {
    switch (plan) {
      case 'monthly':
        return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">Plano Ativo: Mensal</span>;
      case 'yearly':
        return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">Plano Ativo: Anual</span>;
      case 'free':
        return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">Plano Ativo: Gratuito</span>;
      default:
        return null;
    }
  };

  if (loading) {
    console.log('Pricing component is loading...');
    return (
      <div className="bg-gray-50 py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="animate-pulse flex space-x-4">
            <div className="flex-1 space-y-4 py-1">
              <div className="h-4 bg-gray-200 rounded w-3/4"></div>
              <div className="space-y-2">
                <div className="h-4 bg-gray-200 rounded"></div>
                <div className="h-4 bg-gray-200 rounded w-5/6"></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Redirect to sign in if not logged in
  const handleSignIn = () => {
    navigate('/?auth=signin');
  };

  console.log('Rendering Pricing component with user:', user?.email, 'plan:', currentPlan);
  return (
    <div className="bg-gray-50 py-12">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-12">
          <h2 className="text-3xl font-extrabold text-gray-900 sm:text-4xl">{t('pricing.title')}</h2>
          <p className="mt-4 text-xl text-gray-600">
            {t('pricing.subtitle')}
          </p>
          {user && (
            <div className="mt-4">
              {getPlanBadge(currentPlan)}
            </div>
          )}
        </div>

        <div className="mt-12">
          {!user ? (
            <div className="text-center">
              <p className="text-lg text-gray-600 mb-6">
                {t('pricing.loginToSubscribe')}
              </p>
              {user && currentPlan && (
                <div className="mt-4">
                  {getPlanBadge(currentPlan)}
                </div>
              )}
              {/* This part is for the Stripe Pricing Table, which is rendered conditionally */}
              {/* It's important to keep this block as is, as the Stripe component handles its own UI */}
              <button
                onClick={handleSignIn}
                className="inline-flex items-center px-6 py-3 border border-transparent text-base font-medium rounded-md shadow-sm text-white bg-primary-600 hover:bg-primary-700"
              >
                {t('nav.login')}
              </button>
            </div>
          ) : (
            // Conditionally render the Stripe Pricing Table or a custom UI for the Free plan
            // If the user is on the free plan, we want to show a custom button for it
            currentPlan === 'free' ? (
              // Custom UI for the Free plan when it's the current plan
              <div className="flex justify-center">
                <div className="bg-white rounded-lg shadow-lg divide-y divide-gray-200 w-96">
                  <div className="p-6">
                    <h3 className="text-2xl font-semibold text-gray-900">{t('home.pricing.free.title')}</h3>
                    <p className="mt-4 text-gray-500">{t('home.pricing.free.description')}</p>
                    <p className="mt-8">
                      <span className="text-4xl font-extrabold text-gray-900">{t('home.pricing.free.price')}</span>
                      <span className="text-base font-medium text-gray-500">{t('home.pricing.free.period')}</span>
                    </p>
                    <ul className="mt-6 space-y-4">
                      <li className="flex items-center">
                        <span className="h-5 w-5 text-green-500">✓</span>
                        <span className="ml-3 text-gray-500">{t('home.pricing.free.features.0')}</span>
                      </li>
                      <li className="flex items-center">
                        <span className="h-5 w-5 text-green-500">✓</span>
                        <span className="ml-3 text-gray-500">{t('home.pricing.free.features.1')}</span>
                      </li>
                    </ul>
                    <button
                      disabled
                      className="mt-8 w-full py-3 px-4 border border-transparent rounded-lg shadow-sm text-sm font-medium text-white bg-gray-400 cursor-not-allowed"
                    >
                      Plano Atual
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              // Render the Stripe Pricing Table for other plans
              <stripe-pricing-table
                pricing-table-id={PRICING_TABLE_ID}
                publishable-key={STRIPE_PUBLISHABLE_KEY}
                client-reference-id={user.id.replace(/[^a-zA-Z0-9\s\-_]/g, '_')}
              />
            )
          )}
        </div>
      </div>
    </div>
  );
};

export default Pricing;