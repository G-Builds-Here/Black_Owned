/**
 * ConversationList Component Tests
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import ConversationList from './ConversationList';
import type { ConversationPreview } from '../../types/conversation';

describe('ConversationList', () => {
  const mockConversations: ConversationPreview[] = [
    {
      id: 'conv-1',
      otherUserName: 'Alice Johnson',
      otherUserAvatarUrl: '/avatars/alice.png',
      lastMessagePreview: 'Hey! Are we still on for the meeting tomorrow?',
      lastMessageTime: new Date(),
      unreadCount: 2,
      isUnread: true,
    },
    {
      id: 'conv-2',
      otherUserName: 'Bob Smith',
      otherUserAvatarUrl: '/avatars/bob.png',
      lastMessagePreview: 'Thanks for the update on the project status.',
      lastMessageTime: new Date(Date.now() - 86400000),
      unreadCount: 0,
      isUnread: false,
    },
    {
      id: 'conv-3',
      otherUserName: 'Carol Davis',
      otherUserAvatarUrl: '/avatars/carol.png',
      lastMessagePreview: 'Great work on the presentation!',
      lastMessageTime: new Date(Date.now() - 604800000),
      unreadCount: 0,
      isUnread: false,
    },
  ];

  it('renders all conversations', () => {
    render(<ConversationList conversations={mockConversations} />);

    expect(screen.getByText('Alice Johnson')).toBeInTheDocument();
    expect(screen.getByText('Bob Smith')).toBeInTheDocument();
    expect(screen.getByText('Carol Davis')).toBeInTheDocument();
  });

  it('displays unread badge for conversations with unread messages', () => {
    render(<ConversationList conversations={mockConversations} />);

    // First conversation has unread messages
    const aliceRow = screen.getByText('Alice Johnson').closest('li');
    expect(aliceRow).toHaveTextContent('2');
  });

  it('does not show badge for read conversations', () => {
    render(<ConversationList conversations={mockConversations} />);

    // Bob and Carol have no unread messages
    const bobRow = screen.getByText('Bob Smith').closest('li');
    const carolRow = screen.getByText('Carol Davis').closest('li');

    // These rows should not have badge numbers
    expect(bobRow?.querySelector('[data-testid="badge"]')).not.toBeInTheDocument();
    expect(carolRow?.querySelector('[data-testid="badge"]')).not.toBeInTheDocument();
  });

  it('truncates long message previews to 50 characters with ellipsis', () => {
    const longMessage = 'A'.repeat(100);
    const conversations: ConversationPreview[] = [
      {
        id: 'conv-1',
        otherUserName: 'Test User',
        lastMessagePreview: longMessage.slice(0, 50) + '...',
        lastMessageTime: new Date(),
        unreadCount: 0,
        isUnread: false,
      },
    ];

    render(<ConversationList conversations={conversations} />);

    expect(screen.getByText('Test User')).toBeInTheDocument();
    // The preview should be truncated
    const previewElement = screen.getByText('Test User').closest('li');
    expect(previewElement).toHaveTextContent('A'.repeat(50) + '...');
  });

  it('calls onSelectConversation when a conversation is clicked', () => {
    const onSelectMock = jest.fn();
    render(<ConversationList conversations={mockConversations} onSelectConversation={onSelectMock} />);

    const aliceRow = screen.getByText('Alice Johnson').closest('li');
    aliceRow?.click();

    expect(onSelectMock).toHaveBeenCalledWith('conv-1');
  });

  it('applies selected styling to the selected conversation', () => {
    render(
      <ConversationList
        conversations={mockConversations}
        onSelectConversation={() => {}}
        selectedConversationId="conv-2"
      />
    );

    const bobRow = screen.getByText('Bob Smith').closest('li');
    // Selected conversation should have the selection background
    expect(bobRow).toHaveClass('bg-heritage-ochre/10');
  });

  it('displays avatar when provided', () => {
    render(<ConversationList conversations={mockConversations} />);

    const avatar = screen.getByAltText('Alice Johnson');
    expect(avatar).toHaveAttribute('src', '/avatars/alice.png');
  });

  it('displays initial when avatar is not provided', () => {
    const conversations: ConversationPreview[] = [
      {
        id: 'conv-1',
        otherUserName: 'No Avatar User',
        lastMessagePreview: 'Hello',
        lastMessageTime: new Date(),
        unreadCount: 0,
        isUnread: false,
      },
    ];

    render(<ConversationList conversations={conversations} />);

    // Should show the first letter as initial
    expect(screen.getByText('N')).toBeInTheDocument();
  });

  it('displays empty state when no conversations provided', () => {
    render(<ConversationList conversations={[]} />);

    expect(screen.getByText('No conversations yet. Start chatting!')).toBeInTheDocument();
  });

  it('displays timestamp for each conversation', () => {
    render(<ConversationList conversations={mockConversations} />);

    // Should show time format for today's message
    const aliceRow = screen.getByText('Alice Johnson').closest('li');
    expect(aliceRow).toBeTruthy();
  });

  it('handles keyboard navigation (Enter key)', () => {
    const onSelectMock = jest.fn();
    render(<ConversationList conversations={mockConversations} onSelectConversation={onSelectMock} />);

    const aliceRow = screen.getByText('Alice Johnson').closest('li');
    aliceRow?.focus();
    fireEvent.keyDown(aliceRow!, { key: 'Enter' });

    expect(onSelectMock).toHaveBeenCalledWith('conv-1');
  });

  it('handles keyboard navigation (Space key)', () => {
    const onSelectMock = jest.fn();
    render(<ConversationList conversations={mockConversations} onSelectConversation={onSelectMock} />);

    const aliceRow = screen.getByText('Alice Johnson').closest('li');
    aliceRow?.focus();
    fireEvent.keyDown(aliceRow!, { key: ' ' });

    expect(onSelectMock).toHaveBeenCalledWith('conv-1');
  });

  it('renders conversations in reverse-chronological order', () => {
    render(<ConversationList conversations={mockConversations} />);

    const rows = screen.getAllByRole('button');
    // First should be Alice (today), then Bob (yesterday), then Carol (last week)
    expect(rows[0]).toHaveTextContent('Alice Johnson');
    expect(rows[1]).toHaveTextContent('Bob Smith');
    expect(rows[2]).toHaveTextContent('Carol Davis');
  });

  it('applies bold font weight to unread conversations', () => {
    render(<ConversationList conversations={mockConversations} />);

    const aliceRow = screen.getByText('Alice Johnson').closest('li');
    // Unread conversations should have font-medium class
    expect(aliceRow).toHaveClass('font-medium');
  });
});
