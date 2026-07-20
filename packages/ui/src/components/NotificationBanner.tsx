import React from 'react';
import styles from './NotificationBanner.module.css';

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
    <div className={`${styles.notificationBanner} ${styles[type]}`} role="alert">
      <span className={styles.notificationMessage}>{message}</span>
      {dismissible && onClose && (
        <button className={styles.notificationClose} onClick={onClose} aria-label="Close">
          ×
        </button>
      )}
    </div>
  );
};

export default NotificationBanner;
