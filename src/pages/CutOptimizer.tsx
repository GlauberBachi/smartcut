import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabaseClient';
import { format } from 'date-fns';
import { ptBR, enUS, es, fr, it, de } from 'date-fns/locale';
import { useTranslation } from 'react-i18next';
import { useEffect } from 'react';

const CutOptimizer = () => {
  const { user } = useAuth();
  const { t, i18n } = useTranslation();
  const [userPlan, setUserPlan] = useState<string>('free');
  const [planLoading, setPlanLoading] = useState(true);
  
  const getLocale = () => {
    switch (i18n.language) {
      case 'pt': return ptBR;
      case 'es': return es;
      case 'fr': return fr;
      case 'it': return it;
      case 'de': return de;
      default: return enUS;
    }
  };

  const [client, setClient] = useState({ code: '', name: '' });
  const [stock, setStock] = useState({
    quantity: '',
    length: '',
    description: ''
  });
  const [cuts, setCuts] = useState([
    { quantity: '', length: '', description: '' }
  ]);
  const [colors] = useState([
    'bg-blue-200 text-blue-800',
    'bg-green-200 text-green-800', 
    'bg-purple-200 text-purple-800',
    'bg-yellow-200 text-yellow-800',
    'bg-pink-200 text-pink-800',
    'bg-indigo-200 text-indigo-800',
    'bg-orange-200 text-orange-800',
    'bg-teal-200 text-teal-800',
    'bg-red-200 text-red-800',
    'bg-cyan-200 text-cyan-800'
  ]);
  const [result, setResult] = useState<any[]>([]);

  useEffect(() => {
    const loadUserPlan = async () => {
      if (!user) {
        setPlanLoading(false);
        return;
      }

      try {
        // First check Stripe subscriptions for active plans
        const { data: stripeData, error: stripeError } = await supabase
          .from('stripe_user_subscriptions')
          .select('price_id, subscription_status')
          .limit(1)
          .maybeSingle();

        if (!stripeError && stripeData && stripeData.subscription_status === 'active') {
          // Map Stripe price_id to plan name
          const planMap: { [key: string]: string } = {
            'price_1RIDwLGMh07VKLbnujKxoJmN': 'free',
            'price_1RICRBGMh07VKLbntwSXXPdM': 'monthly',
            'price_1RICWFGMh07VKLbnLsU1jkVZ': 'yearly'
          };
          
          const mappedPlan = planMap[stripeData.price_id] || 'free';
          setUserPlan(mappedPlan);
        } else {
          // If no valid Stripe subscription, check regular subscriptions
          const { data: subscription } = await supabase
            .from('subscriptions')
            .select('plan')
            .eq('user_id', user.id)
            .maybeSingle();

          setUserPlan(subscription?.plan || 'free');
        }
      } catch (error) {
        console.error('Error loading user plan:', error);
        setUserPlan('free'); // Default to free on error
      } finally {
        setPlanLoading(false);
      }
    };

    loadUserPlan();
  }, [user]);

  const formatDecimal = (value: string) => {
    const num = parseFloat(value);
    return isNaN(num) ? '' : num.toFixed(2);
  };

  const formatInteger = (value: string) => {
    const num = parseInt(value);
    return isNaN(num) ? '' : num.toString();
  };

  const formatNumber = (num: number) => {
    return num.toFixed(2).replace('.', ',');
  };

  const addCut = () => {
    // Check if user is on free plan and already has 5 cuts
    if (userPlan === 'free' && cuts.length >= 5) {
      return; // Don't add more cuts for free users
    }
    setCuts([...cuts, { quantity: '', length: '', description: '' }]);
  };

  const removeCut = (index: number) => {
    setCuts(cuts.filter((_, i) => i !== index));
  };

  const handleLengthChange = (value: string, index: number) => {
    const newCuts = [...cuts];
    newCuts[index].length = value;
    setCuts(newCuts);
  };

  const handleLengthBlur = (value: string, index: number) => {
    const newCuts = [...cuts];
    newCuts[index].length = formatDecimal(value);
    setCuts(newCuts);
  };

  const calculatePatterns = () => {
    if (!stock.length || !stock.quantity) {
      alert('Por favor, preencha os dados do material');
      return;
    }

    const stockLength = parseFloat(stock.length);
    const stockQuantity = parseInt(stock.quantity);
    const detailedCuts: any[] = [];
    let totalWaste = 0;

    cuts.forEach(cut => {
      const length = parseFloat(cut.length);
      const quantity = parseInt(cut.quantity);
      if (!isNaN(length) && !isNaN(quantity) && quantity > 0 && length > 0) {
        for (let i = 0; i < quantity; i++) {
          detailedCuts.push({ length, description: cut.description });
        }
      }
    });

    if (detailedCuts.length === 0) {
      alert('Por favor, adicione pelo menos um corte válido');
      return;
    }

    detailedCuts.sort((a, b) => b.length - a.length);
    const patterns: any[] = [];
    let pendingCuts = [...detailedCuts];

    while (pendingCuts.length > 0) {
      let bestCombination: number[] = [];
      let bestWaste = stockLength;
      let bestSum = 0;

      const backtrack = (combination: number[], currentSum: number, startIndex: number, used: boolean[]) => {
        const currentWaste = stockLength - currentSum;
        if (currentWaste < 0) return;
        if (currentWaste < bestWaste || (currentWaste === bestWaste && currentSum > bestSum)) {
          bestWaste = currentWaste;
          bestSum = currentSum;
          bestCombination = [...combination];
        }
        for (let i = startIndex; i < pendingCuts.length; i++) {
          if (!used[i]) {
            const newSum = currentSum + pendingCuts[i].length;
            if (newSum > stockLength) continue;
            used[i] = true;
            combination.push(i);
            backtrack(combination, newSum, i + 1, used);
            combination.pop();
            used[i] = false;
          }
        }
      };

      backtrack([], 0, 0, Array(pendingCuts.length).fill(false));

      const usedCuts = bestCombination.map(i => pendingCuts[i]);
      pendingCuts = pendingCuts.filter((_, i) => !bestCombination.includes(i));

      if (usedCuts.length > 0) {
        const patternWaste = stockLength - usedCuts.reduce((acc, c) => acc + c.length, 0);
        totalWaste += patternWaste;
        const pattern = {
          cuts: usedCuts,
          waste: parseFloat(patternWaste.toFixed(2)),
          totalLength: stockLength,
          quantity: 1
        };
        patterns.push(pattern);
      }
    }

    // Group identical patterns and respect stock quantity
    const groupedPatterns: { [key: string]: any } = {};
    let totalPatternsNeeded = 0;

    patterns.forEach(pattern => {
      const key = pattern.cuts.map((c: any) => `${c.description}|${c.length}`).join(',');
      if (!groupedPatterns[key]) {
        groupedPatterns[key] = { ...pattern };
      } else {
        groupedPatterns[key].quantity++;
      }
      totalPatternsNeeded++;
    });

    if (totalPatternsNeeded > stockQuantity) {
      alert(`Quantidade de material insuficiente. São necessárias ${totalPatternsNeeded} barras, mas há apenas ${stockQuantity} disponíveis.`);
      return;
    }


    setResult(Object.values(groupedPatterns));
  };

  if (!user) {
    return (
      <div className="min-h-[calc(100vh-4rem-1px)] p-4">
        <div className="bg-white p-6 text-center">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">{t('cutOptimizer.title')}</h2>
          <p className="text-gray-600 mb-4">{t('cutOptimizer.loginRequired')}</p>
          <p className="text-sm text-gray-500">
            {t('cutOptimizer.registeredOnly')}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100vh-4rem)] p-4 print:p-0 bg-gray-100">
      <div className="space-y-4 print:space-y-2">
        {/* Header */}
        <div className="bg-white p-6 print:p-4 print:mb-2 min-h-[calc(12vh)] flex items-center shadow-lg rounded-lg">
          <div className="flex justify-between items-center">
            <h1 className="text-2xl font-bold text-gray-900">{t('cutOptimizer.title')}</h1>
          </div>
        </div>

        {/* Cliente Section */}
        <div className="bg-white p-6 print:p-4 min-h-[calc(20vh)] print:min-h-0 shadow-lg rounded-lg">
          <h2 className="text-xl font-semibold mb-4">{t('cutOptimizer.client.title')}</h2>
          <div className="flex gap-4">
            <div className="w-32">
              <label htmlFor="client-code" className="block text-sm font-medium text-gray-700 mb-1">
                {t('cutOptimizer.client.code')}
              </label>
              <input
                id="client-code"
                type="text"
                placeholder={t('cutOptimizer.client.code')}
                value={client.code}
                onChange={(e) => setClient({ ...client, code: e.target.value })}
                className="w-full px-3 py-2 border rounded"
              />
            </div>
            <div className="flex-1">
              <label htmlFor="client-name" className="block text-sm font-medium text-gray-700 mb-1">
                {t('cutOptimizer.client.name')}
              </label>
              <input
                id="client-name"
                type="text"
                placeholder={t('cutOptimizer.client.name')}
                value={client.name}
                onChange={(e) => setClient({ ...client, name: e.target.value })}
                className="w-full px-3 py-2 border rounded"
              />
            </div>
          </div>
        </div>

        {/* Matéria Prima Section */}
        <div className="bg-white p-6 print:hidden min-h-[calc(20vh)] shadow-lg rounded-lg">
          <h2 className="text-xl font-semibold mb-4">{t('cutOptimizer.material.title')}</h2>
          <div className="flex gap-4">
            <div className="w-32">
              <label htmlFor="stock-quantity" className="block text-sm font-medium text-gray-700 mb-1">
                {t('cutOptimizer.material.quantity')}
              </label>
              <input
                id="stock-quantity"
                type="number"
                placeholder={t('cutOptimizer.material.quantityShort')}
                value={stock.quantity}
                onChange={(e) => setStock({ ...stock, quantity: e.target.value })}
                onBlur={(e) => setStock({ ...stock, quantity: formatInteger(e.target.value) })}
                className="w-full px-3 py-2 border rounded"
              />
            </div>
            <div className="w-48">
              <label htmlFor="stock-length" className="block text-sm font-medium text-gray-700 mb-1">
                {t('cutOptimizer.material.length')}
              </label>
              <input
                id="stock-length"
                type="number"
                placeholder={t('cutOptimizer.material.lengthPlaceholder')}
                step="0.01"
                value={stock.length}
                onChange={(e) => setStock({ ...stock, length: e.target.value })}
                onBlur={(e) => setStock({ ...stock, length: formatDecimal(e.target.value) })}
                className="w-full px-3 py-2 border rounded"
              />
            </div>
            <div className="flex-1">
              <label htmlFor="stock-description" className="block text-sm font-medium text-gray-700 mb-1">
                {t('cutOptimizer.material.description')}
              </label>
              <input
                id="stock-description"
                type="text"
                placeholder={t('cutOptimizer.material.description')}
                value={stock.description}
                onChange={(e) => setStock({ ...stock, description: e.target.value })}
                className="w-full px-3 py-2 border rounded"
              />
            </div>
          </div>
        </div>

        {/* Relação de Cortes Section */}
        <div className="bg-white p-6 print:hidden min-h-[calc(20vh)] shadow-lg rounded-lg">
          <h2 className="text-xl font-semibold mb-4">{t('cutOptimizer.cuts.title')}</h2>
          <div className="space-y-3">
            {cuts.map((cut, index) => (
              <div key={index} className="flex gap-4">
                <input
                  type="number"
                  placeholder={t('cutOptimizer.cuts.quantity')}
                  value={cut.quantity}
                  onChange={(e) => {
                    const newCuts = [...cuts];
                    newCuts[index].quantity = e.target.value;
                    setCuts(newCuts);
                  }}
                  onBlur={(e) => {
                    const newCuts = [...cuts];
                    newCuts[index].quantity = formatInteger(e.target.value);
                    setCuts(newCuts);
                  }}
                  className="w-32 px-3 py-2 border rounded"
                />
                <input
                  type="number"
                  placeholder={t('cutOptimizer.cuts.lengthPlaceholder')}
                  step="0.01"
                  value={cut.length}
                  onChange={(e) => handleLengthChange(e.target.value, index)}
                  onBlur={(e) => handleLengthBlur(e.target.value, index)}
                  className="w-48 px-3 py-2 border rounded"
                />
                <input
                  type="text"
                  placeholder={t('cutOptimizer.cuts.description')}
                  value={cut.description}
                  onChange={(e) => {
                    const newCuts = [...cuts];
                    newCuts[index].description = e.target.value;
                    setCuts(newCuts);
                  }}
                  className="flex-1 px-3 py-2 border rounded"
                />
                {cuts.length > 1 && (
                  <button
                    onClick={() => removeCut(index)}
                    className="px-3 py-2 text-red-600 hover:text-red-700"
                  >
                    ×
                  </button>
                )}
              </div>
            ))}
          </div>
          <button
            onClick={addCut}
            className="mt-4 text-primary-600 hover:text-primary-700"
          >
            + {t('cutOptimizer.cuts.add')}
          </button>
        </div>

        <button
          onClick={calculatePatterns}
          className="inline-flex items-center justify-center px-6 py-2 bg-primary-600 text-white rounded hover:bg-primary-700 print:hidden"
        >
          {t('cutOptimizer.optimize')}
        </button>

        {/* Results Section */}
        {result.length > 0 && (
          <div className="bg-white p-6 print:p-4 print:mt-0 shadow-lg rounded-lg">
            <div className="flex justify-between items-center mb-6 print:hidden">
              <h2 className="text-xl font-semibold">{t('cutOptimizer.results.title')}</h2>
              <button
                onClick={() => window.print()}
                className="bg-primary-600 text-white px-4 py-2 rounded hover:bg-primary-700 print:hidden"
              >
                {t('cutOptimizer.results.print')}
              </button>
            </div>

            {/* Material Description */}
            <div className="mb-6 print:mb-4">
              <span className="font-medium">{t('cutOptimizer.results.material')}: </span>
              <span>{stock.description}</span>
            </div>

            <div className="space-y-6">
              {result.map((pattern, index) => (
                <div key={index} className="flex items-center gap-2">
                  <div className="w-8 text-right font-medium">
                    {pattern.quantity}x
                  </div>
                  <div className="flex-1">
                    <div className="flex w-full h-12 border border-gray-300">
                      {pattern.cuts.map((cut: any, cutIndex: number) => {
                        const width = (cut.length / pattern.totalLength) * 100;
                        const previousWidth = pattern.cuts
                          .slice(0, cutIndex)
                          .reduce((acc: number, c: any) => acc + (c.length / pattern.totalLength) * 100, 0);
                        
                        return (
                          <div
                            key={cutIndex}
                            className={`h-full border-r border-gray-300 flex flex-col items-center justify-center text-xs ${colors[cutIndex % colors.length]}`}
                            style={{
                              width: `${width}%`,
                            }}
                          >
                            <div className="font-medium">{cut.description}</div>
                            <div>{formatNumber(cut.length)}</div>
                          </div>
                        );
                      })}
                      {pattern.waste > 0 && (
                        <div
                          className="h-full bg-gray-100 text-gray-600 flex flex-col items-center justify-center text-xs"
                          style={{
                            width: `${(pattern.waste / pattern.totalLength) * 100}%`
                          }}
                        >
                          <div className="font-medium">{t('cutOptimizer.results.waste')}</div>
                          <div>{formatNumber(pattern.waste)}</div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
            
            {/* Add Cut Button or Upgrade Message */}
            <div className="mt-4">
              {userPlan === 'free' && cuts.length >= 5 ? (
                <div className="text-center py-4">
                  <p className="text-gray-600 mb-2">
                    Faça o upgrade do seu plano para inserir mais cortes
                  </p>
                  <button
                    onClick={() => window.location.href = '/pricing'}
                    className="inline-flex items-center px-4 py-2 border border-transparent rounded-lg shadow-sm text-sm font-medium text-white bg-gradient-to-r from-primary-600 to-tech-500 hover:from-primary-700 hover:to-tech-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 transition-all duration-200"
                  >
                    Fazer Upgrade
                  </button>
                </div>
              ) : (
                <button
                  onClick={addCut}
                  className="text-primary-600 hover:text-primary-700"
                >
                  + {t('cutOptimizer.cuts.add')}
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default CutOptimizer;