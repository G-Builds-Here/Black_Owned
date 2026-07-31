/**
 * Notification Banner Tests
 */

import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { renderHook } from '@testing-library/react';
import { NotificationBanner, NotificationProvider, useNotification } from './NotificationBanner';
import type { NotificationBannerData } from './NotificationBanner';

describe('NotificationBanner', () => {
  const mockNotification: NotificationBannerData = {
    id: 'test-notif-1',
    businessName: 'Cozy Corner Cafe',
    messagePreview: 'Hey! We just posted a new review for your business.',
    timestamp: new Date(),
  };

  const mockOnDismiss = jest.fn();
  const mockOnClick = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('renders the notification banner with correct content', () => {
    render(
      <NotificationBanner
        notification={mockNotification}
        onDismiss={mockOnDismiss}
        onClick={mockOnClick}
      />
    );

    expect(screen.getByText('New message from Cozy Corner Cafe')).toBeInTheDocument();
    expect(screen.getByText('Hey! We just posted a new review for your business.')).toBeInTheDocument();
  });

  it('displays the dismiss button', () => {
    render(
      <NotificationBanner
        notification={mockNotification}
        onDismiss={mockOnDismiss}
        onClick={mockOnClick}
      />
    );

    const dismissButton = screen.getByLabelText('Dismiss notification');
    expect(dismissButton).toBeInTheDocument();
  });

  it('calls onDismiss when dismiss button is clicked', () => {
    render(
      <NotificationBanner
        notification={mockNotification}
        onDismiss={mockOnDismiss}
        onClick={mockOnClick}
      />
    );

    const dismissButton = screen.getByLabelText('Dismiss notification');
    fireEvent.click(dismissButton);

    expect(mockOnDismiss).toHaveBeenCalledWith('test-notif-1');
  });

  it('calls onClick and dismisses when notification is clicked', () => {
    render(
      <NotificationBanner
        notification={mockNotification}
        onDismiss={mockOnDismiss}
        onClick={mockOnClick}
      />
    );

    const banner = screen.getByRole('alert');
    fireEvent.click(banner);

    expect(mockOnClick).toHaveBeenCalledWith(mockNotification);
    expect(mockOnDismiss).toHaveBeenCalledWith('test-notif-1');
  });

  it('auto-dismisses after 5 seconds', () => {
    const onDismissMock = jest.fn();
    render(
      <NotificationBanner
        notification={mockNotification}
        onDismiss={onDismissMock}
        onClick={mockOnClick}
        autoDismissDuration={5000}
      />
    );

    expect(screen.getByRole('alert')).toBeInTheDocument();

    // Fast-forward time and flush effects
    act(() => {
      jest.advanceTimersByTime(5000);
    });

    expect(onDismissMock).toHaveBeenCalledWith('test-notif-1');
  });

  it('does not auto-dismiss when duration is 0', () => {
    const onDismissMock = jest.fn();
    render(
      <NotificationBanner
        notification={mockNotification}
        onDismiss={onDismissMock}
        onClick={mockOnClick}
        autoDismissDuration={0}
      />
    );

    expect(screen.getByRole('alert')).toBeInTheDocument();

    // Fast-forward time
    act(() => {
      jest.advanceTimersByTime(10000);
    });

    expect(onDismissMock).not.toHaveBeenCalled();
  });

  it('stops timer when manually dismissed', () => {
    const onDismissMock = jest.fn();
    const { unmount } = render(
      <NotificationBanner
        notification={mockNotification}
        onDismiss={onDismissMock}
        onClick={mockOnClick}
        autoDismissDuration={5000}
      />
    );

    // Dismiss manually before timer expires
    const dismissButton = screen.getByLabelText('Dismiss notification');
    fireEvent.click(dismissButton);

    // Unmount the component to clean up the timer
    unmount();

    // Fast-forward past the auto-dismiss time
    act(() => {
      jest.advanceTimersByTime(5000);
    });

    // Should only be called once from manual dismiss
    expect(onDismissMock).toHaveBeenCalledTimes(1);
  });
});

describe('NotificationProvider', () => {
  const TestComponent = () => {
    const { showNotification, dismissNotification, clearNotifications } = useNotification();

    return (
      <div>
        <button onClick={() => showNotification('Test Business', 'Test message')}>
          Show Notification
        </button>
        <button onClick={() => dismissNotification('test-id')}>Dismiss</button>
        <button onClick={clearNotifications}>Clear All</button>
      </div>
    );
  };

  it('provides notification context to children', () => {
    const { getByText } = render(
      <NotificationProvider>
        <TestComponent />
      </NotificationProvider>
    );

    expect(getByText('Show Notification')).toBeInTheDocument();
    expect(getByText('Dismiss')).toBeInTheDocument();
    expect(getByText('Clear All')).toBeInTheDocument();
  });

  it('throws error when used outside of provider', () => {
    const TestWithoutProvider = () => {
      useNotification();
      return <div>Test</div>;
    };

    expect(() => render(<TestWithoutProvider />)).toThrow(
      'useNotification must be used within a NotificationProvider'
    );
  });
});

describe('useNotification hook', () => {
  it('returns the correct notification methods', () => {
    const { result } = renderHook(() => useNotification(), {
      wrapper: NotificationProvider,
    });

    expect(result.current.showNotification).toBeDefined();
    expect(result.current.dismissNotification).toBeDefined();
    expect(result.current.clearNotifications).toBeDefined();
  });
});

function TestHookComponent() {
  const { showNotification, dismissNotification, clearNotifications } = useNotification();
  return (
    <div>
      <span data-testid="has-show">{typeof showNotification === 'function'}</span>
      <span data-testid="has-dismiss">{typeof dismissNotification === 'function'}</span>
      <span data-testid="has-clear">{typeof clearNotifications === 'function'}</span>
    </div>
  );
}
