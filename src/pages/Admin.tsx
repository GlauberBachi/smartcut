import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabaseClient';
import { Bell, Trash2, Plus, Users, Activity, Clock } from 'lucide-react';
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

interface UserSession {
  id: string;
  user_id: string;
  email: string;
  login_at: string;
  logout_at: string | null;
  ip_address: string | null;
  user_agent: string | null;
  is_active: boolean;
  session_duration_minutes: number;
  minutes_active?: number;
}
const Admin = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [activeTab, setActiveTab] = useState<'notifications' | 'sessions' | 'history'>('notifications');
  const [activeSessions, setActiveSessions] = useState<UserSession[]>([]);
  const [sessionHistory, setSessionHistory] = useState<UserSession[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(false);
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
        loadActiveSessions();
        loadSessionHistory();
      } catch (error) {
        console.error('Error checking admin status:', error);
        navigate('/');
      }
    };

    checkAdminStatus();
  }, [user, navigate]);

  const loadActiveSessions = async () => {
    try {
      setSessionsLoading(true);
      console.log('Loading active sessions...');
      
      // First, get session data
      const { data: sessionsData, error: sessionsError } = await supabase
        .from('user_sessions')
        .select('id, user_id, login_at, ip_address, user_agent, is_active, created_at')
        .eq('is_active', true)
        .order('login_at', { ascending: false });

      if (sessionsError) throw sessionsError;
      
      console.log('Active sessions data loaded:', sessionsData?.length || 0, 'records');
      
      if (!sessionsData || sessionsData.length === 0) {
        setActiveSessions([]);
        return;
      }
      
      // Log para debug - verificar se há duplicatas
      const userCounts = sessionsData.reduce((acc, session) => {
        acc[session.user_id] = (acc[session.user_id] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);
      
      console.log('Active sessions per user:', userCounts);
      
      // Get unique user IDs
      const userIds = [...new Set(sessionsData.map(session => session.user_id))];
      console.log('Active session user IDs:', userIds);
      
      // Fetch user emails from both auth.users and public.users tables
      const { data: authUsersData, error: authUsersError } = await supabase
        .from('users')
        .select('id, email')
        .in('id', userIds);
      
      if (authUsersError) {
        console.error('Error fetching from users table:', authUsersError);
      }
      
      console.log('Active session users loaded from users table:', authUsersData?.length || 0, 'users');
      
      // Also try to get emails from auth.users for any missing users
      const authUserIds = (authUsersData || []).map(u => u.id);
      const missingUserIds = userIds.filter(id => !authUserIds.includes(id));
      
      // Log missing users but don't try to fetch from auth.users (requires service role)
      if (missingUserIds.length > 0) {
        console.warn('Missing users in public.users table:', missingUserIds);
      }
      
      // Combine both sources
      const allUsers = authUsersData || [];
      
      // Create a map of user_id to email
      const userEmailMap = allUsers.reduce((acc, user) => {
        acc[user.id] = user.email;
        return acc;
      }, {} as Record<string, string>);
      
      // Log any sessions with missing users
      const sessionsWithMissingUsers = sessionsData.filter(session => !userEmailMap[session.user_id]);
      if (sessionsWithMissingUsers.length > 0) {
        console.warn('Active sessions with missing users:', sessionsWithMissingUsers.map(s => ({ 
          session_id: s.id, 
          user_id: s.user_id,
          login_at: s.login_at 
        })));
      }
      
      // Transform session data with emails
      const transformedData = sessionsData.map(session => ({
        ...session,
        email: userEmailMap[session.user_id] || session.user_id,
        minutes_active: Math.round((new Date().getTime() - new Date(session.login_at).getTime()) / (1000 * 60))
      }));
      
      console.log('Active sessions transformed:', transformedData.length, 'records');
      setActiveSessions(transformedData);
    } catch (error: any) {
      console.error('Error loading active sessions:', error);
      setActiveSessions([]);
    } finally {
      setSessionsLoading(false);
    }
  };

  const loadSessionHistory = async () => {
    try {
      setSessionsLoading(true);
      console.log('Loading session history...');
      
      // First, get session data
      const { data: sessionsData, error: sessionsError } = await supabase
        .from('user_sessions')
        .select('id, user_id, login_at, logout_at, ip_address, user_agent, is_active')
        .order('login_at', { ascending: false })
        .limit(50);

      if (sessionsError) throw sessionsError;
      
      console.log('Session data loaded:', sessionsData?.length || 0, 'records');
      
      if (!sessionsData || sessionsData.length === 0) {
        console.log('No session data found');
        setSessionHistory([]);
        return;
      }
      
      // Get unique user IDs
      const userIds = [...new Set(sessionsData.map(session => session.user_id))];
      console.log('Unique user IDs:', userIds.length, 'IDs:', userIds);
      
      // Fetch user emails from both auth.users and public.users tables
      const { data: authUsersData, error: authUsersError } = await supabase
        .from('users')
        .select('id, email')
        .in('id', userIds);
      
      if (authUsersError) {
        console.error('Error fetching from users table:', authUsersError);
      }
      
      console.log('User data loaded from users table:', authUsersData?.length || 0, 'users', authUsersData);
      
      // Also try to get emails from auth.users for any missing users
      const authUserIds = (authUsersData || []).map(u => u.id);
      const missingUserIds = userIds.filter(id => !authUserIds.includes(id));
      
      // Log missing users but don't try to fetch from auth.users (requires service role)
      if (missingUserIds.length > 0) {
        console.warn('Missing users in public.users table:', missingUserIds);
        console.warn('These user IDs have sessions but no corresponding user record');
      }
      
      // Combine both sources
      const allUsers = authUsersData || [];
      
      // Create a map of user_id to email
      const userEmailMap = allUsers.reduce((acc, user) => {
        acc[user.id] = user.email;
        return acc;
      }, {} as Record<string, string>);
      
      // Log any sessions with missing users
      const sessionsWithMissingUsers = sessionsData.filter(session => !userEmailMap[session.user_id]);
      if (sessionsWithMissingUsers.length > 0) {
        console.warn('Sessions with missing users:', sessionsWithMissingUsers.map(s => ({ 
          session_id: s.id, 
          user_id: s.user_id,
          login_at: s.login_at 
        })));
      }
      
      // Transform session data with emails and duration
      const transformedData = sessionsData.map(session => {
        const loginTime = new Date(session.login_at).getTime();
        const logoutTime = session.logout_at ? new Date(session.logout_at).getTime() : new Date().getTime();
        const durationMinutes = Math.round((logoutTime - loginTime) / (1000 * 60));
        
        const email = userEmailMap[session.user_id];
        if (!email) {
          console.warn(`No email found for user_id: ${session.user_id} in session ${session.id}`);
        }
        
        return {
          ...session,
          email: email || session.user_id,
          session_duration_minutes: durationMinutes
        };
      });
      
      console.log('Transformed session data:', transformedData.length, 'records');
      setSessionHistory(transformedData);
    } catch (error: any) {
      console.error('Error loading session history:', error);
      setSessionHistory([]);
    } finally {
      setSessionsLoading(false);
    }
  };
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

  const formatDuration = (minutes: number) => {
    if (minutes < 60) {
      return `${Math.round(minutes)} min`;
    }
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = Math.round(minutes % 60);
    return `${hours}h ${remainingMinutes}m`;
  };
  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <div className="bg-white rounded-lg shadow">
        <div className="p-6">
          <div className="mb-6">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">Painel Administrativo</h2>
            
            {/* Tabs */}
            <div className="border-b border-gray-200">
              <nav className="-mb-px flex space-x-8">
                <button
                  onClick={() => setActiveTab('notifications')}
                  className={`py-2 px-1 border-b-2 font-medium text-sm ${
                    activeTab === 'notifications'
                      ? 'border-primary-500 text-primary-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
                >
                  <Bell className="h-5 w-5 inline mr-2" />
                  Notificações
                </button>
                <button
                  onClick={() => {
                    setActiveTab('sessions');
                    loadActiveSessions();
                  }}
                  className={`py-2 px-1 border-b-2 font-medium text-sm ${
                    activeTab === 'sessions'
                      ? 'border-primary-500 text-primary-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
                >
                  <Activity className="h-5 w-5 inline mr-2" />
                  Sessões Ativas ({activeSessions.length})
                </button>
                <button
                  onClick={() => {
                    setActiveTab('history');
                    loadSessionHistory();
                  }}
                  className={`py-2 px-1 border-b-2 font-medium text-sm ${
                    activeTab === 'history'
                      ? 'border-primary-500 text-primary-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
                >
                  <Clock className="h-5 w-5 inline mr-2" />
                  Histórico de Sessões
                </button>
              </nav>
            </div>
          </div>

          {error && (
            <div className="mb-4 p-4 text-red-700 bg-red-100 rounded-md">{error}</div>
          )}

          {/* Conteúdo das Tabs */}
          {activeTab === 'notifications' && (
            <div>
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-lg font-medium text-gray-900">Gerenciar Notificações</h3>
                <button
                  onClick={() => setShowCreateModal(true)}
                  className="inline-flex items-center px-4 py-2 border border-transparent rounded-lg shadow-sm text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 transition-colors duration-200"
                >
                  <Plus className="h-5 w-5 mr-2" />
                  Nova Notificação
                </button>
              </div>

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
          )}

          {/* Sessões Ativas */}
          {activeTab === 'sessions' && (
            <div>
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-lg font-medium text-gray-900">
                  Usuários Online ({activeSessions.length})
                </h3>
                <button
                  onClick={loadActiveSessions}
                  disabled={sessionsLoading}
                  className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-lg shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 transition-colors duration-200"
                >
                  <Activity className="h-5 w-5 mr-2" />
                  {sessionsLoading ? 'Atualizando...' : 'Atualizar'}
                </button>
              </div>

              {sessionsLoading ? (
                <div className="text-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-primary-600 mx-auto"></div>
                </div>
              ) : (
                <div className="overflow-hidden shadow ring-1 ring-black ring-opacity-5 rounded-lg">
                  <table className="min-w-full divide-y divide-gray-300">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="py-3.5 pl-4 pr-3 text-left text-sm font-semibold text-gray-900">Usuário</th>
                        <th className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">Login</th>
                        <th className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">Tempo Online</th>
                        <th className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">IP</th>
                        <th className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">Navegador</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 bg-white">
                      {activeSessions.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="py-8 text-center text-gray-500">
                            Nenhum usuário online no momento
                          </td>
                        </tr>
                      ) : (
                        activeSessions.map((session) => (
                          <tr key={session.id}>
                            <td className="py-4 pl-4 pr-3 text-sm">
                              <div className="flex items-center">
                                <div className="h-2 w-2 bg-green-400 rounded-full mr-2"></div>
                                <div className="font-medium text-gray-900">{session.email}</div>
                              </div>
                            </td>
                            <td className="px-3 py-4 text-sm text-gray-500">
                              {format(new Date(session.login_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                            </td>
                            <td className="px-3 py-4 text-sm text-gray-500">
                              {formatDuration(session.minutes_active || 0)}
                            </td>
                            <td className="px-3 py-4 text-sm text-gray-500">
                              {session.ip_address || 'N/A'}
                            </td>
                            <td className="px-3 py-4 text-sm text-gray-500 max-w-xs truncate">
                              {session.user_agent ? session.user_agent.split(' ')[0] : 'N/A'}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* Histórico de Sessões */}
          {activeTab === 'history' && (
            <div>
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-lg font-medium text-gray-900">Histórico de Logins</h3>
                <button
                  onClick={loadSessionHistory}
                  disabled={sessionsLoading}
                  className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-lg shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 transition-colors duration-200"
                >
                  <Clock className="h-5 w-5 mr-2" />
                  {sessionsLoading ? 'Carregando...' : 'Atualizar'}
                </button>
              </div>

              {sessionsLoading ? (
                <div className="text-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-primary-600 mx-auto"></div>
                </div>
              ) : (
                <div className="overflow-hidden shadow ring-1 ring-black ring-opacity-5 rounded-lg">
                  <table className="min-w-full divide-y divide-gray-300">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="py-3.5 pl-4 pr-3 text-left text-sm font-semibold text-gray-900">Usuário</th>
                        <th className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">Login</th>
                        <th className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">Logout</th>
                        <th className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">Duração</th>
                        <th className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">Status</th>
                        <th className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">IP</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 bg-white">
                      {sessionHistory.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="py-8 text-center text-gray-500">
                            Nenhum histórico de sessão encontrado
                          </td>
                        </tr>
                      ) : (
                        sessionHistory.map((session) => (
                          <tr key={session.id}>
                            <td className="py-4 pl-4 pr-3 text-sm">
                              <div className="font-medium text-gray-900">{session.email}</div>
                            </td>
                            <td className="px-3 py-4 text-sm text-gray-500">
                              {format(new Date(session.login_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                            </td>
                            <td className="px-3 py-4 text-sm text-gray-500">
                              {session.logout_at 
                                ? format(new Date(session.logout_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })
                                : '-'
                              }
                            </td>
                            <td className="px-3 py-4 text-sm text-gray-500">
                              {formatDuration(session.session_duration_minutes)}
                            </td>
                            <td className="px-3 py-4 text-sm">
                              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                                session.is_active 
                                  ? 'bg-green-100 text-green-800' 
                                  : 'bg-gray-100 text-gray-800'
                              }`}>
                                {session.is_active ? 'Ativo' : 'Finalizado'}
                              </span>
                            </td>
                            <td className="px-3 py-4 text-sm text-gray-500">
                              {session.ip_address || 'N/A'}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
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