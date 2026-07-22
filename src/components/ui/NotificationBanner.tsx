'use client';

import React, { useEffect, useCallback, createContext, useContext, useState } from 'react';
import { createPortal } from 'react-dom';

/**
 * Notification banner data
 */
export interface NotificationBannerData {
  id: string;
  businessName: string;
  messagePreview: string;
  timestamp: Date;
}

/**
 * Notification banner props
 */
export interface NotificationBannerProps {
  /** Notification data */
  notification: NotificationBannerData;
  /** On dismiss handler */
  onDismiss: (id: string) => void;
  /** On click handler (navigate to chat) */
  onClick: (notification: NotificationBannerData) => void;
  /** Auto-dismiss duration in ms (default 5000) */
  autoDismissDuration?: number;
}

interface NotificationContextType {
  showNotification: (businessName: string, messagePreview: string) => string;
  dismissNotification: (id: string) => void;
  clearNotifications: () => void;
  setNotificationClickHandler: (handler: (notification: NotificationBannerData) => void) => void;
}

const NotificationContext = createContext<NotificationContextType | null>(null);

/**
 * Notification banner component
 * Slides in from top, auto-dismisses after 5 seconds, clickable to navigate to chat
 */
function NotificationBanner({
  notification,
  onDismiss,
  onClick,
  autoDismissDuration = 5000,
}: NotificationBannerProps) {
  const [isVisible, setIsVisible] = useState(true);
  const [isExiting, setIsExiting] = useState(false);
  const timerRef = React.useRef<NodeJS.Timeout | null>(null);

  const handleDismiss = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setIsExiting(true);
    onDismiss(notification.id);
    setTimeout(() => {
      setIsVisible(false);
    }, 300);
  }, [notification.id, onDismiss]);

  const handleClick = useCallback(() => {
    onClick(notification);
    handleDismiss();
  }, [notification, onClick, handleDismiss]);

  // Auto-dismiss timer
  useEffect(() => {
    if (autoDismissDuration <= 0) return;

    timerRef.current = setTimeout(() => {
      handleDismiss();
    }, autoDismissDuration);

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, [autoDismissDuration, handleDismiss]);

  if (!isVisible) return null;

  return (
    <div
      className={`
        fixed top-4 left-1/2 -translate-x-1/2 z-[9998]
        flex items-center gap-3 px-6 py-4 rounded-lg shadow-xl
        min-w-[320px] max-w-lg
        bg-gradient-to-r from-heritage-royal to-heritage-midnight text-white
        cursor-pointer
        transform transition-all duration-300
        ${isExiting ? 'opacity-0 -translate-y-2' : 'opacity-100 translate-y-0'}
        hover:shadow-2xl
      `}
      role="alert"
      onClick={handleClick}
      aria-live="polite"
    >
      {/* Message icon */}
      <span className="flex-shrink-0">
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
        </svg>
      </span>

      {/* Message content */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold">
          New message from {notification.businessName}
        </p>
        <p className="text-xs text-neutral-200 mt-0.5 truncate">
          {notification.messagePreview}
        </p>
      </div>

      {/* Dismiss button */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          handleDismiss();
        }}
        className="flex-shrink-0 opacity-70 hover:opacity-100 transition-opacity p-1"
        aria-label="Dismiss notification"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}

/**
 * Notification provider that manages notification queue
 */
function NotificationProvider({ children }: { children: React.ReactNode }) {
  const [notifications, setNotifications] = useState<NotificationBannerData[]>([]);
  const [onClickHandler, setOnClickHandler] = useState<(notification: NotificationBannerData) => void | null>(null);

  const showNotification = useCallback((businessName: string, messagePreview: string): string => {
    const id = `notif-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const notification: NotificationBannerData = {
      id,
      businessName,
      messagePreview,
      timestamp: new Date(),
    };
    setNotifications((prev) => [...prev, notification]);
    return id;
  }, []);

  const dismissNotification = useCallback((id: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  }, []);

  const clearNotifications = useCallback(() => {
    setNotifications([]);
  }, []);

  const setNotificationClickHandler = useCallback((handler: (notification: NotificationBannerData) => void) => {
    setOnClickHandler(handler);
  }, []);

  const handleNotificationClick = useCallback((notification: NotificationBannerData) => {
    if (onClickHandler) {
      onClickHandler(notification);
    }
  }, [onClickHandler]);

  return (
    <NotificationContext.Provider value={{ showNotification, dismissNotification, clearNotifications, setNotificationClickHandler }}>
      {children}
      {createPortal(
        <div className="fixed top-0 left-0 right-0 z-[9998] flex flex-col items-center gap-2 p-4">
          {notifications.map((notification) => (
            <NotificationBanner
              key={notification.id}
              notification={notification}
              onDismiss={dismissNotification}
              onClick={handleNotificationClick}
            />
          ))}
        </div>,
        document.body
      )}
    </NotificationContext.Provider>
  );
}

/**
 * Hook to use notification system
 */
function useNotification() {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error('useNotification must be used within a NotificationProvider');
  }
  return context;
}

export { NotificationBanner, NotificationProvider, useNotification };
