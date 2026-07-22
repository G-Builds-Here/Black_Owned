import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ConversationThread from './ConversationThread';
import type { Message } from '../../types/message';

describe('ConversationThread', () => {
  const mockMessages: Message[] = [
    {
      id: 'msg-1',
      conversationId: 'conv-1',
      senderId: 'user-2',
      content: 'Hello!',
      type: 'text',
      timestamp: new Date('2026-07-21T10:00:00Z'),
      isRead: false,
      status: 'sent',
    },
    {
      id: 'msg-2',
      conversationId: 'conv-1',
      senderId: 'current-user',
      content: 'Hi there!',
      type: 'text',
      timestamp: new Date('2026-07-21T10:01:00Z'),
      isRead: true,
      status: 'sent',
    },
  ];

  const defaultProps = {
    messages: mockMessages,
    currentUserId: 'current-user',
  };

  it('renders empty state when no messages', () => {
    render(<ConversationThread {...defaultProps} messages={[]} />);
    expect(screen.getByText(/No messages yet/)).toBeInTheDocument();
  });

  it('displays messages from other users on the left', () => {
    render(<ConversationThread {...defaultProps} />);
    expect(screen.getByText('Hello!')).toBeInTheDocument();
  });

  it('displays own messages on the right', () => {
    render(<ConversationThread {...defaultProps} />);
    expect(screen.getByText('Hi there!')).toBeInTheDocument();
  });

  it('shows sending indicator for messages with sending status', () => {
    const sendingMessage: Message = {
      ...mockMessages[0],
      status: 'sending',
    };
    render(<ConversationThread {...defaultProps} messages={[sendingMessage]} />);
    expect(screen.getByText(/sending\.\.\./)).toBeInTheDocument();
  });

  it('shows failed indicator for messages with failed status', () => {
    const failedMessage: Message = {
      ...mockMessages[0],
      status: 'failed',
    };
    render(<ConversationThread {...defaultProps} messages={[failedMessage]} />);
    expect(screen.getByText(/failed/)).toBeInTheDocument();
  });

  it('shows sent checkmark for messages with sent status', () => {
    render(<ConversationThread {...defaultProps} />);
    expect(screen.getByText('✓')).toBeInTheDocument();
  });

  it('displays message timestamp', () => {
    render(<ConversationThread {...defaultProps} />);
    expect(screen.getByText('10:00 AM')).toBeInTheDocument();
  });

  it('shows error banner when errorMessage is provided', () => {
    render(
      <ConversationThread
        {...defaultProps}
        errorMessage="Failed to send message"
      />
    );
    expect(screen.getByText(/Failed to send message/)).toBeInTheDocument();
  });

  it('displays input field for new messages', () => {
    render(<ConversationThread {...defaultProps} />);
    const input = screen.getByPlaceholderText(/Type a message/);
    expect(input).toBeInTheDocument();
  });

  it('disables input when isSending is true', () => {
    render(<ConversationThread {...defaultProps} isSending={true} />);
    const input = screen.getByPlaceholderText(/Type a message/);
    expect(input).toBeDisabled();
  });

  it('calls onSendMessage when form is submitted', () => {
    const mockOnSendMessage = jest.fn();
    render(
      <ConversationThread
        {...defaultProps}
        onSendMessage={mockOnSendMessage}
      />
    );

    const input = screen.getByPlaceholderText(/Type a message/);
    const sendButton = screen.getByText('Send');

    fireEvent.change(input, { target: { value: 'Test message' } });
    fireEvent.click(sendButton);

    expect(mockOnSendMessage).toHaveBeenCalledWith('Test message');
  });

  it('clears input after sending message', () => {
    const mockOnSendMessage = jest.fn();
    render(
      <ConversationThread
        {...defaultProps}
        onSendMessage={mockOnSendMessage}
      />
    );

    const input = screen.getByPlaceholderText(/Type a message/);
    const sendButton = screen.getByText('Send');

    fireEvent.change(input, { target: { value: 'Test message' } });
    fireEvent.click(sendButton);

    expect(input).toHaveValue('');
  });

  it('does not send empty messages', () => {
    const mockOnSendMessage = jest.fn();
    render(
      <ConversationThread
        {...defaultProps}
        onSendMessage={mockOnSendMessage}
      />
    );

    const input = screen.getByPlaceholderText(/Type a message/);
    const sendButton = screen.getByText('Send');

    fireEvent.change(input, { target: { value: '   ' } });
    fireEvent.click(sendButton);

    expect(mockOnSendMessage).not.toHaveBeenCalled();
  });

  it('disables send button when input is empty', () => {
    render(<ConversationThread {...defaultProps} />);
    const sendButton = screen.getByText('Send');
    expect(sendButton).toBeDisabled();
  });

  it('enables send button when input has content', () => {
    render(<ConversationThread {...defaultProps} />);
    const input = screen.getByPlaceholderText(/Type a message/);
    const sendButton = screen.getByText('Send');

    fireEvent.change(input, { target: { value: 'Test' } });
    expect(sendButton).not.toBeDisabled();
  });

  it('shows sending text on button when isSending is true', () => {
    render(<ConversationThread {...defaultProps} isSending={true} />);
    expect(screen.getByText('Sending...')).toBeInTheDocument();
  });
});
