import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabaseClient';
import { format, isValid, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import ImageCropper from '../components/ImageCropper';
import { Trash2, User, Camera, Key, CreditCard, Bell } from 'lucide-react';

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

const Profile = () => {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  
  const [loading, setLoading] = useState(false);
  const [profile, setProfile] = useState<UserProfile>({
    first_name: '',
    last_name: '',
    phone: '',
    birth_date: '',
  });
  const [subscription, setSubscription] = useState<Subscription | null>(null);
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

  useEffect(() => {
    if (!user) {
      console.log('No user found, redirecting to home');
      navigate('/');
      return;
    }
    
    console.log('User found, loading data for:', user.email);
    loadAllData();
  }, [user, navigate]);

  const loadAllData = async () => {
    try {
      setIsLoading(true);
      console.log('Loading profile data...');
      
      // Load profile data
      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select('full_name, phone, birth_date')
        .eq('id', user.id)
        .maybeSingle();

      if (profileError) throw profileError;
      console.log('Profile data loaded:', profileData);
      
      if (profileData) {
        const nameParts = (profileData.full_name || '').split(' ');
        const firstName = nameParts[0] || '';
        const lastName = nameParts.slice(1).join(' ') || '';

        setProfile({
          first_name: firstName,
          last_name: lastName,
          phone: profileData.phone || '',
          birth_date: profileData.birth_date || '',
        });
      }

      // Load subscription data
      console.log('Loading subscription data...');
      const { data: subData, error: subError } = await supabase
        .from('subscriptions')
        .select('*')
        .eq('user_id', user.id)
        .limit(1)
        .maybeSingle();

      if (subError) throw subError;
      console.log('Subscription data loaded:', subData);
      
      if (subData) {
        setSubscription(subData);
      } else {
        setSubscription({
          plan: 'free',
          status: 'active',
          current_period_end: new Date(Date.now() + 100 * 365 * 24 * 60 * 60 * 1000).toISOString(),
          cancel_at_period_end: false
        });
      }

      // Set avatar URL
      if (user.user_metadata?.avatar_url) {
        setAvatarUrl(user.user_metadata.avatar_url);
      }
      
      console.log('All data loaded successfully');
      
    } catch (error: any) {
      console.error('Error loading data:', error);
      setError('Erro ao carregar dados do perfil');
    } finally {
      setIsLoading(false);
    }
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

      setAvatarUrl(null);
      setSuccess('Foto de perfil removida com sucesso!');
      setShowDeleteConfirm(false);
    } catch (error: any) {
      setError(`Erro ao remover foto de perfil: ${error.message || 'Erro desconhecido'}`);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteAccount = async () => {
    if (!user?.id) return;

    setLoading(true);
    setError('');

    try {
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      
      if (sessionError || !session) {
        throw new Error('Failed to get authentication session');
      }

      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/delete-account`, {
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
      
      await signOut();
    } catch (error: any) {
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

  if (isLoading) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="bg-white rounded-lg shadow p-6">
          <div className="animate-pulse">
            <div className="h-8 bg-gray-200 rounded w-1/4 mb-6"></div>
            <div className="space-y-4">
              <div className="h-4 bg-gray-200 rounded w-3/4"></div>
              <div className="h-4 bg-gray-200 rounded w-1/2"></div>
              <div className="h-4 bg-gray-200 rounded w-5/6"></div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="py-8 px-4">
      {error && (
        <div className="max-w-4xl mx-auto mb-6">
          <div className="p-4 text-red-700 bg-red-100 rounded-md">{error}</div>
        </div>
      )}
      {success && (
        <div className="max-w-4xl mx-auto mb-6">
          <div className="p-4 text-green-700 bg-green-100 rounded-md">{success}</div>
        </div>
      )}

      <div className="max-w-4xl mx-auto">
        <div className="bg-white rounded-lg shadow">
          <div className="p-6">
            <h2 className="text-2xl font-bold text-gray-900 mb-6">Perfil do Usuário</h2>
            
            {/* Personal Information Section */}
            <div className="mb-8">
              <h3 className="text-lg font-medium text-gray-900 mb-4">Informações Pessoais</h3>
              <form onSubmit={handleProfileUpdate} className="space-y-6">
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

            {/* Subscription Section */}
            <div className="mb-8">
              <h3 className="text-lg font-medium text-gray-900 mb-4">Assinatura</h3>
              <div className="bg-gray-50 p-6 rounded-lg">
                <h4 className="text-md font-medium text-gray-900">Plano atual</h4>
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
                    <p className="text-sm text-gray-500">
                      Próximo vencimento:{' '}
                      <span className="font-medium text-gray-900">
                        {formatDate(subscription?.current_period_end)}
                      </span>
                    </p>
                  )}
                </div>
                <div className="mt-6">
                  <button
                    onClick={() => navigate('/pricing')}
                    className="w-full py-3 px-4 border border-transparent rounded-lg shadow-sm text-sm font-medium text-white bg-gradient-to-r from-primary-600 to-tech-500 hover:from-primary-700 hover:to-tech-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 transition-all duration-200"
                  >
                    {subscription?.plan === 'free' ? 'Assinar um plano' : 'Gerenciar assinatura'}
                  </button>
                </div>
              </div>
            </div>

            {/* Danger Zone Section */}
            <div className="mb-8">
              <h3 className="text-lg font-medium text-gray-900 mb-4">Zona de Perigo</h3>
              <div className="bg-red-50 border border-red-200 rounded-lg p-6">
                <h4 className="text-md font-medium text-red-800 mb-4">Excluir Conta</h4>
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
          </div>
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-md w-full p-6">
            <h3 className="text-lg font-medium text-gray-900 mb-4">
              Confirmar exclusão da conta
            </h3>
            <p className="text-sm text-gray-500 mb-4">
              Tem certeza que deseja excluir sua conta? Esta ação não pode ser desfeita e todos os seus dados serão permanentemente excluídos.
            </p>
            <div className="flex justify-end space-x-3">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
                disabled={loading}
              >
                Cancelar
              </button>
              <button
                onClick={handleDeleteAccount}
                disabled={loading}
                className="px-4 py-2 border border-transparent rounded-md text-sm font-medium text-white bg-red-600 hover:bg-red-700 disabled:opacity-50"
              >
                {loading ? 'Excluindo...' : 'Excluir conta'}
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