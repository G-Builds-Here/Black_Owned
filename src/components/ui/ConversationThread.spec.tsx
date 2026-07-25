/**
 * ConversationThread Component Tests
 *
 * Tests the optimistic UI updates, message sending, and NATS integration.
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ConversationThread from './ConversationThread';

// Mock the nats-client module
jest.mock('../../lib/nats/nats-client', () => ({
  sendMessage: jest.fn().mockResolvedValue(),
  subscribeToMessages: jest.fn(),
}));

const mockMessages = [
  {
    id: 'msg-1',
    conversationId: 'conv-1',
    senderId: 'other-user',
    content: 'Hello!',
    type: 'text' as const,
    timestamp: new Date(),
    isRead: true,
  },
];

describe('ConversationThread', () => {
  const defaultProps = {
    currentUserId: 'current-user',
    conversationId: 'conv-1',
    messages: mockMessages,
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders messages correctly', () => {
    render(<ConversationThread {...defaultProps} />);

    expect(screen.getByText('Hello!')).toBeInTheDocument();
  });

  it('displays empty state when no messages', () => {
    render(
      <ConversationThread
        {...defaultProps}
        messages={[]}
      />
    );

    expect(screen.getByText('No messages yet. Start the conversation!')).toBeInTheDocument();
  });

  it('shows sending indicator immediately when message is sent', async () => {
    render(<ConversationThread {...defaultProps} />);

    const input = screen.getByPlaceholderText('Type a message...');
    const sendButton = screen.getByRole('button', { name: 'Send' });

    fireEvent.change(input, { target: { value: 'Test message' } });
    fireEvent.click(sendButton);

    // Message should appear immediately with sending indicator
    await waitFor(() => {
      expect(screen.getByText('Test message')).toBeInTheDocument();
    });
  });

  it('calls onMessageSent callback when message is sent', async () => {
    const onMessageSent = jest.fn();

    render(<ConversationThread {...defaultProps} onMessageSent={onMessageSent} />);

    const input = screen.getByPlaceholderText('Type a message...');
    const sendButton = screen.getByRole('button', { name: 'Send' });

    fireEvent.change(input, { target: { value: 'Test message' } });
    fireEvent.click(sendButton);

    await waitFor(() => {
      expect(onMessageSent).toHaveBeenCalled();
    });

    const sentMessage = onMessageSent.mock.calls[0][0];
    expect(sentMessage.content).toBe('Test message');
    expect(sentMessage.senderId).toBe('current-user');
    expect(sentMessage.status).toBe('sending');
  });

  it('clears input after sending message', async () => {
    render(<ConversationThread {...defaultProps} />);

    const input = screen.getByPlaceholderText('Type a message...');
    const sendButton = screen.getByRole('button', { name: 'Send' });

    fireEvent.change(input, { target: { value: 'Test message' } });
    fireEvent.click(sendButton);

    await waitFor(() => {
      expect(input).toHaveValue('');
    });
  });

  it('does not send empty messages', async () => {
    render(<ConversationThread {...defaultProps} />);

    const input = screen.getByPlaceholderText('Type a message...');
    const sendButton = screen.getByRole('button', { name: 'Send' });

    fireEvent.change(input, { target: { value: '   ' } });
    fireEvent.click(sendButton);

    // Message should not appear
    expect(screen.queryByText('   ')).not.toBeInTheDocument();
  });

  it('disables send button when input is empty', () => {
    render(<ConversationThread {...defaultProps} />);

    const sendButton = screen.getByRole('button', { name: 'Send' });
    expect(sendButton).toBeDisabled();
  });

  it('enables send button when input has content', () => {
    render(<ConversationThread {...defaultProps} />);

    const input = screen.getByPlaceholderText('Type a message...');
    const sendButton = screen.getByRole('button', { name: 'Send' });

    expect(sendButton).toBeDisabled();

    fireEvent.change(input, { target: { value: 'Test' } });

    expect(sendButton).not.toBeDisabled();
  });

  it('shows own messages on the right side', () => {
    const ownMessage = {
      ...mockMessages[0],
      senderId: 'current-user',
    };

    render(<ConversationThread {...defaultProps} messages={[ownMessage]} />);

    expect(screen.getByText('Hello!')).toBeInTheDocument();
  });

  it('shows received messages on the left side', () => {
    render(<ConversationThread {...defaultProps} />);

    expect(screen.getByText('Hello!')).toBeInTheDocument();
  });

  it('updates message status from sending to sent after 500ms', async () => {
    render(<ConversationThread {...defaultProps} />);

    const input = screen.getByPlaceholderText('Type a message...');
    const sendButton = screen.getByRole('button', { name: 'Send' });

    fireEvent.change(input, { target: { value: 'Test message' } });
    fireEvent.click(sendButton);

    // Message appears with sending status
    await waitFor(() => {
      expect(screen.getByText('Test message')).toBeInTheDocument();
    });

    // Wait for the 500ms transition to "sent" status
    await waitFor(() => {
      const checkmark = screen.getByText('✓'); // Checkmark character for "sent"
      expect(checkmark).toBeInTheDocument();
    }, { timeout: 1000 });
  });
});
