'use client';

import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { Toast, ToastProvider, useToast } from './Toast';

describe('Toast', () => {
  it('renders toast message', () => {
    render(<Toast message="Test message" variant="success" isVisible={true} onClose={jest.fn()} />);
    expect(screen.getByText(/test message/i)).toBeInTheDocument();
  });

  it('renders with success variant', () => {
    const { container } = render(
      <Toast message="Success" variant="success" isVisible={true} onClose={jest.fn()} />
    );
    const toast = container.querySelector('[data-testid="toast"]');
    expect(toast).toHaveClass('bg-green-500');
  });

  it('renders with error variant', () => {
    const { container } = render(
      <Toast message="Error" variant="error" isVisible={true} onClose={jest.fn()} />
    );
    const toast = container.querySelector('[data-testid="toast"]');
    expect(toast).toHaveClass('bg-red-500');
  });

  it('renders with warning variant', () => {
    const { container } = render(
      <Toast message="Warning" variant="warning" isVisible={true} onClose={jest.fn()} />
    );
    const toast = container.querySelector('[data-testid="toast"]');
    expect(toast).toHaveClass('bg-heritage-amber');
  });

  it('renders with default variant', () => {
    const { container } = render(
      <Toast message="Info" variant="default" isVisible={true} onClose={jest.fn()} />
    );
    const toast = container.querySelector('[data-testid="toast"]');
    expect(toast).toHaveClass('bg-neutral-800');
  });

  it('calls onClose when close button is clicked', () => {
    const handleClose = jest.fn();
    render(
      <Toast message="Test" variant="success" isVisible={true} onClose={handleClose} />
    );
    fireEvent.click(screen.getByLabelText(/close/i));
    expect(handleClose).toHaveBeenCalledTimes(1);
  });

  it('has icon for success variant', () => {
    render(<Toast message="Success" variant="success" isVisible={true} onClose={jest.fn()} />);
    expect(screen.getByText(/✓/i)).toBeInTheDocument();
  });

  it('has icon for error variant', () => {
    render(<Toast message="Error" variant="error" isVisible={true} onClose={jest.fn()} />);
    expect(screen.getByText(/×/i)).toBeInTheDocument();
  });

  it('has icon for warning variant', () => {
    render(<Toast message="Warning" variant="warning" isVisible={true} onClose={jest.fn()} />);
    expect(screen.getByText(/!/i)).toBeInTheDocument();
  });

  it('has rounded corners', () => {
    const { container } = render(
      <Toast message="Test" variant="success" isVisible={true} onClose={jest.fn()} />
    );
    const toast = container.querySelector('[data-testid="toast"]');
    expect(toast).toHaveClass('rounded-lg');
  });

  it('has shadow', () => {
    const { container } = render(
      <Toast message="Test" variant="success" isVisible={true} onClose={jest.fn()} />
    );
    const toast = container.querySelector('[data-testid="toast"]');
    expect(toast).toHaveClass('shadow-lg');
  });

  it('has padding', () => {
    const { container } = render(
      <Toast message="Test" variant="success" isVisible={true} onClose={jest.fn()} />
    );
    const toast = container.querySelector('[data-testid="toast"]');
    expect(toast).toHaveClass('px-4');
    expect(toast).toHaveClass('py-3');
  });

  it('has flex layout', () => {
    const { container } = render(
      <Toast message="Test" variant="success" isVisible={true} onClose={jest.fn()} />
    );
    const toast = container.querySelector('[data-testid="toast"]');
    expect(toast).toHaveClass('flex');
    expect(toast).toHaveClass('items-center');
    expect(toast).toHaveClass('gap-3');
  });

  it('has white text', () => {
    const { container } = render(
      <Toast message="Test" variant="success" isVisible={true} onClose={jest.fn()} />
    );
    const toast = container.querySelector('[data-testid="toast"]');
    expect(toast).toHaveClass('text-white');
  });

  it('has max width', () => {
    const { container } = render(
      <Toast message="Test" variant="success" isVisible={true} onClose={jest.fn()} />
    );
    const toast = container.querySelector('[data-testid="toast"]');
    expect(toast).toHaveClass('max-w-sm');
  });

  it('has transition animation', () => {
    const { container } = render(
      <Toast message="Test" variant="success" isVisible={true} onClose={jest.fn()} />
    );
    const toast = container.querySelector('[data-testid="toast"]');
    expect(toast).toHaveClass('transition-all');
    expect(toast).toHaveClass('duration-300');
  });

  it('has z-index for stacking', () => {
    const { container } = render(
      <Toast message="Test" variant="success" isVisible={true} onClose={jest.fn()} />
    );
    const toast = container.querySelector('[data-testid="toast"]');
    expect(toast).toHaveClass('z-50');
  });

  it('does not render when isVisible is false', () => {
    render(<Toast message="Test" variant="success" isVisible={false} onClose={jest.fn()} />);
    expect(screen.queryByText(/test message/i)).not.toBeInTheDocument();
  });

  it('has close button with aria-label', () => {
    render(<Toast message="Test" variant="success" isVisible={true} onClose={jest.fn()} />);
    expect(screen.getByLabelText(/close/i)).toBeInTheDocument();
  });
});

describe('ToastProvider', () => {
  it('provides toast context', () => {
    const TestComponent = () => {
      const { addToast } = useToast();
      return (
        <button onClick={() => addToast('Test', { variant: 'success' })}>
          Show Toast
        </button>
      );
    };

    render(
      <ToastProvider>
        <TestComponent />
      </ToastProvider>
    );

    fireEvent.click(screen.getByText(/show toast/i));
    expect(screen.getByText(/test/i)).toBeInTheDocument();
  });

  it('renders toast container', () => {
    render(
      <ToastProvider>
        <div>Content</div>
      </ToastProvider>
    );
    expect(screen.getByText(/content/i)).toBeInTheDocument();
  });

  it('has fixed positioning for toast container', () => {
    const { container } = render(
      <ToastProvider>
        <div>Content</div>
      </ToastProvider>
    );
    const toastContainer = container.querySelector('[data-testid="toast-container"]');
    expect(toastContainer).toHaveClass('fixed');
    expect(toastContainer).toHaveClass('top-4');
    expect(toastContainer).toHaveClass('right-4');
  });

  it('has z-index for toast container', () => {
    const { container } = render(
      <ToastProvider>
        <div>Content</div>
      </ToastProvider>
    );
    const toastContainer = container.querySelector('[data-testid="toast-container"]');
    expect(toastContainer).toHaveClass('z-50');
  });

  it('has flex column layout for toast container', () => {
    const { container } = render(
      <ToastProvider>
        <div>Content</div>
      </ToastProvider>
    );
    const toastContainer = container.querySelector('[data-testid="toast-container"]');
    expect(toastContainer).toHaveClass('flex');
    expect(toastContainer).toHaveClass('flex-col');
    expect(toastContainer).toHaveClass('gap-2');
  });
});

describe('useToast', () => {
  it('adds toast with message', () => {
    const TestComponent = () => {
      const { addToast } = useToast();
      React.useEffect(() => {
        addToast('Test Message', { variant: 'success' });
      }, [addToast]);
      return <div>Test</div>;
    };

    render(
      <ToastProvider>
        <TestComponent />
      </ToastProvider>
    );

    expect(screen.getByText(/test message/i)).toBeInTheDocument();
  });

  it('adds toast with custom options', () => {
    const TestComponent = () => {
      const { addToast } = useToast();
      React.useEffect(() => {
        addToast('Custom Toast', { variant: 'error', duration: 5000 });
      }, [addToast]);
      return <div>Test</div>;
    };

    render(
      <ToastProvider>
        <TestComponent />
      </ToastProvider>
    );

    expect(screen.getByText(/custom toast/i)).toBeInTheDocument();
  });

  it('removes toast when close is called', () => {
    const TestComponent = () => {
      const { addToast, removeToast } = useToast();
      const [toastId, setToastId] = React.useState<string | null>(null);

      React.useEffect(() => {
        const id = addToast('Test', { variant: 'success' });
        setToastId(id);
      }, [addToast]);

      const handleClose = () => {
        if (toastId) {
          removeToast(toastId);
        }
      };

      return (
        <div>
          <button onClick={handleClose}>Close Toast</button>
        </div>
      );
    };

    render(
      <ToastProvider>
        <TestComponent />
      </ToastProvider>
    );

    expect(screen.getByText(/test/i)).toBeInTheDocument();
    fireEvent.click(screen.getByText(/close toast/i));
    expect(screen.queryByText(/test/i)).not.toBeInTheDocument();
  });
});
