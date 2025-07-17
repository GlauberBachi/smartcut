import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabaseClient';
import { Crown, Loader2 } from 'lucide-react';

const Dashboard = () => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [plan, setPlan] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchPlan = async () => {
      if (!user) return;

      try {
        console.log('Fetching subscription plan for user:', user.id);
        
        // Get customer ID first
        const { data: customerData, error: customerError } = await supabase
          .from('stripe_customers')
          .select('customer_id')
          .eq('user_id', user.id)
          .is('deleted_at', null)
          .maybeSingle();

        console.log('Customer data:', customerData);
        
        // Check direct table first
        const { data: stripeData, error: stripeError } = await supabase
          .from('stripe_subscriptions')
          .select('price_id, status, subscription_id, customer_id')
          .eq('customer_id', customerData?.customer_id)
          .is('deleted_at', null)
          .limit(1)
          .maybeSingle();

        console.log('Direct Stripe subscription data:', stripeData);
        
        // Also check view for comparison
        const { data: viewData, error: viewError } = await supabase
          .from('stripe_user_subscriptions')
          .select('price_id, subscription_status, customer_id')
          .limit(1)
          .maybeSingle();

        console.log('View Stripe subscription data:', viewData);

        // Use direct table data first, fallback to view
        const subscriptionData = stripeData || viewData;
        const status = subscriptionData?.status || subscriptionData?.subscription_status;
        
        // If no Stripe subscription found or it's not active, check regular subscriptions
        if (!subscriptionData || status !== 'active') {
          console.log('No active Stripe subscription, checking regular subscriptions...');
          
          const { data: subData, error: subError } = await supabase
            .from('subscriptions')
            .select('plan')
            .eq('user_id', user.id)
            .limit(1)
            .maybeSingle();

          if (subError) throw subError;
          
          console.log('Regular subscription data:', subData);
          setPlan(subData?.plan || 'free');
        } else {
          // Map Stripe price_id to plan name
          const planMap: { [key: string]: string } = {
            'price_1RIDwLGMh07VKLbnujKxoJmN': 'free',
            'price_1RICRBGMh07VKLbntwSXXPdM': 'monthly',
            'price_1RICWFGMh07VKLbnLsU1jkVZ': 'yearly'
          };
          
          const mappedPlan = planMap[subscriptionData.price_id] || 'free';
          console.log('Dashboard - Mapped plan from Stripe:', mappedPlan, 'for price_id:', subscriptionData.price_id, 'status:', status);
          console.log('All available price_ids:', Object.keys(planMap));
          
          // Only accept 'active' status for paid plans, but allow other statuses for free plan
          if (status === 'active' || 
              (mappedPlan === 'free' && ['not_started', 'incomplete', 'trialing', 'incomplete_expired'].includes(status))) {
            console.log('Setting plan to:', mappedPlan);
            setPlan(mappedPlan);
            setLoading(false);
            return;
          } else {
            console.log('Dashboard - Stripe subscription not active or invalid status:', status, 'for plan:', mappedPlan);
          }
        }
      } catch (err: any) {
        console.error('Error fetching subscription:', err);
        setError(err.message);
        // Fallback to free plan on error
        setPlan('free');
      } finally {
        setLoading(false);
      }
    };

    fetchPlan();
  }, [user]);

  const getPlanDetails = (planType: string | null) => {
    switch (planType) {
      case 'monthly':
        return {
          name: 'Mensal',
          color: 'bg-gradient-to-r from-purple-500 to-pink-500',
          textColor: 'text-white'
        };
      case 'yearly':
        return {
          name: 'Anual',
          color: 'bg-gradient-to-r from-yellow-500 to-orange-500',
          textColor: 'text-white'
        };
      default:
        return {
          name: 'Gratuito',
          color: 'bg-gray-100',
          textColor: 'text-gray-700'
        };
    }
  };

  const planDetails = getPlanDetails(plan);

  return (
    <div className="min-h-[calc(100vh-4rem-1px)] p-4">
      <div className="bg-white rounded-lg shadow-sm p-6">
        <h2 className="text-2xl font-bold text-gray-900 mb-6">{t('dashboard.welcome')}</h2>
        
        <div className="mb-8">
          <h3 className="text-lg font-medium text-gray-700 mb-4">Seu plano atual</h3>
          
          {loading ? (
            <div className="flex items-center text-gray-500">
              <Loader2 className="h-5 w-5 animate-spin mr-2" />
              <span>Carregando plano...</span>
            </div>
          ) : error ? (
            <div className="text-red-600 bg-red-50 p-4 rounded-lg">
              Erro ao carregar plano: {error}
            </div>
          ) : (
            <div className={`inline-flex items-center px-4 py-2 rounded-full ${planDetails.color} ${planDetails.textColor}`}>
              <Crown className="h-5 w-5 mr-2" />
              <span className="font-medium">Plano {planDetails.name}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Dashboard;