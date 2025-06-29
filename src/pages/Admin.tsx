import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabaseClient';
import { Bell, Trash2, Plus } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface Notification {
  id: string;
  title: string;
  message: string;
  type: 'info' | 'warning' | 'error' | 'success';
  created_at: string;
  expires_at: string | null;
}

const Admin = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [newNotification, setNewNotification] = useState({
    title: '',
    message: '',
    type: 'info' as const,
    expires_at: ''
  });

  useEffect(() => {
    const checkAdminStatus = async () => {
      if (!user) {
        navigate('/');
        return;
      }

      try {
        const { data, error } = await supabase
          .from('users')
          .select('role')
          .eq('id', user.id)
          .single();

        if (error) throw error;

        if (data?.role !== 'admin') {
          navigate('/');
          return;
        }

        setIsAdmin(true);
        loadNotifications();
      } catch (error) {
        console.error('Error checking admin status:', error);
        navigate('/');
      }
    };

    checkAdminStatus();
  }, [user, navigate]);

  const loadNotifications = async () => {
    try {
      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setNotifications(data || []);
    } catch (error: any) {
      console.error('Error loading notifications:', error);
      setError(`Erro ao carregar notificações: ${error.message || 'Erro desconhecido'}`);
    }
  };

  const handleCreateNotification = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    const { title, message, type, expires_at } = newNotification;

    try {
      const { data: result, error: procError } = await supabase.rpc('create_notification_with_user_notifications', {
        p_title: title,
        p_message: message,
        p_type: type,
        p_expires_at: expires_at || null,
        p_created_by: user?.id
      });

      if (procError) throw procError;

      setShowCreateModal(false);
      setNewNotification({
        title: '',
        message: '',
        type: 'info',
        expires_at: ''
      });
      await loadNotifications();
    } catch (error: any) {
      console.error('Error creating notification:', error);
      setError(`Erro ao criar notificação: ${error.message || 'Erro desconhecido'}`);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteNotification = async (id: string) => {
    if (!confirm('Tem certeza que deseja excluir esta notificação?')) return;

    setLoading(true);
    setError('');

    try {
      const { data: success, error: deleteError } = await supabase
        .rpc('delete_notification', {
          p_notification_id: id
        });

      if (deleteError) throw deleteError;
      
      if (!success) {
        throw new Error('Falha ao excluir a notificação');
      }

      await loadNotifications();
    } catch (error: any) {
      console.error('Error deleting notification:', error);
      setError(`Erro ao excluir notificação: ${error.message || 'Erro desconhecido'}`);
    } finally {
      setLoading(false);
    }
  };

  const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setNewNotification({ ...newNotification, expires_at: e.target.value });
    // Blur the input to close the date picker
    e.target.blur();
  };

  if (!isAdmin) {
    return null;
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <div className="bg-white rounded-lg shadow">
        <div className="p-6">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-2xl font-bold text-gray-900">Gerenciar Notificações</h2>
            <button
              onClick={() => setShowCreateModal(true)}
              className="inline-flex items-center px-4 py-2 border border-transparent rounded-lg shadow-sm text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 transition-colors duration-200"
            >
              <Plus className="h-5 w-5 mr-2" />
              Nova Notificação
            </button>
          </div>

          {error && (
            <div className="mb-4 p-4 text-red-700 bg-red-100 rounded-md">{error}</div>
          )}

          <div className="overflow-hidden shadow ring-1 ring-black ring-opacity-5 rounded-lg">
            <table className="min-w-full divide-y divide-gray-300">
              <thead className="bg-gray-50">
                <tr>
                  <th className="py-3.5 pl-4 pr-3 text-left text-sm font-semibold text-gray-900">Título</th>
                  <th className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">Tipo</th>
                  <th className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">Criado em</th>
                  <th className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">Expira em</th>
                  <th className="relative py-3.5 pl-3 pr-4 sm:pr-6">
                    <span className="sr-only">Ações</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 bg-white">
                {notifications.map((notification) => (
                  <tr key={notification.id}>
                    <td className="py-4 pl-4 pr-3 text-sm">
                      <div className="font-medium text-gray-900">{notification.title}</div>
                      <div className="text-gray-500">{notification.message}</div>
                    </td>
                    <td className="px-3 py-4 text-sm">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        notification.type === 'info' ? 'bg-blue-100 text-blue-800' :
                        notification.type === 'warning' ? 'bg-yellow-100 text-yellow-800' :
                        notification.type === 'error' ? 'bg-red-100 text-red-800' :
                        'bg-green-100 text-green-800'
                      }`}>
                        {notification.type}
                      </span>
                    </td>
                    <td className="px-3 py-4 text-sm text-gray-500">
                      {format(new Date(notification.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                    </td>
                    <td className="px-3 py-4 text-sm text-gray-500">
                      {notification.expires_at
                        ? format(new Date(notification.expires_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })
                        : 'Nunca'}
                    </td>
                    <td className="py-4 pl-3 pr-4 text-right text-sm font-medium">
                      <button
                        onClick={() => handleDeleteNotification(notification.id)}
                        className="text-red-600 hover:text-red-900 transition-colors duration-200"
                      >
                        <Trash2 className="h-5 w-5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Create Notification Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-md w-full p-6">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Nova Notificação</h3>
            <form onSubmit={handleCreateNotification} className="space-y-4">
              <div>
                <label htmlFor="title" className="block text-sm font-medium text-gray-700">
                  Título
                </label>
                <input
                  type="text"
                  id="title"
                  value={newNotification.title}
                  onChange={(e) => setNewNotification({ ...newNotification, title: e.target.value })}
                  className="mt-1 block w-full rounded-lg border-2 border-gray-300 px-4 py-3 bg-white shadow-sm focus:border-primary-500 focus:ring-2 focus:ring-primary-200 focus:ring-opacity-50 transition-colors duration-200"
                  required
                />
              </div>
              <div>
                <label htmlFor="message" className="block text-sm font-medium text-gray-700">
                  Mensagem
                </label>
                <textarea
                  id="message"
                  value={newNotification.message}
                  onChange={(e) => setNewNotification({ ...newNotification, message: e.target.value })}
                  rows={3}
                  className="mt-1 block w-full rounded-lg border-2 border-gray-300 px-4 py-3 bg-white shadow-sm focus:border-primary-500 focus:ring-2 focus:ring-primary-200 focus:ring-opacity-50 transition-colors duration-200"
                  required
                />
              </div>
              <div>
                <label htmlFor="type" className="block text-sm font-medium text-gray-700">
                  Tipo
                </label>
                <select
                  id="type"
                  value={newNotification.type}
                  onChange={(e) => setNewNotification({ ...newNotification, type: e.target.value as 'info' | 'warning' | 'error' | 'success' })}
                  className="mt-1 block w-full rounded-lg border-2 border-gray-300 px-4 py-3 bg-white shadow-sm focus:border-primary-500 focus:ring-2 focus:ring-primary-200 focus:ring-opacity-50 transition-colors duration-200"
                >
                  <option value="info">Informação</option>
                  <option value="warning">Aviso</option>
                  <option value="error">Erro</option>
                  <option value="success">Sucesso</option>
                </select>
              </div>
              <div>
                <label htmlFor="expires_at" className="block text-sm font-medium text-gray-700">
                  Data de Expiração (opcional)
                </label>
                <input
                  type="datetime-local"
                  id="expires_at"
                  value={newNotification.expires_at}
                  onChange={handleDateChange}
                  className="mt-1 block w-full rounded-lg border-2 border-gray-300 px-4 py-3 bg-white shadow-sm focus:border-primary-500 focus:ring-2 focus:ring-primary-200 focus:ring-opacity-50 transition-colors duration-200"
                />
              </div>
              <div className="flex justify-end space-x-3">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-3 border-2 border-gray-300 rounded-lg text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 transition-colors duration-200"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="px-4 py-3 border border-transparent rounded-lg text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 transition-colors duration-200"
                >
                  {loading ? 'Criando...' : 'Criar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Admin;