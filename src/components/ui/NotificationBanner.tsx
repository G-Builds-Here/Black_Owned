/**
 * Notification Banner Component
 * Provides toast-style notifications for the application
 */

import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';

export interface NotificationBannerData {
  title: string;
  message: string;
  variant?: 'success' | 'error' | 'warning' | 'info';
}

export interface NotificationBannerProps {
  data: NotificationBannerData;
  onClose: () => void;
}

const NotificationContext = createContext<{
  showNotification: (title: string, message: string, variant?: 'success' | 'error' | 'warning' | 'info') => void;
  hideNotification: () => void;
  notification: NotificationBannerData | null;
}>({
  showNotification: () => {},
  hideNotification: () => {},
  notification: null,
});

export function NotificationProvider({ children }: { children: ReactNode }) {
  const [notification, setNotification] = useState<NotificationBannerData | null>(null);

  const showNotification = useCallback((
    title: string,
    message: string,
    variant: 'success' | 'error' | 'warning' | 'info' = 'info'
  ) => {
    setNotification({ title, message, variant });
  }, []);

  const hideNotification = useCallback(() => {
    setNotification(null);
  }, []);

  return (
    <NotificationContext.Provider value={{ showNotification, hideNotification, notification }}>
      {children}
      {notification && (
        <div className="fixed top-4 right-4 z-50">
          <div
            className={`
              px-4 py-3 rounded-lg shadow-lg text-white
              ${notification.variant === 'success' ? 'bg-green-600' : ''}
              ${notification.variant === 'error' ? 'bg-red-600' : ''}
              ${notification.variant === 'warning' ? 'bg-yellow-600' : ''}
              ${notification.variant === 'info' ? 'bg-blue-600' : ''}
            `}
          >
            <div className="font-semibold">{notification.title}</div>
            <div className="text-sm">{notification.message}</div>
            <button onClick={hideNotification} className="mt-2 text-sm underline">
              Dismiss
            </button>
          </div>
        </div>
      )}
    </NotificationContext.Provider>
  );
}

export function useNotification() {
  return useContext(NotificationContext);
}

export function NotificationBanner({ data, onClose }: NotificationBannerProps) {
  return (
    <div className="fixed top-4 right-4 z-50">
      <div
        className={`
          px-4 py-3 rounded-lg shadow-lg text-white
          ${data.variant === 'success' ? 'bg-green-600' : ''}
          ${data.variant === 'error' ? 'bg-red-600' : ''}
          ${data.variant === 'warning' ? 'bg-yellow-600' : ''}
          ${data.variant === 'info' ? 'bg-blue-600' : ''}
        `}
      >
        <div className="font-semibold">{data.title}</div>
        <div className="text-sm">{data.message}</div>
        <button onClick={onClose} className="mt-2 text-sm underline">
          Dismiss
        </button>
      </div>
    </div>
  );
}

export default NotificationBanner;
