import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { createClient } from '@supabase/supabase-js';
import { format, isValid, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import ImageCropper from '../components/ImageCropper';
import { Trash2 } from 'lucide-react';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('Missing Supabase environment variables');
}

const supabase = createClient(supabaseUrl || '', supabaseAnonKey || '', {
  auth: {
    persistSession: true,
    storageKey: 'app-auth',
    storage: localStorage
  }
});

interface UserProfile {
  first_name: string;
  last_name: string;
  phone: string;
  birth_date: string;
}

interface Subscription {
  plan: string;
  status: string;
  current_period_end: string;
  cancel_at_period_end: boolean;
}

interface Payment {
  id: string;
  amount: number;
  status: string;
  created_at: string;
}

const Profile = () => {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [loading, setLoading] = useState(false);
  const [profile, setProfile] = useState<UserProfile>({
    first_name: '',
    last_name: '',
    phone: '',
    birth_date: '',
  });
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [newPassword, setNewPassword] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [showImageCropper, setShowImageCropper] = useState(false);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [currentPlan, setCurrentPlan] = useState<string | null>(null);

  useEffect(() => {
    if (!user) {
      navigate('/');
      return;
    }
    
    // Load user's current plan
    const loadUserPlan = async () => {
      try {
        // First get the customer_id from stripe_customers table
        const { data: customerData, error: customerError } = await supabase
          .from('stripe_customers')
          .select('customer_id')
          .eq('user_id', user.id)
          .is('deleted_at', null)
          .limit(1)
          .maybeSingle();

        if (customerError) {
          console.error('Error loading customer:', customerError);
          setCurrentPlan('free');
          return;
        }

        if (!customerData?.customer_id) {
          setCurrentPlan('free');
          return;
        }

        // Then use the customer_id to get subscription data
        const { data: subscriptionData, error: subscriptionError } = await supabase
          .from('stripe_subscriptions')
          .select('status, price_id')
          .eq('customer_id', customerData.customer_id)
          .is('deleted_at', null)
          .limit(1)
          .maybeSingle();

        if (subscriptionError) {
          console.error('Error loading subscription:', subscriptionError);
          setCurrentPlan('free');
          return;
        }

        if (subscriptionData?.status === 'active') {
          setCurrentPlan(subscriptionData.price_id);
        } else {
          setCurrentPlan('free');
        }
      } catch (error) {
        console.error('Error loading subscription:', error);
        setCurrentPlan('free');
      }
    };

    // Set initial avatar URL from user metadata
    if (user.user_metadata?.avatar_url) {
      setAvatarUrl(user.user_metadata.avatar_url);
    }

    loadUserPlan();
    loadUserProfile();
    loadSubscription();
    loadPayments();
  }, [user, navigate]);

  const loadUserProfile = async () => {
    if (!user?.id) return;

    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('full_name, phone, birth_date')
        .eq('id', user.id)
        .maybeSingle();

      if (error) throw error;
      
      if (data) {
        // Split full_name into first_name and last_name
        const nameParts = (data.full_name || '').split(' ');
        const firstName = nameParts[0] || '';
        const lastName = nameParts.slice(1).join(' ') || '';

        setProfile({
          first_name: firstName,
          last_name: lastName,
          phone: data.phone || '',
          birth_date: data.birth_date || '',
        });
      }
      
      setIsLoading(false);
    } catch (error: any) {
      console.error('Error loading profile:', error);
      setError(`Erro ao carregar perfil: ${error.message || 'Erro desconhecido'}`);
      setIsLoading(false);
    }
  };

  const loadSubscription = async () => {
    if (!user?.id) return;

    try {
      const { data, error } = await supabase
        .from('subscriptions')
        .select('*')
        .eq('user_id', user.id)
        .limit(1)
        .maybeSingle();

      if (error) {
        console.error('Supabase query error:', error);
        throw error;
      }
      
      if (data) {
        setSubscription(data);
      } else {
        setSubscription({
          plan: 'free',
          status: 'active',
          current_period_end: new Date(Date.now() + 100 * 365 * 24 * 60 * 60 * 1000).toISOString(),
          cancel_at_period_end: false
        });
      }
    } catch (error: any) {
      console.error('Detailed subscription error:', error);
      setError(`Erro ao carregar assinatura: ${error.message || 'Erro desconhecido'}`);
      
      setSubscription({
        plan: 'free',
        status: 'active',
        current_period_end: new Date(Date.now() + 100 * 365 * 24 * 60 * 60 * 1000).toISOString(),
        cancel_at_period_end: false
      });
    }
  };

  const loadPayments = async () => {
    setPayments([
      {
        id: '1',
        amount: 9.90,
        status: 'succeeded',
        created_at: new Date().toISOString(),
      },
    ]);
  };

  const handleProfileUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user?.id) return;

    setLoading(true);
    setError('');
    setSuccess('');

    try {
      const { error } = await supabase
        .from('profiles')
        .upsert({
          id: user.id,
          full_name: `${profile.first_name} ${profile.last_name}`.trim(),
          phone: profile.phone || null,
          birth_date: profile.birth_date || null,
          updated_at: new Date().toISOString(),
        });

      if (error) throw error;
      setSuccess('Perfil atualizado com sucesso!');
    } catch (error: any) {
      console.error('Error updating profile:', error);
      setError(`Erro ao atualizar perfil: ${error.message || 'Erro desconhecido'}`);
    } finally {
      setLoading(false);
    }
  };

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setSuccess('');

    try {
      const { error } = await supabase.auth.updateUser({
        password: newPassword,
      });

      if (error) throw error;
      setSuccess('Senha alterada com sucesso!');
      setNewPassword('');
      setCurrentPassword('');
    } catch (error: any) {
      console.error('Error changing password:', error);
      setError(`Erro ao alterar senha: ${error.message || 'Erro desconhecido'}`);
    } finally {
      setLoading(false);
    }
  };

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || !e.target.files[0]) return;

    const file = e.target.files[0];
    const reader = new FileReader();

    reader.onloadend = () => {
      setSelectedImage(reader.result as string);
      setShowImageCropper(true);
    };

    reader.readAsDataURL(file);
  };

  const handleCroppedImage = async (croppedBlob: Blob) => {
    if (!user?.id) return;

    setLoading(true);
    setError('');
    setSuccess('');

    try {
      const fileName = `${user.id}/${Math.random().toString(36).substring(2)}.jpg`;

      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(fileName, croppedBlob, { 
          contentType: 'image/jpeg',
          upsert: true 
        });

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('avatars')
        .getPublicUrl(fileName);

      const { error: updateError } = await supabase.auth.updateUser({
        data: { avatar_url: publicUrl }
      });

      if (updateError) throw updateError;

      setAvatarUrl(publicUrl);
      setSuccess('Foto de perfil atualizada com sucesso!');
    } catch (error: any) {
      console.error('Error updating avatar:', error);
      setError(`Erro ao atualizar foto de perfil: ${error.message || 'Erro desconhecido'}`);
    } finally {
      setLoading(false);
      setShowImageCropper(false);
      setSelectedImage(null);
    }
  };

  const handleDeleteAvatar = async () => {
    if (!user?.id) return;

    setLoading(true);
    setError('');
    setSuccess('');

    try {
      const { error: updateError } = await supabase.auth.updateUser({
        data: { avatar_url: null }
      });

      if (updateError) throw updateError;

      const { error: deleteError } = await supabase.storage
        .from('avatars')
        .remove([`${user.id}`]);

      if (deleteError) throw deleteError;

      setAvatarUrl(null);
      setSuccess('Foto de perfil removida com sucesso!');
      setShowDeleteConfirm(false);
    } catch (error: any) {
      console.error('Error deleting avatar:', error);
      setError(`Erro ao remover foto de perfil: ${error.message || 'Erro desconhecido'}`);
    } finally {
      setLoading(false);
    }
  };

  const handleCancelSubscription = async () => {
    if (!user?.id || !subscription) return;

    setLoading(true);
    setError('');
    setSuccess('');

    try {
      const { error: updateError } = await supabase
        .from('subscriptions')
        .update({
          cancel_at_period_end: true,
          updated_at: new Date().toISOString()
        })
        .eq('user_id', user.id)
        .select()
        .single();

      if (updateError) throw updateError;

      await loadSubscription();
      
      setSuccess('Assinatura cancelada com sucesso! Você ainda terá acesso até o final do período atual.');
      setShowCancelConfirm(false);
    } catch (error: any) {
      console.error('Error canceling subscription:', error);
      setError(`Erro ao cancelar assinatura: ${error.message || 'Erro desconhecido'}`);
    } finally {
      setLoading(false);
    }
  };

  const handleResumeSubscription = async () => {
    if (!user?.id || !subscription) return;

    setLoading(true);
    setError('');
    setSuccess('');

    try {
      const { error } = await supabase
        .from('subscriptions')
        .update({
          cancel_at_period_end: false,
          updated_at: new Date().toISOString(),
        })
        .eq('user_id', user.id)
        .select()
        .single();

      if (error) throw error;
      
      await loadSubscription();
      
      setSuccess('Sua assinatura foi reativada com sucesso!');
    } catch (error: any) {
      console.error('Error resuming subscription:', error);
      setError(`Erro ao reativar assinatura: ${error.message || 'Erro desconhecido'}`);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteAccount = async () => {
    if (!user?.id) return;

    setLoading(true);
    setError('');
    setSuccess('');

    try {
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      
      if (sessionError || !session) {
        throw new Error('Failed to get authentication session');
      }

      const response = await fetch(`${supabaseUrl}/functions/v1/delete-account`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error);
      }

      setShowSuccessModal(true);
      setShowDeleteConfirm(false);
      
      // Only sign out after successful deletion
      await signOut();
    } catch (error: any) {
      console.error('Error deleting account:', error);
      setError(`Erro ao excluir conta: ${error.message || 'Erro desconhecido'}`);
      setLoading(false);
    }
  };

  const getInitials = (email: string) => {
    return email.charAt(0).toUpperCase();
  };

  const formatDate = (dateString: string | null | undefined, defaultValue: string = 'N/A') => {
    if (!dateString) return defaultValue;
    
    const date = parseISO(dateString);
    if (!isValid(date)) return defaultValue;
    
    return format(date, "dd 'de' MMMM 'de' yyyy", { locale: ptBR });
  };

  const formatDateTime = (dateString: string | null | undefined, defaultValue: string = 'N/A') => {
    if (!dateString) return defaultValue;
    
    const date = parseISO(dateString);
    if (!isValid(date)) return defaultValue;
    
    return format(date, "dd/MM/yyyy 'às' HH:mm", { locale: ptBR });
  };

  if (isLoading) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="bg-white rounded-lg shadow p-6">
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

  const renderPersonalInfo = () => (
    <div className="max-w-2xl mx-auto min-h-[calc(100vh-13rem)] flex flex-col">
      <h2 className="text-2xl font-bold text-gray-900 mb-6">Informações Pessoais</h2>
      <form onSubmit={handleProfileUpdate} className="space-y-6 flex-1">
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
          <div>
            <label htmlFor="first_name" className="block text-sm font-medium text-gray-700">
              Nome
            </label>
            <input
              type="text"
              id="first_name"
              value={profile.first_name}
              onChange={(e) => setProfile({ ...profile, first_name: e.target.value })}
              className="mt-1 block w-full rounded-lg border-2 border-gray-300 px-4 py-3 bg-white shadow-sm focus:border-primary-500 focus:ring-2 focus:ring-primary-200 focus:ring-opacity-50 transition-colors duration-200"
            />
          </div>
          <div>
            <label htmlFor="last_name" className="block text-sm font-medium text-gray-700">
              Sobrenome
            </label>
            <input
              type="text"
              id="last_name"
              value={profile.last_name}
              onChange={(e) => setProfile({ ...profile, last_name: e.target.value })}
              className="mt-1 block w-full rounded-lg border-2 border-gray-300 px-4 py-3 bg-white shadow-sm focus:border-primary-500 focus:ring-2 focus:ring-primary-200 focus:ring-opacity-50 transition-colors duration-200"
            />
          </div>
        </div>
        <div>
          <label htmlFor="phone" className="block text-sm font-medium text-gray-700">
            Telefone
          </label>
          <input
            type="tel"
            id="phone"
            value={profile.phone}
            onChange={(e) => setProfile({ ...profile, phone: e.target.value })}
            className="mt-1 block w-full rounded-lg border-2 border-gray-300 px-4 py-3 bg-white shadow-sm focus:border-primary-500 focus:ring-2 focus:ring-primary-200 focus:ring-opacity-50 transition-colors duration-200"
          />
        </div>
        <div>
          <label htmlFor="birth_date" className="block text-sm font-medium text-gray-700">
            Data de nascimento
          </label>
          <input
            type="date"
            id="birth_date"
            value={profile.birth_date}
            onChange={(e) => setProfile({ ...profile, birth_date: e.target.value })}
            className="mt-1 block w-full rounded-lg border-2 border-gray-300 px-4 py-3 bg-white shadow-sm focus:border-primary-500 focus:ring-2 focus:ring-primary-200 focus:ring-opacity-50 transition-colors duration-200"
          />
        </div>
        <button
          type="submit"
          disabled={loading}
          className="w-full py-3 px-4 border border-transparent rounded-lg shadow-sm text-sm font-medium text-white bg-gradient-to-r from-primary-600 to-tech-500 hover:from-primary-700 hover:to-tech-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 disabled:opacity-50 transition-all duration-200"
        >
          {loading ? 'Salvando...' : 'Salvar alterações'}
        </button>
      </form>
    </div>
  );

  const renderAvatarSection = () => (
    <div className="max-w-2xl mx-auto">
      <h2 className="text-2xl font-bold text-gray-900 mb-6">Foto de Perfil</h2>
      <div className="space-y-6">
        <div className="flex items-center justify-center">
          <div className="relative">
            <div className="h-32 w-32 rounded-full overflow-hidden bg-primary-100 flex items-center justify-center">
              {avatarUrl ? (
                <img
                  src={avatarUrl}
                  alt={`Avatar de ${user?.email}`}
                  className="h-full w-full object-cover"
                  onError={(e) => {
                    const target = e.target as HTMLImageElement;
                    target.style.display = 'none';
                    target.parentElement!.innerHTML = `<span class="text-2xl font-medium text-primary-600">${getInitials(user?.email || '')}</span>`;
                  }}
                />
              ) : (
                <span className="text-2xl font-medium text-primary-600">
                  {getInitials(user?.email || '')}
                </span>
              )}
            </div>
            <div className="absolute bottom-0 right-0 flex gap-2">
              <label
                htmlFor="avatar-upload"
                className="bg-primary-600 rounded-full p-2 cursor-pointer hover:bg-primary-700 transition-colors duration-200"
              >
                <input
                  type="file"
                  id="avatar-upload"
                  accept="image/*"
                  onChange={handleAvatarChange}
                  className="hidden"
                />
                <svg
                  className="h-5 w-5 text-white"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"
                  />
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"
                  />
                </svg>
              </label>
              {avatarUrl && (
                <button
                  onClick={() => setShowDeleteConfirm(true)}
                  className="bg-red-600 rounded-full p-2 hover:bg-red-700 transition-colors duration-200"
                >
                  <Trash2 className="h-5 w-5 text-white" />
                </button>
              )}
            </div>
          </div>
        </div>
        <p className="text-sm text-gray-500 text-center">
          Clique no ícone da câmera para alterar sua foto de perfil
        </p>
      </div>
    </div>
  );

  const renderPasswordSection = () => (
    <div className="max-w-2xl mx-auto">
      <h2 className="text-2xl font-bold text-gray-900 mb-6">Alterar Senha</h2>
      <form onSubmit={handlePasswordChange} className="space-y-6">
        <div>
          <label htmlFor="current-password" className="block text-sm font-medium text-gray-700">
            Senha atual
          </label>
          <input
            type="password"
            id="current-password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            className="mt-1 block w-full rounded-lg border-2 border-gray-300 px-4 py-3 bg-white shadow-sm focus:border-primary-500 focus:ring-2 focus:ring-primary-200 focus:ring-opacity-50 transition-colors duration-200"
            required
          />
        </div>
        <div>
          <label htmlFor="new-password" className="block text-sm font-medium text-gray-700">
            Nova senha
          </label>
          <input
            type="password"
            id="new-password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            className="mt-1 block w-full rounded-lg border-2 border-gray-300 px-4 py-3 bg-white shadow-sm focus:border-primary-500 focus:ring-2 focus:ring-primary-200 focus:ring-opacity-50 transition-colors duration-200"
            required
          />
        </div>
        <button
          type="submit"
          disabled={loading}
          className="w-full py-3 px-4 border border-transparent rounded-lg shadow-sm text-sm font-medium text-white bg-gradient-to-r from-primary-600 to-tech-500 hover:from-primary-700 hover:to-tech-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 disabled:opacity-50 transition-all duration-200"
        >
          {loading ? 'Alterando...' : 'Alterar senha'}
        </button>
      </form>
    </div>
  );

  const renderSubscriptionSection = () => (
    <div className="max-w-2xl mx-auto">
      <h2 className="text-2xl font-bold text-gray-900 mb-6">Assinatura</h2>
      <div className="space-y-6">
        <div className="bg-gray-50 p-6 rounded-lg">
          <h3 className="text-lg font-medium text-gray-900">Plano atual</h3>
          <div className="mt-4">
            <p className="text-sm text-gray-500">
              Plano:{' '}
              <span className="font-medium text-gray-900">
                {subscription?.plan === 'free' ? 'Gratuito' : subscription?.plan === 'monthly' ? 'Mensal' : 'Anual'}
              </span>
            </p>
            <p className="text-sm text-gray-500">
              Status:{' '}
              <span className="font-medium text-green-600">
                {subscription?.status === 'active' ? 'Ativo' : 'Inativo'}
              </span>
            </p>
            {subscription?.plan !== 'free' && (
              <>
                <p className="text-sm text-gray-500">
                  Próximo vencimento:{' '}
                  <span className="font-medium text-gray-900">
                    {formatDate(subscription?.current_period_end)}
                  </span>
                </p>
                {subscription?.cancel_at_period_end && (
                  <p className="mt-2 text-sm text-amber-600 bg-amber-50 p-2 rounded">
                    Seu plano será cancelado ao final do período atual. Você ainda tem acesso a todos os recursos até {formatDate(subscription?.current_period_end)}.
                  </p>
                )}
              </>
            )}
          </div>
          <div className="mt-6 space-y-2">
            <button
              onClick={() => navigate('/pricing')}
              className="w-full py-3 px-4 border border-transparent rounded-lg shadow-sm text-sm font-medium text-white bg-gradient-to-r from-primary-600 to-tech-500 hover:from-primary-700 hover:to-tech-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 transition-all duration-200"
            >
              {subscription?.plan === 'free' ? 'Assinar um plano' : 'Trocar de plano'}
            </button>
            
            {subscription?.plan !== 'free' && !subscription?.cancel_at_period_end && (
              <button
                onClick={() => setShowCancelConfirm(true)}
                className="w-full py-3 px-4 border border-gray-300 rounded-lg shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 transition-colors duration-200"
              >
                Cancelar plano
              </button>
            )}

            {subscription?.cancel_at_period_end && (
              <button
                onClick={handleResumeSubscription}
                className="w-full py-3 px-4 border border-gray-300 rounded-lg shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 transition-colors duration-200"
              >
                Reativar assinatura
              </button>
            )}
          </div>
        </div>

        {subscription?.plan !== 'free' && (
          <div>
            <h3 className="text-lg font-medium text-gray-900 mb-4">Histórico de pagamentos</h3>
            <div className="bg-white shadow overflow-hidden sm:rounded-lg">
              <ul className="divide-y divide-gray-200">
                {payments.map((payment) => (
                  <li key={payment.id} className="px-4 py-4 sm:px-6">
                    <div className="flex items-center justify-between">
                      <div className="text-sm font-medium text-primary-600">
                        R$ {payment.amount.toFixed(2)}
                      </div>
                      <div className="text-sm text-gray-500">
                        {formatDateTime(payment.created_at)}
                      </div>
                    </div>
                    <div className="mt-2 sm:flex sm:justify-between">
                      <div className="text-sm text-gray-500">ID: {payment.id}</div>
                      <div className="mt-2 sm:mt-0">
                        <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-green-100 text-green-800">
                          {payment.status === 'succeeded' ? 'Aprovado' : 'Pendente'}
                        </span>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </div>
    </div>
  );

  const renderDangerSection = () => (
    <div className="max-w-2xl mx-auto">
      <h2 className="text-2xl font-bold text-gray-900 mb-6">Zona de Perigo</h2>
      <div className="bg-red-50 border border-red-200 rounded-lg p-6">
        <h3 className="text-lg font-medium text-red-800 mb-4">Excluir Conta</h3>
        <p className="text-sm text-red-600 mb-6">
          Atenção: Esta ação é irreversível. Todos os seus dados serão permanentemente excluídos.
        </p>
        <button
          onClick={() => setShowDeleteConfirm(true)}
          className="w-full py-3 px-4 border border-transparent rounded-lg shadow-sm text-sm font-medium text-white bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 transition-colors duration-200"
        >
          Excluir minha conta
        </button>
      </div>
    </div>
  );

  const renderContent = () => {
    const tab = location.state && location.state.activeTab ? location.state.activeTab : 'personal';
    
    switch (tab) {
      case 'personal':
        return renderPersonalInfo();
      case 'avatar':
        return renderAvatarSection();
      case 'password':
        return renderPasswordSection();
      case 'subscription':
        return renderSubscriptionSection();
      case 'danger':
        return renderDangerSection();
      default:
        return renderPersonalInfo();
    }
  };

  return (
    <div className="py-8 px-4">
      {error && (
        <div className="max-w-2xl mx-auto mb-6">
          <div className="p-4 text-red-700 bg-red-100 rounded-md">{error}</div>
        </div>
      )}
      {success && (
        <div className="max-w-2xl mx-auto mb-6">
          <div className="p-4 text-green-700 bg-green-100 rounded-md">{success}</div>
        </div>
      )}

      {renderContent()}

      {/* Confirmation Modal */}
      {showCancelConfirm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-md w-full p-6">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Confirmar cancelamento</h3>
            <p className="text-sm text-gray-500  mb-4">
              Tem certeza que deseja cancelar seu plano? Você ainda terá acesso a todos os recursos até o final do período atual.
            </p>
            <div className="flex justify-end space-x-3">
              <button
                onClick={() => setShowCancelConfirm(false)}
                className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
              >
                Voltar
              </button>
              <button
                onClick={handleCancelSubscription}
                disabled={loading}
                className="px-4 py-2 border border-transparent rounded-md text-sm font-medium text-white bg-red-600 hover:bg-red-700"
              >
                {loading ? 'Cancelando...' : 'Confirmar cancelamento'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Avatar Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-md w-full p-6">
            <h3 className="text-lg font-medium text-gray-900 mb-4">
              {location.state?.activeTab === 'danger' ? 'Confirmar exclusão da conta' : 'Confirmar exclusão da foto'}
            </h3>
            <p className="text-sm text-gray-500 mb-4">
              {location.state?.activeTab === 'danger'
                ? 'Tem certeza que deseja excluir sua conta? Esta ação não pode ser desfeita e todos os seus dados serão permanentemente excluídos.'
                : 'Tem certeza que deseja excluir sua foto de perfil? Esta ação não pode ser desfeita.'}
            </p>
            <div className="flex justify-end space-x-3">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50"
                disabled={loading}
              >
                Cancelar
              </button>
              <button
                onClick={location.state?.activeTab === 'danger' ? handleDeleteAccount : handleDeleteAvatar}
                disabled={loading}
                className="px-4 py-2 border border-transparent rounded-md text-sm font-medium text-white bg-red-600 hover:bg-red-700 disabled:opacity-50"
              >
                {loading ? 'Excluindo...' : location.state?.activeTab === 'danger' ? 'Excluir conta' : 'Excluir foto'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Image Cropper Modal */}
      {showImageCropper && selectedImage && (
        <ImageCropper
          image={selectedImage}
          onCropComplete={handleCroppedImage}
          onCancel={() => {
            setShowImageCropper(false);
            setSelectedImage(null);
          }}
        />
      )}

      {/* Success Modal */}
      {showSuccessModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-md w-full p-6">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Conta excluída com sucesso</h3>
            <p className="text-sm text-gray-500 mb-6">
              Sua conta foi excluída permanentemente. Todos os seus dados foram removidos do sistema.
            </p>
            <div className="flex justify-end">
              <button
                onClick={async () => {
                  await signOut();
                  navigate('/');
                }}
                className="px-4 py-2 border border-transparent rounded-md text-sm font-medium text-white bg-primary-600 hover:bg-primary-700"
              >
                Ok
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Profile;