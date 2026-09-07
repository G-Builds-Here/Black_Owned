'use client';

import React, { HTMLAttributes, forwardRef, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import Button from './Button';

export interface ModalProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  /** Whether the modal is open */
  isOpen: boolean;
  /** Close handler */
  onClose: () => void;
  /** Modal title */
  title?: React.ReactNode;
  /** Modal footer content */
  footer?: React.ReactNode;
  /** Size variant */
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'full';
  /** Close on backdrop click */
  closeOnBackdrop?: boolean;
  /** Close on escape key */
  closeOnEscape?: boolean;
  /** Center modal vertically */
  centered?: boolean;
  /** Disable scroll on body when open */
  disableScroll?: boolean;
}

const Modal = forwardRef<HTMLDivElement, ModalProps>(
  (
    {
      isOpen,
      onClose,
      title,
      footer,
      size = 'md',
      closeOnBackdrop = true,
      closeOnEscape = true,
      centered = false,
      disableScroll = true,
      children,
      className = '',
      ...props
    },
    ref
  ) => {
    const modalRef = useRef<HTMLDivElement>(null);
    const previousActiveElement = useRef<HTMLElement | null>(null);

    const sizeClasses = {
      sm: 'max-w-sm',
      md: 'max-w-md',
      lg: 'max-w-lg',
      xl: 'max-w-xl',
      full: 'max-w-[95vw]',
    };

    // Handle escape key
    useEffect(() => {
      if (!isOpen || !closeOnEscape) return;

      const handleEscape = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          onClose();
        }
      };

      document.addEventListener('keydown', handleEscape);
      return () => document.removeEventListener('keydown', handleEscape);
    }, [isOpen, closeOnEscape, onClose]);

    // Focus trap and body scroll lock
    useEffect(() => {
      if (!isOpen) return;

      previousActiveElement.current = document.activeElement as HTMLElement;

      if (disableScroll) {
        document.body.style.overflow = 'hidden';
      }

      // Focus modal on open
      setTimeout(() => {
        modalRef.current?.focus();
      }, 0);

      return () => {
        if (disableScroll) {
          document.body.style.overflow = '';
        }
        previousActiveElement.current?.focus();
      };
    }, [isOpen, disableScroll]);

    const handleBackdropClick = useCallback(
      (e: React.MouseEvent) => {
        if (closeOnBackdrop && e.target === e.currentTarget) {
          onClose();
        }
      },
      [closeOnBackdrop, onClose]
    );

    // Don't render if not open
    if (!isOpen) return null;

    const modalContent = (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center p-4"
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? 'modal-title' : undefined}
      >
        {/* Backdrop */}
        <div
          className="absolute inset-0 bg-black/50 backdrop-blur-sm transition-opacity"
          onClick={handleBackdropClick}
          aria-hidden="true"
        />

        {/* Modal */}
        <div
          ref={(node) => {
            modalRef.current = node;
            if (typeof ref === 'function') ref(node);
            else if (ref) ref.current = node;
          }}
          className={`
            relative bg-white rounded-2xl shadow-xl
            w-full ${sizeClasses[size]}
            transform transition-all
            ${centered ? '' : 'mt-4 mb-4'}
            max-h-[90vh]
            overflow-hidden
            ${className}
          `}
          tabIndex={-1}
          {...props}
        >
          {/* Header */}
          {title && (
            <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-200">
              <h2 id="modal-title" className="text-xl font-semibold text-neutral-900">
                {title}
              </h2>
              <Button
                variant="ghost"
                size="sm"
                onClick={onClose}
                aria-label="Close modal"
                className="p-2"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </Button>
            </div>
          )}

          {/* Body */}
          <div className="px-6 py-4 overflow-y-auto">{children}</div>

          {/* Footer */}
          {footer && (
            <div className="px-6 py-4 border-t border-neutral-200 bg-neutral-50 rounded-b-2xl">
              <div className="flex justify-end gap-3">{footer}</div>
            </div>
          )}
        </div>
      </div>
    );

    return createPortal(modalContent, document.body);
  }
);

Modal.displayName = 'Modal';

export default Modal;
