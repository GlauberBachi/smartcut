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
        const { data: stripeData, error: stripeError } = await supabase
          .from('stripe_user_subscriptions')
          .select('price_id, subscription_status')
          .limit(1)
          .maybeSingle();

        if (stripeError) {
          throw stripeError;
        }

        // If no Stripe subscription found or it's not active, check regular subscriptions
        if (!stripeData || stripeData.subscription_status !== 'active') {
          const { data: subData, error: subError } = await supabase
            .from('subscriptions')
            .select('plan')
            .eq('user_id', user.id)
            .limit(1)
            .maybeSingle();

          if (subError) throw subError;
          setPlan(subData?.plan || 'free');
        } else {
          // Map Stripe price_id to plan name
          const planMap: { [key: string]: string } = {
            'price_1RICRBGMh07VKLbntwSXXPdM': 'monthly',
            'price_1RICWFGMh07VKLbnLsU1jkVZ': 'yearly'
          };
          setPlan(planMap[stripeData.price_id] || 'free');
        }
      } catch (err: any) {
        console.error('Error fetching subscription:', err);
        setError(err.message);
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