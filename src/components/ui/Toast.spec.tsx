'use client';

import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { Toast, ToastProvider, useToast } from './Toast';

// Current component notes (source of truth: Toast.tsx):
// - No `isVisible` prop; visibility is internal state driven by `duration`
//   (auto-dismiss) and the 300ms exit animation before `onClose` fires.
// - The toast element carries role="alert"; variant colors use the heritage
//   theme (success = bg-heritage-jade, error = bg-heritage-crimson).
// - Icons are SVGs (no text glyphs); the z-index lives on the ToastProvider
//   container (z-[9999], portaled to document.body), not the toast itself.

const toastEl = (container: HTMLElement) =>
  container.querySelector('[role="alert"]') as HTMLElement;
const providerContainer = () =>
  Array.from(document.body.querySelectorAll('div')).find((d) =>
    d.className.includes('z-[9999]')
  ) as HTMLElement;

describe('Toast', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('renders toast message', () => {
    render(<Toast message="Test message" variant="success" duration={0} onClose={jest.fn()} />);
    expect(screen.getByText('Test message')).toBeInTheDocument();
  });

  it('renders with success variant', () => {
    const { container } = render(
      <Toast message="Success" variant="success" duration={0} onClose={jest.fn()} />
    );
    expect(toastEl(container)).toHaveClass('bg-heritage-jade');
  });

  it('renders with error variant', () => {
    const { container } = render(
      <Toast message="Error" variant="error" duration={0} onClose={jest.fn()} />
    );
    expect(toastEl(container)).toHaveClass('bg-heritage-crimson');
  });

  it('renders with warning variant', () => {
    const { container } = render(
      <Toast message="Warning" variant="warning" duration={0} onClose={jest.fn()} />
    );
    expect(toastEl(container)).toHaveClass('bg-heritage-amber');
  });

  it('renders with default variant', () => {
    const { container } = render(
      <Toast message="Info" variant="default" duration={0} onClose={jest.fn()} />
    );
    expect(toastEl(container)).toHaveClass('bg-neutral-800');
  });

  it('calls onClose when close button is clicked', async () => {
    jest.useFakeTimers();
    const handleClose = jest.fn();
    render(<Toast message="Test" variant="success" duration={0} onClose={handleClose} />);
    act(() => {
      fireEvent.click(screen.getByLabelText('Close notification'));
    });
    // onClose fires after the 300ms exit animation, not synchronously.
    act(() => {
      jest.advanceTimersByTime(300);
    });
    expect(handleClose).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('Test')).not.toBeInTheDocument();
  });

  it('auto-dismisses after duration and calls onClose', async () => {
    jest.useFakeTimers();
    const handleClose = jest.fn();
    render(<Toast message="Test" variant="success" duration={500} onClose={handleClose} />);
    expect(screen.getByText('Test')).toBeInTheDocument();
    act(() => {
      jest.advanceTimersByTime(500); // start exit
    });
    act(() => {
      jest.advanceTimersByTime(300); // finish exit
    });
    expect(screen.queryByText('Test')).not.toBeInTheDocument();
    expect(handleClose).toHaveBeenCalledTimes(1);
  });

  it('has icon for success variant', () => {
    const { container } = render(
      <Toast message="Success" variant="success" duration={0} onClose={jest.fn()} />
    );
    const icon = toastEl(container).querySelector('svg path');
    expect(icon).not.toBeNull();
    expect(icon.getAttribute('d')).toBe('M5 13l4 4L19 7');
  });

  it('has icon for error variant', () => {
    const { container } = render(
      <Toast message="Error" variant="error" duration={0} onClose={jest.fn()} />
    );
    const icon = toastEl(container).querySelector('svg path');
    expect(icon).not.toBeNull();
    expect(icon.getAttribute('d')).toBe('M6 18L18 6M6 6l12 12');
  });

  it('has icon for warning variant', () => {
    const { container } = render(
      <Toast message="Warning" variant="warning" duration={0} onClose={jest.fn()} />
    );
    const icon = toastEl(container).querySelector('svg path');
    expect(icon).not.toBeNull();
    expect(icon.getAttribute('d')).toContain('M12 9v2');
  });

  it('has rounded corners', () => {
    const { container } = render(
      <Toast message="Test" variant="success" duration={0} onClose={jest.fn()} />
    );
    expect(toastEl(container)).toHaveClass('rounded-lg');
  });

  it('has shadow', () => {
    const { container } = render(
      <Toast message="Test" variant="success" duration={0} onClose={jest.fn()} />
    );
    expect(toastEl(container)).toHaveClass('shadow-lg');
  });

  it('has padding', () => {
    const { container } = render(
      <Toast message="Test" variant="success" duration={0} onClose={jest.fn()} />
    );
    expect(toastEl(container)).toHaveClass('px-4');
    expect(toastEl(container)).toHaveClass('py-3');
  });

  it('has flex layout', () => {
    const { container } = render(
      <Toast message="Test" variant="success" duration={0} onClose={jest.fn()} />
    );
    const toast = toastEl(container);
    expect(toast).toHaveClass('flex');
    expect(toast).toHaveClass('items-center');
    expect(toast).toHaveClass('gap-3');
  });

  it('has white text', () => {
    const { container } = render(
      <Toast message="Test" variant="success" duration={0} onClose={jest.fn()} />
    );
    expect(toastEl(container)).toHaveClass('text-white');
  });

  it('has max width', () => {
    const { container } = render(
      <Toast message="Test" variant="success" duration={0} onClose={jest.fn()} />
    );
    expect(toastEl(container)).toHaveClass('max-w-md');
  });

  it('has transition animation', () => {
    const { container } = render(
      <Toast message="Test" variant="success" duration={0} onClose={jest.fn()} />
    );
    const toast = toastEl(container);
    expect(toast).toHaveClass('transition-all');
    expect(toast).toHaveClass('duration-300');
  });

  it('has close button with aria-label', () => {
    render(<Toast message="Test" variant="success" duration={0} onClose={jest.fn()} />);
    expect(screen.getByLabelText('Close notification')).toBeInTheDocument();
  });

  it('omits close button when showClose is false', () => {
    render(<Toast message="Test" variant="success" duration={0} showClose={false} />);
    expect(screen.queryByLabelText('Close notification')).not.toBeInTheDocument();
  });
});

describe('ToastProvider', () => {
  it('provides toast context', () => {
    const TestComponent = () => {
      const { addToast } = useToast();
      return (
        <button onClick={() => addToast('Test', { variant: 'success', duration: 0 })}>
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
    expect(screen.getByText('Test')).toBeInTheDocument();
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
    render(
      <ToastProvider>
        <div>Content</div>
      </ToastProvider>
    );
    const toastContainer = providerContainer();
    expect(toastContainer).toHaveClass('fixed');
    expect(toastContainer).toHaveClass('top-4');
    expect(toastContainer).toHaveClass('right-4');
  });

  it('has z-index for toast container', () => {
    render(
      <ToastProvider>
        <div>Content</div>
      </ToastProvider>
    );
    expect(providerContainer()).toHaveClass('z-[9999]');
  });

  it('has flex column layout for toast container', () => {
    render(
      <ToastProvider>
        <div>Content</div>
      </ToastProvider>
    );
    const toastContainer = providerContainer();
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
        addToast('Test Message', { variant: 'success', duration: 0 });
      }, [addToast]);
      return <div>Show</div>;
    };

    render(
      <ToastProvider>
        <TestComponent />
      </ToastProvider>
    );

    expect(screen.getByText('Test Message')).toBeInTheDocument();
  });

  it('adds toast with custom options', () => {
    const TestComponent = () => {
      const { addToast } = useToast();
      React.useEffect(() => {
        addToast('Custom Toast', { variant: 'error', duration: 0 });
      }, [addToast]);
      return <div>Show</div>;
    };

    render(
      <ToastProvider>
        <TestComponent />
      </ToastProvider>
    );

    expect(screen.getByText('Custom Toast')).toBeInTheDocument();
  });

  it('removes toast when close is called', () => {
    const TestComponent = () => {
      const { addToast, removeToast } = useToast();
      const [toastId, setToastId] = React.useState<string | null>(null);

      React.useEffect(() => {
        const id = addToast('Test', { variant: 'success', duration: 0 });
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

    expect(screen.getByText('Test')).toBeInTheDocument();
    fireEvent.click(screen.getByText(/close toast/i));
    expect(screen.queryByText('Test')).not.toBeInTheDocument();
  });
});
