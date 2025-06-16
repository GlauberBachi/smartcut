import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { X, Eye, EyeOff } from 'lucide-react';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const AuthModal: React.FC<AuthModalProps> = ({ isOpen, onClose }) => {
  const [isSignUp, setIsSignUp] = useState(false);
  const [isForgotPassword, setIsForgotPassword] = useState(false);
  const [isSignUpComplete, setIsSignUpComplete] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const { signIn, signInWithGoogle, signUp, resetPassword, loading, error } = useAuth();
  const [rateLimitError, setRateLimitError] = useState<string | null>(null);
  const [resetSuccess, setResetSuccess] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      setEmail('');
      setPassword('');
      setShowPassword(false);
      setIsSignUp(false);
      setIsForgotPassword(false);
      setRateLimitError(null);
      setResetSuccess(false);
      setIsSignUpComplete(false);
      setPasswordError(null);
    }
  }, [isOpen]);

  useEffect(() => {
    // Clear password error when switching between signup and signin
    setPasswordError(null);
  }, [isSignUp]);

  if (!isOpen) return null;

  const handleClose = () => {
    // Clear all state immediately
    setEmail('');
    setPassword('');
    setShowPassword(false);
    setIsSignUp(false);
    setIsForgotPassword(false);
    setRateLimitError(null);
    setResetSuccess(false);
    setIsSignUpComplete(false);
    setPasswordError(null);
    onClose();
  };

  const validatePassword = () => {
    if (isSignUp && password.length < 6) {
      setPasswordError('A senha deve ter pelo menos 6 caracteres.');
      return false;
    }
    setPasswordError(null);
    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setRateLimitError(null);
    setIsSignUpComplete(false);
    setIsSignUpComplete(false);
    
    if (!validatePassword()) {
      return;
    }

    try {
      if (isForgotPassword) {
        await resetPassword(email);
        setResetSuccess(true);
        return;
      } else if (isSignUp) {
        await signUp(email, password);
        // Show signup complete message immediately
        setIsSignUpComplete(true);
      } else {
        await signIn(email, password);
        handleClose();
      }
    } catch (error: any) {
      if (error?.message?.includes('over_email_send_rate_limit')) {
        setRateLimitError('Por favor, aguarde alguns segundos antes de tentar novamente.');
        return;
      }
    }
  };

  const renderForgotPassword = () => (
    <>
      <h2 className="text-2xl font-bold text-center mb-6">
        Recuperar senha
      </h2>
      {resetSuccess ? (
        <div className="text-center">
          <p className="text-green-600 mb-4">
            Email de recuperação enviado! Verifique sua caixa de entrada.
          </p>
          <button
            onClick={() => {
              setIsForgotPassword(false);
              setResetSuccess(false);
            }}
            className="text-primary-600 hover:text-primary-500"
          >
            Voltar para o login
          </button>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-gray-700">
              Email
            </label>
            <input
              type="email"
              id="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 block w-full rounded-lg border-2 border-gray-300 px-4 py-3 bg-white shadow-sm focus:border-primary-500 focus:ring-2 focus:ring-primary-200 focus:ring-opacity-50 transition-colors duration-200"
              required
            />
          </div>

          {rateLimitError && (
            <p className="text-amber-600 text-sm bg-amber-50 p-2 rounded">{rateLimitError}</p>
          )}

          {error && !rateLimitError && (
            <p className="text-red-600 text-sm">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 px-4 border border-transparent rounded-lg shadow-sm text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 disabled:opacity-50 transition-colors duration-200"
          >
            {loading ? 'Enviando...' : 'Enviar email de recuperação'}
          </button>

          <p className="mt-4 text-center text-sm text-gray-600">
            Lembrou sua senha?{' '}
            <button
              onClick={() => setIsForgotPassword(false)}
              className="text-primary-600 hover:text-primary-500"
            >
              Fazer login
            </button>
          </p>
        </form>
      )}
    </>
  );

  const renderSignUpComplete = () => (
    <>
      <h2 className="text-2xl font-bold text-center mb-6">
        Confirme seu email
      </h2>
      <div className="text-center">
        <div className="mb-6 flex justify-center">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center">
            <svg className="w-8 h-8 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 19v-8.93a2 2 0 01.89-1.664l7-4.666a2 2 0 012.22 0l7 4.666A2 2 0 0121 10.07V19M3 19a2 2 0 002 2h14a2 2 0 002-2M3 19l6.75-4.5M21 19l-6.75-4.5M3 10l6.75 4.5M21 10l-6.75 4.5m0 0l-1.14.76a2 2 0 01-2.22 0l-1.14-.76" />
            </svg>
          </div>
        </div>
        <p className="text-gray-600 mb-4">
          Enviamos um email para <strong>{email}</strong> com um link para confirmar sua conta.
        </p>
        <p className="text-sm text-gray-500 mb-6">
          Por favor, verifique sua caixa de entrada e clique no link de confirmação para ativar sua conta.
        </p>
        <button
          onClick={handleClose}
          className="w-full py-3 px-4 border border-transparent rounded-lg shadow-sm text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 transition-colors duration-200"
        >
          Entendi
        </button>
      </div>
    </>
  );

  const renderAuthForm = () => (
    <>
      <h2 className="text-2xl font-bold text-center mb-6">
        {isSignUp ? 'Criar conta' : 'Entrar'}
      </h2>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="email" className="block text-sm font-medium text-gray-700">
            Email
          </label>
          <input
            type="email"
            id="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-1 block w-full rounded-lg border-2 border-gray-300 px-4 py-3 bg-white shadow-sm focus:border-primary-500 focus:ring-2 focus:ring-primary-200 focus:ring-opacity-50 transition-colors duration-200"
            required
          />
        </div>

        <div>
          <label htmlFor="password" className="block text-sm font-medium text-gray-700">
            Senha {isSignUp && <span className="text-gray-500 text-xs">(mínimo 6 caracteres)</span>}
          </label>
          <div className="mt-1 relative">
            <input
              type={showPassword ? "text" : "password"}
              id="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="block w-full rounded-lg border-2 border-gray-300 px-4 py-3 bg-white shadow-sm focus:border-primary-500 focus:ring-2 focus:ring-primary-200 focus:ring-opacity-50 transition-colors duration-200 pr-12"
              required
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600 transition-colors duration-200"
            >
              {showPassword ? (
                <EyeOff className="h-5 w-5" aria-label="Ocultar senha" />
              ) : (
                <Eye className="h-5 w-5" aria-label="Mostrar senha" />
              )}
            </button>
          </div>
          {passwordError && (
            <p className="mt-1 text-red-600 text-sm">{passwordError}</p>
          )}
        </div>

        {!isSignUp && (
          <div className="text-right">
            <button
              type="button"
              onClick={() => setIsForgotPassword(true)}
              className="text-sm text-primary-600 hover:text-primary-500 transition-colors duration-200"
            >
              Esqueceu sua senha?
            </button>
          </div>
        )}

        {rateLimitError && (
          <p className="text-amber-600 text-sm bg-amber-50 p-2 rounded">{rateLimitError}</p>
        )}

        {error && !rateLimitError && !passwordError && (
          <p className="text-red-600 text-sm">{error}</p>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full py-3 px-4 border border-transparent rounded-lg shadow-sm text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 disabled:opacity-50 transition-colors duration-200"
        >
          {loading ? 'Carregando...' : (isSignUp ? 'Criar conta' : 'Entrar')}
        </button>
      </form>

      <div className="mt-6">
        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-gray-300"></div>
          </div>
          <div className="relative flex justify-center text-sm">
            <span className="px-2 bg-white text-gray-500">Ou continue com</span>
          </div>
        </div>

        <button
          onClick={signInWithGoogle}
          disabled={loading}
          className="mt-4 w-full flex items-center justify-center py-3 px-4 border-2 border-gray-300 rounded-lg shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 transition-colors duration-200"
        >
          <img
            src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg"
            alt="Google"
            className="w-5 h-5 mr-2"
          />
          Google
        </button>
      </div>

      <p className="mt-6 text-center text-sm text-gray-600">
        {isSignUp ? 'Já tem uma conta?' : 'Ainda não tem uma conta?'}
        <button
          onClick={() => setIsSignUp(!isSignUp)}
          className="ml-1 text-primary-600 hover:text-primary-500 transition-colors duration-200"
        >
          {isSignUp ? 'Entrar' : 'Criar conta'}
        </button>
      </p>
    </>
  );

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg max-w-md w-full p-6 relative">
        {!isSignUpComplete && (
          <button
            onClick={handleClose}
            className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 transition-colors duration-200"
          >
            <X className="h-6 w-6" />
          </button>
        )}
        
        {isSignUpComplete ? renderSignUpComplete() :
          isForgotPassword ? renderForgotPassword() : renderAuthForm()}
      </div>
    </div>
  );
};

export default AuthModal;