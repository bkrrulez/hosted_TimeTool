
'use client';

import * as React from 'react';
import { type AppNotification } from '@/lib/types';
import { getNotifications, addNotification as addNotificationAction, markNotificationAsRead } from '../actions';

type NotificationInput = Omit<AppNotification, 'id' | 'timestamp' | 'readBy'>;

interface NotificationsContextType {
  notifications: AppNotification[];
  addNotification: (notification: NotificationInput) => Promise<void>;
  markAsRead: (notificationId: string, userId: string) => Promise<void>;
  markAllAsRead: (userId: string) => Promise<void>;
  fetchNotifications: () => Promise<void>;
}

const NotificationsContext = React.createContext<NotificationsContextType | undefined>(undefined);

export function NotificationsProvider({ children }: { children: React.ReactNode }) {
  const [notifications, setNotifications] = React.useState<AppNotification[]>([]);

  const fetchNotifications = React.useCallback(async () => {
    const notifs = await getNotifications();
    setNotifications(notifs);
  }, []);

  React.useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  const addNotification = async (notification: NotificationInput) => {
    const newNotification = await addNotificationAction(notification);
    if (newNotification) {
      setNotifications(prev => [newNotification, ...prev]);
    }
  };

  const markAsRead = async (notificationId: string, userId: string) => {
    await markNotificationAsRead(notificationId, userId);
    setNotifications(prev => prev.map(notif => {
      if (notif.id === notificationId && !notif.readBy.includes(userId)) {
        return { ...notif, readBy: [...notif.readBy, userId] };
      }
      return notif;
    }));
  };

  const markAllAsRead = async (userId: string) => {
    // This action could be optimized on the backend, but for now we'll do it one by one
    const userNotifications = notifications.filter(n => n.recipientIds.includes(userId) && !n.readBy.includes(userId));
    for (const notif of userNotifications) {
      await markNotificationAsRead(notif.id, userId);
    }
    fetchNotifications(); // Re-fetch to be sure
  };

  return (
    <NotificationsContext.Provider value={{ notifications, addNotification, markAsRead, markAllAsRead, fetchNotifications }}>
      {children}
    </NotificationsContext.Provider>
  );
}

export const useNotifications = () => {
  const context = React.useContext(NotificationsContext);
  if (!context) {
    throw new Error('useNotifications must be used within a NotificationsProvider');
  }
  return context;
};
