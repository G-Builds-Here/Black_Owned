/**
 * Conversation Service
 *
 * Handles conversation data operations including sorting, filtering, and preview generation.
 */

import {
  Conversation,
  Message,
  ConversationParticipant,
  ConversationPreview,
  sortByRecency,
  toConversationPreview,
} from '../types/conversation';

/**
 * Mock current user ID for demo purposes
 */
const CURRENT_USER_ID = 'current-user';

/**
 * Get all conversations sorted by recency
 */
export function getConversations(conversations: Conversation[]): ConversationPreview[] {
  const sorted = sortByRecency(conversations);
  return sorted.map(conv => toConversationPreview(conv, CURRENT_USER_ID));
}

/**
 * Get a single conversation by ID
 */
export function getConversationById(
  conversations: Conversation[],
  id: string
): Conversation | undefined {
  return conversations.find(conv => conv.id === id);
}

/**
 * Mark messages in a conversation as read
 */
export function markConversationAsRead(
  conversations: Conversation[],
  conversationId: string
): Conversation[] {
  return conversations.map(conv => {
    if (conv.id === conversationId) {
      return {
        ...conv,
        unreadCount: 0,
        lastMessage: {
          ...conv.lastMessage,
          isRead: true,
        },
      };
    }
    return conv;
  });
}

/**
 * Add a new message to a conversation
 */
export function addMessage(
  conversations: Conversation[],
  conversationId: string,
  message: Message
): Conversation[] {
  return conversations.map(conv => {
    if (conv.id === conversationId) {
      return {
        ...conv,
        lastMessage: message,
        updatedAt: message.timestamp,
        unreadCount: message.senderId !== CURRENT_USER_ID ? conv.unreadCount + 1 : conv.unreadCount,
      };
    }
    return conv;
  });
}

/**
 * Create a new conversation
 */
export function createConversation(
  participants: ConversationParticipant[],
  initialMessage: Message
): Conversation {
  const now = new Date();
  return {
    id: `conv-${Date.now()}`,
    participants,
    lastMessage: initialMessage,
    unreadCount: 0,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Find or create a conversation between current user and another user
 * Returns existing conversation if one exists, otherwise creates a new one
 */
export function findOrCreateConversation(
  existingConversations: Conversation[],
  otherUserId: string,
  otherUserName: string
): Conversation {
  // Check if conversation already exists with this user
  const existing = existingConversations.find(conv =>
    conv.participants.some(p => p.userId === otherUserId)
  );

  if (existing) {
    return existing;
  }

  // Create new conversation
  const now = new Date();
  const initialMessage: Message = {
    id: `msg-${Date.now()}`,
    conversationId: `conv-${Date.now()}`,
    senderId: CURRENT_USER_ID,
    content: 'Hello! I would like to connect with you.',
    type: 'text',
    timestamp: now,
    isRead: true,
  };

  return {
    id: initialMessage.conversationId,
    participants: [
      { userId: CURRENT_USER_ID, name: 'Current User' },
      { userId: otherUserId, name: otherUserName },
    ],
    lastMessage: initialMessage,
    unreadCount: 0,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Generate mock conversations for testing/demo
 */
export function generateMockConversations(): Conversation[] {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const lastWeek = new Date(today);
  lastWeek.setDate(lastWeek.getDate() - 7);

  return [
    {
      id: 'conv-1',
      participants: [
        { userId: CURRENT_USER_ID, name: 'Current User' },
        { userId: 'user-2', name: 'Alice Johnson', avatarUrl: '/avatars/alice.png' },
      ],
      lastMessage: {
        id: 'msg-1',
        conversationId: 'conv-1',
        senderId: 'user-2',
        content: 'Hey! Are we still on for the meeting tomorrow?',
        type: 'text',
        timestamp: new Date(today.getTime() + 2 * 60 * 60 * 1000),
        isRead: false,
      },
      unreadCount: 2,
      createdAt: today,
      updatedAt: new Date(today.getTime() + 2 * 60 * 60 * 1000),
    },
    {
      id: 'conv-2',
      participants: [
        { userId: CURRENT_USER_ID, name: 'Current User' },
        { userId: 'user-3', name: 'Bob Smith', avatarUrl: '/avatars/bob.png' },
      ],
      lastMessage: {
        id: 'msg-2',
        conversationId: 'conv-2',
        senderId: CURRENT_USER_ID,
        content: 'Thanks for the update on the project status. I will review the documents and get back to you by end of week.',
        type: 'text',
        timestamp: new Date(yesterday.getTime() + 4 * 60 * 60 * 1000),
        isRead: true,
      },
      unreadCount: 0,
      createdAt: yesterday,
      updatedAt: new Date(yesterday.getTime() + 4 * 60 * 60 * 1000),
    },
    {
      id: 'conv-3',
      participants: [
        { userId: CURRENT_USER_ID, name: 'Current User' },
        { userId: 'user-4', name: 'Carol Davis', avatarUrl: '/avatars/carol.png' },
      ],
      lastMessage: {
        id: 'msg-3',
        conversationId: 'conv-3',
        senderId: 'user-4',
        content: 'Great work on the presentation!',
        type: 'text',
        timestamp: new Date(lastWeek.getTime() + 10 * 60 * 60 * 1000),
        isRead: true,
      },
      unreadCount: 0,
      createdAt: lastWeek,
      updatedAt: new Date(lastWeek.getTime() + 10 * 60 * 60 * 1000),
    },
  ];
}
