import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { createClient } from '@supabase/supabase-js';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useTranslation } from 'react-i18next';

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL || '',
  import.meta.env.VITE_SUPABASE_ANON_KEY || '',
  {
    auth: {
      persistSession: true,
      storageKey: 'app-auth',
      storage: localStorage
    }
  }
);

interface Notification {
  id: string;
  title: string;
  message: string;
  type: string;
  created_at: string;
  read: boolean;
}

const Notifications = () => {
  const { user } = useAuth();
  const { t } = useTranslation();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    loadNotifications();
  }, [user]);

  const loadNotifications = async () => {
    try {
      const { data, error } = await supabase
        .from('notifications')
        .select(`
          id,
          title,
          message,
          type,
          created_at,
          user_notifications!inner (
            read
          )
        `)
        .eq('user_notifications.user_id', user?.id)
        .order('created_at', { ascending: false });

      if (error) throw error;

      const formattedNotifications = (data || []).map(n => ({
        id: n.id,
        title: n.title,
        message: n.message,
        type: n.type,
        created_at: n.created_at,
        read: n.user_notifications[0]?.read || false
      }));

      setNotifications(formattedNotifications);
    } catch (error: any) {
      console.error('Error loading notifications:', error);
      setError(error.message);
    } finally {
      setLoading(false);
    }
  };

  const markAsRead = async (notificationId: string) => {
    try {
      const { error } = await supabase
        .from('user_notifications')
        .upsert({
          user_id: user?.id,
          notification_id: notificationId,
          read: true,
          read_at: new Date().toISOString()
        });

      if (error) throw error;

      setNotifications(notifications.map(n => 
        n.id === notificationId ? { ...n, read: true } : n
      ));
    } catch (error: any) {
      console.error('Error marking notification as read:', error);
      setError(error.message);
    }
  };

  const getNotificationStyles = (type: string) => {
    switch (type) {
      case 'error':
        return 'bg-red-50 border-red-100';
      case 'warning':
        return 'bg-yellow-50 border-yellow-100';
      case 'success':
        return 'bg-green-50 border-green-100';
      default:
        return 'bg-blue-50 border-blue-100';
    }
  };

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="bg-white rounded-lg shadow p-6">
          <div className="animate-pulse space-y-4">
            <div className="h-4 bg-gray-200 rounded w-1/4"></div>
            <div className="space-y-3">
              <div className="h-20 bg-gray-200 rounded"></div>
              <div className="h-20 bg-gray-200 rounded"></div>
              <div className="h-20 bg-gray-200 rounded"></div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <div className="bg-white rounded-lg shadow">
        <div className="p-6">
          <h2 className="text-3xl font-bold text-gray-900 mb-6">Notificações</h2>

          {error && (
            <div className="mb-4 p-4 text-red-700 bg-red-100 rounded-md">{error}</div>
          )}

          <div className="space-y-4">
            {notifications.length === 0 ? (
              <p className="text-center text-gray-500 py-4">
                {t('notifications.empty')}
              </p>
            ) : (
              notifications.map((notification) => (
                <div
                  key={notification.id}
                  className={`p-4 rounded-lg border ${getNotificationStyles(notification.type)} ${
                    !notification.read ? 'border-l-4' : ''
                  }`}
                  onClick={() => !notification.read && markAsRead(notification.id)}
                >
                  <div className="flex justify-between items-start">
                    <h4 className="text-sm font-medium text-gray-900">
                      {notification.title}
                    </h4>
                    <span className="text-xs text-gray-500">
                      {format(new Date(notification.created_at), "dd/MM 'às' HH:mm", { locale: ptBR })}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-gray-600">{notification.message}</p>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Notifications;