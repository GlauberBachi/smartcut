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
    const loadUserPlan = async () => {
      if (!user) {
        setLoading(false);
        return;
      }

      try {
        // Get subscription data from the subscriptions table
        const { data: subscription, error: subscriptionError } = await supabase
          .from('subscriptions')
          .select('plan')
          .eq('user_id', user.id)
          .maybeSingle();

        if (subscriptionError) {
          console.error('Error loading subscription:', subscriptionError);
          setLoading(false);
          return;
        }

        setCurrentPlan(subscription?.plan || 'free');
      } catch (error) {
        console.error('Error loading subscription:', error);
      } finally {
        setLoading(false);
      }
    };

    loadUserPlan();
  }, [user]);

  if (loading) {
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

  return (
    <div className="bg-gray-50 py-12">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-12">
          <h2 className="text-3xl font-extrabold text-gray-900 sm:text-4xl">{t('pricing.title')}</h2>
          <p className="mt-4 text-xl text-gray-600">
            {t('pricing.subtitle')}
          </p>
        </div>

        <div className="mt-12">
          {!user ? (
            <div className="text-center">
              <p className="text-lg text-gray-600 mb-6">
                {t('pricing.loginToSubscribe')}
              </p>
              <button
                onClick={handleSignIn}
                className="inline-flex items-center px-6 py-3 border border-transparent text-base font-medium rounded-md shadow-sm text-white bg-primary-600 hover:bg-primary-700"
              >
                {t('nav.login')}
              </button>
            </div>
          ) : (
            <stripe-pricing-table
              pricing-table-id={PRICING_TABLE_ID}
              publishable-key={STRIPE_PUBLISHABLE_KEY}
              client-reference-id={user.id + ':' + currentPlan}
            />
          )}
        </div>
      </div>
    </div>
  );
};

export default Pricing;