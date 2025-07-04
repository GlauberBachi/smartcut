import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabaseClient';
import ImageCropper from '../components/ImageCropper';
import { Camera, Trash2 } from 'lucide-react';

const Avatar = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [showImageCropper, setShowImageCropper] = useState(false);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  useEffect(() => {
    if (!user) {
      navigate('/');
      return;
    }
    
    if (user.user_metadata?.avatar_url) {
      setAvatarUrl(user.user_metadata.avatar_url);
    }
  }, [user, navigate]);

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

  const getInitials = (email: string) => {
    return email.charAt(0).toUpperCase();
  };

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
            <h2 className="text-2xl font-bold text-gray-900 mb-6 flex items-center">
              <Camera className="h-6 w-6 mr-3" />
              Foto de Perfil
            </h2>

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
                      <Camera className="h-5 w-5 text-white" />
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
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-md w-full p-6">
            <h3 className="text-lg font-medium text-gray-900 mb-4">
              Confirmar exclusão da foto
            </h3>
            <p className="text-sm text-gray-500 mb-4">
              Tem certeza que deseja excluir sua foto de perfil?
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
                onClick={handleDeleteAvatar}
                disabled={loading}
                className="px-4 py-2 border border-transparent rounded-md text-sm font-medium text-white bg-red-600 hover:bg-red-700 disabled:opacity-50"
              >
                {loading ? 'Excluindo...' : 'Excluir foto'}
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
    </div>
  );
};

export default Avatar;