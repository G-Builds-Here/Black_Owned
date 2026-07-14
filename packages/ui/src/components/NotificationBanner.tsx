import React from 'react';

export type NotificationType = 'info' | 'success' | 'warning' | 'error';

export interface NotificationBannerProps {
  message: string;
  type?: NotificationType;
  onClose?: () => void;
  dismissible?: boolean;
}

export const NotificationBanner: React.FC<NotificationBannerProps> = ({
  message,
  type = 'info',
  onClose,
  dismissible = true,
}) => {
  return (
    <div className={`notification-banner ${type}`} role="alert">
      <span className="notification-message">{message}</span>
      {dismissible && onClose && (
        <button className="notification-close" onClick={onClose} aria-label="Close">
          ×
        </button>
      )}
    </div>
  );
};

export default NotificationBanner;
