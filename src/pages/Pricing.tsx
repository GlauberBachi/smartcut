import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { createCheckoutSession } from '../lib/stripe';
import { supabase } from '../lib/supabaseClient';
import { Check, Crown, Zap } from 'lucide-react';

const Pricing = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [currentPlan, setCurrentPlan] = useState<string>('free');
  const [stripeCustomerId, setStripeCustomerId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [subscribing, setSubscribing] = useState<string | null>(null);

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
        // First get the Stripe customer ID
        const { data: customerData, error: customerError } = await supabase
          .from('stripe_customers')
          .select('customer_id')
          .eq('user_id', user.id)
          .is('deleted_at', null)
          .maybeSingle();

        if (customerError) {
          console.error('Error loading customer:', customerError);
        } else if (customerData?.customer_id) {
          console.log('Found Stripe customer ID:', customerData.customer_id);
          setStripeCustomerId(customerData.customer_id);
        }

        // Check Stripe subscriptions with detailed logging
        console.log('Checking Stripe subscriptions for user:', user.email);
        const { data: stripeData, error: stripeError } = await supabase
          .from('stripe_subscriptions')
          .select('price_id, subscription_id, status, customer_id')
          .eq('customer_id', customerData?.customer_id)
          .is('deleted_at', null)
          .limit(1)
          .maybeSingle();

        console.log('Raw Stripe subscription data:', stripeData);
        console.log('Stripe subscription error:', stripeError);
        
        // Also check the view for comparison
        const { data: viewData, error: viewError } = await supabase
          .from('stripe_user_subscriptions')
          .select('price_id, subscription_status, customer_id')
          .limit(1)
          .maybeSingle();
        
        console.log('View subscription data:', viewData);
        console.log('View subscription error:', viewError);

        // Use direct table data first, fallback to view
        const subscriptionData = stripeData || viewData;
        const subscriptionError = stripeError || viewError;
        
        if (!subscriptionError && subscriptionData) {
          const priceId = subscriptionData.price_id;
          const status = subscriptionData.status || subscriptionData.subscription_status;
          
          console.log('Found Stripe subscription data:', {
            price_id: priceId,
            status: status,
            customer_id: subscriptionData.customer_id
          });
          
          // Map Stripe price_id to plan name
          const planMap: { [key: string]: string } = {
            'price_1RIDwLGMh07VKLbnujKxoJmN': 'free',
            'price_1RICRBGMh07VKLbntwSXXPdM': 'monthly',
            'price_1RICWFGMh07VKLbnLsU1jkVZ': 'yearly'
          };
          
          const mappedPlan = planMap[priceId] || 'free';
          console.log('Pricing - Mapped plan from Stripe:', mappedPlan, 'for price_id:', priceId, 'status:', status);
          console.log('All available price_ids in planMap:', Object.keys(planMap));
          
          // For paid plans, only accept 'active' status
          // For free plan, accept various statuses
          const isValidStatus = status === 'active' || 
              (mappedPlan === 'free' && ['not_started', 'incomplete', 'trialing', 'incomplete_expired'].includes(status));
          
          console.log('Is valid status?', isValidStatus, 'for plan:', mappedPlan, 'status:', status);
          
          if (isValidStatus) {
            console.log('Setting plan to:', mappedPlan);
            setCurrentPlan(mappedPlan);
            setLoading(false);
            return;
          } else {
            console.log('Pricing - Stripe subscription not active or invalid status:', status, 'for plan:', mappedPlan);
          }
        }
        
        // If no valid Stripe subscription, check regular subscriptions
        console.log('No active Stripe subscription, checking regular subscriptions...');
        
        const { data: subscription, error: regularSubscriptionError } = await supabase
          .from('subscriptions')
          .select('plan')
          .eq('user_id', user.id)
          .maybeSingle();

        console.log('Regular subscription data:', subscription);
        console.log('Regular subscription error:', regularSubscriptionError);

        if (regularSubscriptionError) {
          console.error('Error loading subscription:', regularSubscriptionError);
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

  const handleSubscribe = async (planType: 'monthly' | 'yearly') => {
    if (!user) {
      navigate('/?auth=signin');
      return;
    }

    setSubscribing(planType);
    
    try {
      // Map plan type to correct price ID
      const priceIds = {
        monthly: 'price_1RICRBGMh07VKLbntwSXXPdM',
        yearly: 'price_1RICWFGMh07VKLbnLsU1jkVZ'
      };
      
      const priceId = priceIds[planType];
      
      // Create checkout session with specific price ID
      const url = await createCheckoutSession('subscription', 'pt-BR', priceId);
      window.location.href = url;
    } catch (error: any) {
      console.error('Error redirecting to checkout:', error);
      alert('Erro ao processar pagamento: ' + error.message);
    } finally {
      setSubscribing(null);
    }
  };

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

  const getButtonText = (planType: string) => {
    if (currentPlan === planType) {
      return 'Plano Atual';
    }
    
    switch (planType) {
      case 'free':
        return 'Gratuito';
      case 'monthly':
        return currentPlan === 'free' ? 'Assinar Mensal' : 'Mudar para Mensal';
      case 'yearly':
        return currentPlan === 'free' ? 'Assinar Anual' : 'Mudar para Anual';
      default:
        return 'Selecionar';
    }
  };

  const getButtonStyle = (planType: string) => {
    if (currentPlan === planType) {
      return 'w-full py-3 px-4 border-2 border-green-500 rounded-lg text-sm font-medium text-green-700 bg-green-50 cursor-not-allowed';
    }
    
    if (planType === 'free') {
      return 'w-full py-3 px-4 border-2 border-gray-300 rounded-lg text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 transition-colors duration-200';
    }
    
    return 'w-full py-3 px-4 border border-transparent rounded-lg text-sm font-medium text-white bg-gradient-to-r from-primary-600 to-tech-500 hover:from-primary-700 hover:to-tech-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 transition-all duration-200';
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
              <button
                onClick={handleSignIn}
                className="inline-flex items-center px-6 py-3 border border-transparent text-base font-medium rounded-md shadow-sm text-white bg-primary-600 hover:bg-primary-700"
              >
                {t('nav.login')}
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-3">
              {/* Plano Gratuito */}
              <div className={`bg-white rounded-lg shadow-lg divide-y divide-gray-200 ${currentPlan === 'free' ? 'ring-2 ring-green-500' : ''}`}>
                <div className="p-6">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-2xl font-semibold text-gray-900">Gratuito</h3>
                    {currentPlan === 'free' && (
                      <Crown className="h-6 w-6 text-green-500" />
                    )}
                  </div>
                  <p className="text-gray-500 mb-4">Para pequenos projetos</p>
                  <p className="mb-8">
                    <span className="text-4xl font-extrabold text-gray-900">R$ 0</span>
                    <span className="text-base font-medium text-gray-500">/mês</span>
                  </p>
                  <ul className="space-y-4 mb-8">
                    <li className="flex items-center">
                      <Check className="h-5 w-5 text-green-500 mr-3" />
                      <span className="text-gray-500">Até 5 projetos por mês</span>
                    </li>
                    <li className="flex items-center">
                      <Check className="h-5 w-5 text-green-500 mr-3" />
                      <span className="text-gray-500">Recursos básicos</span>
                    </li>
                    <li className="flex items-center">
                      <Check className="h-5 w-5 text-green-500 mr-3" />
                      <span className="text-gray-500">Suporte por email</span>
                    </li>
                  </ul>
                  <button
                    disabled={currentPlan === 'free'}
                    className={getButtonStyle('free')}
                  >
                    {getButtonText('free')}
                  </button>
                </div>
              </div>

              {/* Plano Mensal */}
              <div className={`bg-white rounded-lg shadow-lg divide-y divide-gray-200 ${currentPlan === 'monthly' ? 'ring-2 ring-green-500' : 'border-2 border-primary-500'}`}>
                <div className="p-6">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-2xl font-semibold text-gray-900">Mensal</h3>
                    <div className="flex items-center space-x-2">
                      {currentPlan === 'monthly' ? (
                        <Crown className="h-6 w-6 text-green-500" />
                      ) : (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-primary-100 text-primary-800">
                          Mais Popular
                        </span>
                      )}
                    </div>
                  </div>
                  <p className="text-gray-500 mb-4">Para empresas em crescimento</p>
                  <p className="mb-8">
                    <span className="text-4xl font-extrabold text-gray-900">R$ 97</span>
                    <span className="text-base font-medium text-gray-500">/mês</span>
                  </p>
                  <ul className="space-y-4 mb-8">
                    <li className="flex items-center">
                      <Check className="h-5 w-5 text-green-500 mr-3" />
                      <span className="text-gray-500">Projetos ilimitados</span>
                    </li>
                    <li className="flex items-center">
                      <Check className="h-5 w-5 text-green-500 mr-3" />
                      <span className="text-gray-500">Suporte prioritário</span>
                    </li>
                    <li className="flex items-center">
                      <Check className="h-5 w-5 text-green-500 mr-3" />
                      <span className="text-gray-500">Relatórios avançados</span>
                    </li>
                    <li className="flex items-center">
                      <Check className="h-5 w-5 text-green-500 mr-3" />
                      <span className="text-gray-500">Exportação de dados</span>
                    </li>
                  </ul>
                  <button
                    onClick={() => handleSubscribe('monthly')}
                    disabled={currentPlan === 'monthly' || subscribing === 'monthly'}
                    className={getButtonStyle('monthly')}
                  >
                    {subscribing === 'monthly' ? 'Processando...' : getButtonText('monthly')}
                  </button>
                </div>
              </div>

              {/* Plano Anual */}
              <div className={`bg-white rounded-lg shadow-lg divide-y divide-gray-200 ${currentPlan === 'yearly' ? 'ring-2 ring-green-500' : ''}`}>
                <div className="p-6">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-2xl font-semibold text-gray-900">Anual</h3>
                    <div className="flex items-center space-x-2">
                      {currentPlan === 'yearly' ? (
                        <Crown className="h-6 w-6 text-green-500" />
                      ) : (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                          Economia de 16%
                        </span>
                      )}
                    </div>
                  </div>
                  <p className="text-gray-500 mb-4">Para grandes operações</p>
                  <p className="mb-2">
                    <span className="text-4xl font-extrabold text-gray-900">R$ 997</span>
                    <span className="text-base font-medium text-gray-500">/ano</span>
                  </p>
                  <p className="text-sm text-gray-500 mb-6">
                    <span className="line-through">R$ 1.164</span> - Economize R$ 167
                  </p>
                  <ul className="space-y-4 mb-8">
                    <li className="flex items-center">
                      <Check className="h-5 w-5 text-green-500 mr-3" />
                      <span className="text-gray-500">Tudo do plano Mensal</span>
                    </li>
                    <li className="flex items-center">
                      <Check className="h-5 w-5 text-green-500 mr-3" />
                      <span className="text-gray-500">API para integração</span>
                    </li>
                    <li className="flex items-center">
                      <Check className="h-5 w-5 text-green-500 mr-3" />
                      <span className="text-gray-500">Suporte 24/7</span>
                    </li>
                    <li className="flex items-center">
                      <Zap className="h-5 w-5 text-yellow-500 mr-3" />
                      <span className="text-gray-500">Recursos exclusivos</span>
                    </li>
                  </ul>
                  <button
                    onClick={() => handleSubscribe('yearly')}
                    disabled={currentPlan === 'yearly' || subscribing === 'yearly'}
                    className={getButtonStyle('yearly')}
                  >
                    {subscribing === 'yearly' ? 'Processando...' : getButtonText('yearly')}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Garantia e Informações Adicionais */}
        {user && (
          <div className="mt-12 text-center">
            <div className="bg-white rounded-lg shadow p-6">
              <h3 className="text-lg font-medium text-gray-900 mb-4">
                💳 Pagamento Seguro & Garantia
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-sm text-gray-600">
                <div>
                  <strong>🔒 100% Seguro</strong>
                  <p>Pagamentos processados pelo Stripe com criptografia SSL</p>
                </div>
                <div>
                  <strong>↩️ Cancelamento Fácil</strong>
                  <p>Cancele a qualquer momento sem taxas adicionais</p>
                </div>
                <div>
                  <strong>🎯 Suporte Dedicado</strong>
                  <p>Nossa equipe está pronta para ajudar você</p>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Pricing;