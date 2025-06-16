import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { CheckCircle } from 'lucide-react';

const Success = () => {
  const navigate = useNavigate();

  useEffect(() => {
    const timer = setTimeout(() => {
      navigate('/dashboard');
    }, 5000);

    return () => clearTimeout(timer);
  }, [navigate]);

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center px-4">
      <div className="max-w-md w-full bg-white rounded-lg shadow-lg p-8 text-center">
        <div className="mb-6 flex justify-center">
          <CheckCircle className="h-16 w-16 text-green-500" />
        </div>
        <h1 className="text-2xl font-bold text-gray-900 mb-4">
          Pagamento confirmado!
        </h1>
        <p className="text-gray-600 mb-8">
          Obrigado por assinar o SmartCut! Você agora tem acesso a todos os recursos premium da plataforma.
        </p>
        <p className="text-sm text-gray-500 mb-6">
          Você será redirecionado para o dashboard em alguns segundos.
        </p>
        <button
          onClick={() => navigate('/dashboard')}
          className="w-full py-3 px-4 border border-transparent rounded-lg shadow-sm text-sm font-medium text-white bg-gradient-to-r from-primary-600 to-tech-500 hover:from-primary-700 hover:to-tech-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 transition-all duration-200"
        >
          Ir para o Dashboard
        </button>
      </div>
    </div>
  );
};

export default Success;