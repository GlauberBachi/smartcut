import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';

const Calculator = () => {
  const { user } = useAuth();
  const [height, setHeight] = useState('');
  const [weight, setWeight] = useState('');
  const [bmi, setBmi] = useState<number | null>(null);

  const calculateBMI = (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      return;
    }

    const heightInMeters = parseFloat(height) / 100;
    const weightInKg = parseFloat(weight);
    const calculatedBMI = weightInKg / (heightInMeters * heightInMeters);
    setBmi(Math.round(calculatedBMI * 10) / 10);
  };

  const getBMICategory = (bmi: number) => {
    if (bmi < 18.5) return { category: 'Abaixo do peso', color: 'text-blue-600' };
    if (bmi < 25) return { category: 'Peso normal', color: 'text-green-600' };
    if (bmi < 30) return { category: 'Sobrepeso', color: 'text-yellow-600' };
    return { category: 'Obesidade', color: 'text-red-600' };
  };

  return (
    <div className="min-h-[calc(100vh-4rem-1px)] p-4">
      <div className="bg-white p-6">
        <h2 className="text-2xl font-bold text-gray-900 mb-6">Calculadora de IMC</h2>
        
        {!user ? (
          <div className="text-center py-6">
            <p className="text-gray-600 mb-4">Faça login para usar a calculadora</p>
            <p className="text-sm text-gray-500">Esta funcionalidade está disponível apenas para usuários cadastrados</p>
          </div>
        ) : (
          <form onSubmit={calculateBMI} className="space-y-4">
            <div>
              <label htmlFor="height" className="block text-sm font-medium text-gray-700">
                Altura (cm)
              </label>
              <input
                type="number"
                id="height"
                value={height}
                onChange={(e) => setHeight(e.target.value)}
                className="mt-1 block w-full rounded-lg border-2 border-gray-300 px-4 py-3 bg-white shadow-sm focus:border-primary-500 focus:ring-2 focus:ring-primary-200 focus:ring-opacity-50 transition-colors duration-200"
                placeholder="170"
                required
              />
            </div>
            
            <div>
              <label htmlFor="weight" className="block text-sm font-medium text-gray-700">
                Peso (kg)
              </label>
              <input
                type="number"
                id="weight"
                value={weight}
                onChange={(e) => setWeight(e.target.value)}
                className="mt-1 block w-full rounded-lg border-2 border-gray-300 px-4 py-3 bg-white shadow-sm focus:border-primary-500 focus:ring-2 focus:ring-primary-200 focus:ring-opacity-50 transition-colors duration-200"
                placeholder="70"
                required
              />
            </div>

            <button
              type="submit"
              className="w-full py-3 px-4 border border-transparent rounded-lg shadow-sm text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 transition-colors duration-200"
            >
              Calcular IMC
            </button>
          </form>
        )}

        {bmi && user && (
          <div className="mt-6 p-4 bg-gray-50 rounded-md">
            <p className="text-lg font-medium text-gray-900">
              Seu IMC é: <span className="font-bold">{bmi}</span>
            </p>
            <p className={`text-md mt-2 ${getBMICategory(bmi).color}`}>
              Classificação: {getBMICategory(bmi).category}
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default Calculator;