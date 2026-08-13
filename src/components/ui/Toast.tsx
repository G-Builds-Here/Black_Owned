'use client';

import React, { HTMLAttributes, forwardRef, useEffect, useState, useCallback, createContext, useContext } from 'react';
import { createPortal } from 'react-dom';

export type ToastVariant = 'default' | 'success' | 'error' | 'warning' | 'info';
export type ToastPosition = 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left' | 'top-center' | 'bottom-center';

export interface ToastProps extends HTMLAttributes<HTMLDivElement> {
  /** Toast message */
  message: string;
  /** Toast variant */
  variant?: ToastVariant;
  /** Auto-dismiss duration in ms (0 = no auto-dismiss) */
  duration?: number;
  /** On close handler */
  onClose?: () => void;
  /** Show close button */
  showClose?: boolean;
  /** Toast ID for tracking */
  id?: string;
}

interface ToastContextType {
  addToast: (message: string, options?: Omit<ToastProps, 'message' | 'onClose'>) => string;
  removeToast: (id: string) => void;
  clearToasts: () => void;
}

const ToastContext = createContext<ToastContextType | null>(null);

const variantStyles: Record<ToastVariant, string> = {
  default: 'bg-neutral-800 text-white',
  success: 'bg-heritage-jade text-white',
  error: 'bg-heritage-crimson text-white',
  warning: 'bg-heritage-amber text-neutral-900',
  info: 'bg-heritage-royal text-white',
};

const positionStyles: Record<ToastPosition, string> = {
  'top-right': 'top-4 right-4',
  'top-left': 'top-4 left-4',
  'bottom-right': 'bottom-4 right-4',
  'bottom-left': 'bottom-4 left-4',
  'top-center': 'top-4 left-1/2 -translate-x-1/2',
  'bottom-center': 'bottom-4 left-1/2 -translate-x-1/2',
};

const Toast = forwardRef<HTMLDivElement, ToastProps>(
  (
    {
      message,
      variant = 'default',
      duration = 5000,
      onClose,
      showClose = true,
      id,
      className = '',
      ...props
    },
    ref
  ) => {
    const [isVisible, setIsVisible] = useState(true);
    const [isExiting, setIsExiting] = useState(false);

    useEffect(() => {
      if (duration <= 0) return;

      const timer = setTimeout(() => {
        handleClose();
      }, duration);

      return () => clearTimeout(timer);
    }, [duration]);

    const handleClose = useCallback(() => {
      setIsExiting(true);
      setTimeout(() => {
        setIsVisible(false);
        onClose?.();
      }, 300);
    }, [onClose]);

    if (!isVisible) return null;

    return (
      <div
        ref={ref}
        className={`
          flex items-center gap-3 px-4 py-3 rounded-lg shadow-lg
          min-w-[300px] max-w-md
          transform transition-all duration-300
          ${variantStyles[variant]}
          ${isExiting ? 'opacity-0 translate-y-2' : 'opacity-100 translate-y-0'}
          ${className}
        `}
        role="alert"
        {...props}
      >
        {/* Icon */}
        <span className="flex-shrink-0">
          {variant === 'success' && (
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          )}
          {variant === 'error' && (
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          )}
          {variant === 'warning' && (
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          )}
          {variant === 'info' && (
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          )}
        </span>

        {/* Message */}
        <span className="flex-1 text-sm font-medium">{message}</span>

        {/* Close button */}
        {showClose && (
          <button
            onClick={handleClose}
            className="flex-shrink-0 opacity-70 hover:opacity-100 transition-opacity"
            aria-label="Close notification"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>
    );
  }
);

Toast.displayName = 'Toast';

// Toast Provider and Hook
interface ToastProviderProps {
  children: React.ReactNode;
  position?: ToastPosition;
}

function ToastProvider({ children, position = 'top-right' }: ToastProviderProps) {
  const [toasts, setToasts] = useState<Array<ToastProps & { id: string }>>([]);

  const addToast = useCallback((message: string, options?: Omit<ToastProps, 'message' | 'onClose'>) => {
    const id = Math.random().toString(36).substr(2, 9);
    setToasts((prev) => [...prev, { message, id, ...options }]);
    return id;
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const clearToasts = useCallback(() => {
    setToasts([]);
  }, []);

  return (
    <ToastContext.Provider value={{ addToast, removeToast, clearToasts }}>
      {children}
      {typeof document !== 'undefined' && createPortal(
        <div className={`fixed z-[9999] flex flex-col gap-2 ${positionStyles[position]}`}>
          {toasts.map((toast) => (
            <Toast key={toast.id} {...toast} onClose={() => { if (toast.id) removeToast(toast.id); }} />
          ))}
        </div>,
        document.body
      )}
    </ToastContext.Provider>
  );
}

function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
}

export { Toast, ToastProvider, useToast };
