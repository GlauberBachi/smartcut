import React from 'react';
import { Activity, CheckCircle2, Scissors, BarChart3, Clock, DollarSign, Star } from 'lucide-react';
import { useTranslation } from 'react-i18next';

const Home = () => {
  const { t } = useTranslation();

  return (
    <div className="bg-white">
      {/* Hero Section */}
      <div className="relative overflow-hidden">
        <div className="max-w-7xl mx-auto">
          <div className="relative z-10 pb-8 bg-gradient-to-br from-gray-50 to-tech-50 sm:pb-16 md:pb-20 lg:max-w-2xl lg:w-full lg:pb-28 xl:pb-32">
            <main className="mt-10 mx-auto max-w-7xl px-4 sm:mt-12 sm:px-6 md:mt-16 lg:mt-20 lg:px-8 xl:mt-28">
              <div className="sm:text-center lg:text-left">
                <h1 className="text-4xl tracking-tight font-extrabold text-gray-900 sm:text-5xl md:text-6xl">
                  <span className="block">{t('home.hero.title')}</span>
                  <span className="block text-primary-600">{t('home.hero.subtitle')}.</span>
                </h1>
                <p className="mt-3 text-base text-gray-500 sm:mt-5 sm:text-lg sm:max-w-xl sm:mx-auto md:mt-5 md:text-xl lg:mx-0">
                  {t('home.hero.description')}
                </p>
              </div>
            </main>
          </div>
        </div>
        <div className="lg:absolute lg:inset-y-0 lg:right-0 lg:w-1/2">
          <img
            className="h-56 w-full object-cover object-center grayscale contrast-125 sm:h-72 md:h-96 lg:w-full lg:h-full"
            src="/barras_HP.jpg"
            alt="Perfis metálicos e tubos industriais"
          />
        </div>
      </div>

      {/* Features Section */}
      <div className="py-16 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center">
            <h2 className="text-3xl font-extrabold text-gray-900 sm:text-4xl">{t('home.features.title')}</h2>
            <p className="mt-4 text-lg text-gray-500">{t('home.features.subtitle')}</p>
          </div>

          <div className="mt-12 grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-3">
            <div className="bg-white rounded-lg shadow-lg p-6">
              <div className="text-primary-600 mb-4">
                <BarChart3 className="h-8 w-8" />
              </div>
              <h3 className="text-xl font-medium text-gray-900">{t('home.features.wasteReduction.title')}</h3>
              <p className="mt-4 text-gray-500">
                {t('home.features.wasteReduction.description')}
              </p>
            </div>

            <div className="bg-white rounded-lg shadow-lg p-6">
              <div className="text-primary-600 mb-4">
                <Clock className="h-8 w-8" />
              </div>
              <h3 className="text-xl font-medium text-gray-900">{t('home.features.timeSaving.title')}</h3>
              <p className="mt-4 text-gray-500">
                {t('home.features.timeSaving.description')}
              </p>
            </div>

            <div className="bg-white rounded-lg shadow-lg p-6">
              <div className="text-primary-600 mb-4">
                <DollarSign className="h-8 w-8" />
              </div>
              <h3 className="text-xl font-medium text-gray-900">{t('home.features.profitability.title')}</h3>
              <p className="mt-4 text-gray-500">
                {t('home.features.profitability.description')}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Pricing Section */}
      <div className="py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center">
            <h2 className="text-3xl font-extrabold text-gray-900 sm:text-4xl">{t('home.pricing.title')}</h2>
            <p className="mt-4 text-lg text-gray-500">{t('home.pricing.subtitle')}
            </p>
          </div>

          <div className="mt-12 grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-3">
            <div className="bg-white rounded-lg shadow-lg divide-y divide-gray-200">
              <div className="p-6">
                <h3 className="text-2xl font-semibold text-gray-900">{t('home.pricing.free.title')}</h3>
                <p className="mt-4 text-gray-500">{t('home.pricing.free.description')}</p>
                <p className="mt-8">
                  <span className="text-4xl font-extrabold text-gray-900">{t('home.pricing.free.price')}</span>
                  <span className="text-base font-medium text-gray-500">{t('home.pricing.free.period')}</span>
                </p>
                <ul className="mt-6 space-y-4">
                  <li className="flex items-center">
                    <CheckCircle2 className="h-5 w-5 text-green-500" />
                    <span className="ml-3 text-gray-500">{t('home.pricing.free.features.0')}</span>
                  </li>
                  <li className="flex items-center">
                    <CheckCircle2 className="h-5 w-5 text-green-500" />
                    <span className="ml-3 text-gray-500">{t('home.pricing.free.features.1')}</span>
                  </li>
                </ul>
              </div>
            </div>

            <div className="bg-white rounded-lg shadow-lg divide-y divide-gray-200 border-2 border-primary-500">
              <div className="p-6">
                <h3 className="text-2xl font-semibold text-gray-900">{t('home.pricing.pro.title')}</h3>
                <p className="mt-4 text-gray-500">{t('home.pricing.pro.description')}</p>
                <p className="mt-8">
                  <span className="text-4xl font-extrabold text-gray-900">{t('home.pricing.pro.price')}</span>
                  <span className="text-base font-medium text-gray-500">{t('home.pricing.pro.period')}</span>
                </p>
                <ul className="mt-6 space-y-4">
                  <li className="flex items-center">
                    <CheckCircle2 className="h-5 w-5 text-green-500" />
                    <span className="ml-3 text-gray-500">{t('home.pricing.pro.features.0')}</span>
                  </li>
                  <li className="flex items-center">
                    <CheckCircle2 className="h-5 w-5 text-green-500" />
                    <span className="ml-3 text-gray-500">{t('home.pricing.pro.features.1')}</span>
                  </li>
                  <li className="flex items-center">
                    <CheckCircle2 className="h-5 w-5 text-green-500" />
                    <span className="ml-3 text-gray-500">{t('home.pricing.pro.features.2')}</span>
                  </li>
                </ul>
              </div>
            </div>

            <div className="bg-white rounded-lg shadow-lg divide-y divide-gray-200">
              <div className="p-6">
                <h3 className="text-2xl font-semibold text-gray-900">{t('home.pricing.enterprise.title')}</h3>
                <p className="mt-4 text-gray-500">{t('home.pricing.enterprise.description')}</p>
                <p className="mt-8">
                  <span className="text-4xl font-extrabold text-gray-900">{t('home.pricing.enterprise.price')}</span>
                  <span className="text-base font-medium text-gray-500">{t('home.pricing.enterprise.period')}</span>
                </p>
                <ul className="mt-6 space-y-4">
                  <li className="flex items-center">
                    <CheckCircle2 className="h-5 w-5 text-green-500" />
                    <span className="ml-3 text-gray-500">{t('home.pricing.enterprise.features.0')}</span>
                  </li>
                  <li className="flex items-center">
                    <CheckCircle2 className="h-5 w-5 text-green-500" />
                    <span className="ml-3 text-gray-500">{t('home.pricing.enterprise.features.1')}</span>
                  </li>
                  <li className="flex items-center">
                    <CheckCircle2 className="h-5 w-5 text-green-500" />
                    <span className="ml-3 text-gray-500">{t('home.pricing.enterprise.features.2')}</span>
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Testimonials Section */}
      <div className="py-16 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center">
            <h2 className="text-3xl font-extrabold text-gray-900 sm:text-4xl">{t('home.testimonials.title')}</h2>
            <p className="mt-4 text-lg text-gray-500">{t('home.testimonials.subtitle')}
            </p>
          </div>

          <div className="mt-12 grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-3">
            <div className="bg-white rounded-lg shadow-lg p-6">
              <div className="flex items-center mb-4">
                <div className="flex text-yellow-400">
                  {[...Array(5)].map((_, i) => (
                    <Star key={i} className="h-5 w-5 fill-current" />
                  ))}
                </div>
              </div>
              <p className="text-gray-600 mb-4">
                "Reduzimos nosso desperdício de material em 25% no primeiro mês de uso. O retorno sobre o investimento foi praticamente instantâneo."
              </p>
              <div className="font-medium text-gray-900">João Silva</div>
              <div className="text-gray-500 text-sm">Marcenaria Silva & Filhos</div>
            </div>

            <div className="bg-white rounded-lg shadow-lg p-6">
              <div className="flex items-center mb-4">
                <div className="flex text-yellow-400">
                  {[...Array(5)].map((_, i) => (
                    <Star key={i} className="h-5 w-5 fill-current" />
                  ))}
                </div>
              </div>
              <p className="text-gray-600 mb-4">
                "A interface é muito intuitiva e os resultados são precisos. Economizamos horas de planejamento em cada projeto."
              </p>
              <div className="font-medium text-gray-900">Maria Santos</div>
              <div className="text-gray-500 text-sm">Serralheria Santos</div>
            </div>

            <div className="bg-white rounded-lg shadow-lg p-6">
              <div className="flex items-center mb-4">
                <div className="flex text-yellow-400">
                  {[...Array(5)].map((_, i) => (
                    <Star key={i} className="h-5 w-5 fill-current" />
                  ))}
                </div>
              </div>
              <p className="text-gray-600 mb-4">
                "O suporte é excelente e as atualizações constantes mostram o compromisso com a melhoria contínua do produto."
              </p>
              <div className="font-medium text-gray-900">Pedro Oliveira</div>
              <div className="text-gray-500 text-sm">Móveis Sob Medida</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Home;