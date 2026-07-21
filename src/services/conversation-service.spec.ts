/**
 * Conversation Service Tests
 */

import {
  getConversations,
  getConversationById,
  markConversationAsRead,
  addMessage,
  createConversation,
  generateMockConversations,
} from './conversation-service';
import type { Conversation, Message, ConversationParticipant } from '../types/conversation';

describe('Conversation Service', () => {
  describe('getConversations', () => {
    it('returns conversations sorted by recency', () => {
      const now = new Date();
      const yesterday = new Date(now);
      yesterday.setDate(yesterday.getDate() - 1);

      const conversations: Conversation[] = [
        {
          id: 'conv-old',
          participants: [],
          lastMessage: {
            id: 'msg-old',
            conversationId: 'conv-old',
            senderId: 'user-1',
            content: 'Old message',
            type: 'text',
            timestamp: yesterday,
            isRead: true,
          },
          unreadCount: 0,
          createdAt: yesterday,
          updatedAt: yesterday,
        },
        {
          id: 'conv-new',
          participants: [],
          lastMessage: {
            id: 'msg-new',
            conversationId: 'conv-new',
            senderId: 'user-1',
            content: 'New message',
            type: 'text',
            timestamp: now,
            isRead: true,
          },
          unreadCount: 0,
          createdAt: now,
          updatedAt: now,
        },
      ];

      const previews = getConversations(conversations);

      expect(previews[0].id).toBe('conv-new');
      expect(previews[1].id).toBe('conv-old');
    });

    it('converts conversations to preview format', () => {
      const now = new Date();
      const conversations: Conversation[] = [
        {
          id: 'conv-1',
          participants: [
            { userId: 'current-user', name: 'Current User' },
            { userId: 'other-user', name: 'Alice', avatarUrl: '/alice.png' },
          ],
          lastMessage: {
            id: 'msg-1',
            conversationId: 'conv-1',
            senderId: 'other-user',
            content: 'Hello!',
            type: 'text',
            timestamp: now,
            isRead: false,
          },
          unreadCount: 1,
          createdAt: now,
          updatedAt: now,
        },
      ];

      const previews = getConversations(conversations);

      expect(previews[0].otherUserName).toBe('Alice');
      expect(previews[0].otherUserAvatarUrl).toBe('/alice.png');
      expect(previews[0].isUnread).toBe(true);
    });
  });

  describe('getConversationById', () => {
    it('returns the conversation with matching ID', () => {
      const now = new Date();
      const conversations: Conversation[] = [
        {
          id: 'conv-1',
          participants: [],
          lastMessage: {
            id: 'msg-1',
            conversationId: 'conv-1',
            senderId: 'user-1',
            content: 'Hello',
            type: 'text',
            timestamp: now,
            isRead: true,
          },
          unreadCount: 0,
          createdAt: now,
          updatedAt: now,
        },
        {
          id: 'conv-2',
          participants: [],
          lastMessage: {
            id: 'msg-2',
            conversationId: 'conv-2',
            senderId: 'user-1',
            content: 'World',
            type: 'text',
            timestamp: now,
            isRead: true,
          },
          unreadCount: 0,
          createdAt: now,
          updatedAt: now,
        },
      ];

      const result = getConversationById(conversations, 'conv-1');

      expect(result?.id).toBe('conv-1');
    });

    it('returns undefined when conversation not found', () => {
      const now = new Date();
      const conversations: Conversation[] = [
        {
          id: 'conv-1',
          participants: [],
          lastMessage: {
            id: 'msg-1',
            conversationId: 'conv-1',
            senderId: 'user-1',
            content: 'Hello',
            type: 'text',
            timestamp: now,
            isRead: true,
          },
          unreadCount: 0,
          createdAt: now,
          updatedAt: now,
        },
      ];

      const result = getConversationById(conversations, 'non-existent');

      expect(result).toBeUndefined();
    });
  });

  describe('markConversationAsRead', () => {
    it('sets unreadCount to 0 for the specified conversation', () => {
      const now = new Date();
      const conversations: Conversation[] = [
        {
          id: 'conv-1',
          participants: [],
          lastMessage: {
            id: 'msg-1',
            conversationId: 'conv-1',
            senderId: 'user-1',
            content: 'Hello',
            type: 'text',
            timestamp: now,
            isRead: false,
          },
          unreadCount: 3,
          createdAt: now,
          updatedAt: now,
        },
      ];

      const result = markConversationAsRead(conversations, 'conv-1');

      expect(result[0].unreadCount).toBe(0);
    });

    it('marks the last message as read', () => {
      const now = new Date();
      const conversations: Conversation[] = [
        {
          id: 'conv-1',
          participants: [],
          lastMessage: {
            id: 'msg-1',
            conversationId: 'conv-1',
            senderId: 'user-1',
            content: 'Hello',
            type: 'text',
            timestamp: now,
            isRead: false,
          },
          unreadCount: 3,
          createdAt: now,
          updatedAt: now,
        },
      ];

      const result = markConversationAsRead(conversations, 'conv-1');

      expect(result[0].lastMessage.isRead).toBe(true);
    });

    it('does not modify other conversations', () => {
      const now = new Date();
      const conversations: Conversation[] = [
        {
          id: 'conv-1',
          participants: [],
          lastMessage: {
            id: 'msg-1',
            conversationId: 'conv-1',
            senderId: 'user-1',
            content: 'Hello',
            type: 'text',
            timestamp: now,
            isRead: false,
          },
          unreadCount: 3,
          createdAt: now,
          updatedAt: now,
        },
        {
          id: 'conv-2',
          participants: [],
          lastMessage: {
            id: 'msg-2',
            conversationId: 'conv-2',
            senderId: 'user-1',
            content: 'World',
            type: 'text',
            timestamp: now,
            isRead: true,
          },
          unreadCount: 0,
          createdAt: now,
          updatedAt: now,
        },
      ];

      const result = markConversationAsRead(conversations, 'conv-1');

      expect(result[1].unreadCount).toBe(0);
      expect(result[1].lastMessage.isRead).toBe(true);
    });
  });

  describe('addMessage', () => {
    it('updates the last message for the conversation', () => {
      const now = new Date();
      const newMessage: Message = {
        id: 'msg-new',
        conversationId: 'conv-1',
        senderId: 'user-2',
        content: 'New message',
        type: 'text',
        timestamp: now,
        isRead: false,
      };
      const conversations: Conversation[] = [
        {
          id: 'conv-1',
          participants: [],
          lastMessage: {
            id: 'msg-old',
            conversationId: 'conv-1',
            senderId: 'user-1',
            content: 'Old message',
            type: 'text',
            timestamp: new Date(now.getTime() - 1000),
            isRead: true,
          },
          unreadCount: 0,
          createdAt: now,
          updatedAt: now,
        },
      ];

      const result = addMessage(conversations, 'conv-1', newMessage);

      expect(result[0].lastMessage.id).toBe('msg-new');
      expect(result[0].lastMessage.content).toBe('New message');
    });

    it('increments unreadCount when message is from another user', () => {
      const now = new Date();
      const newMessage: Message = {
        id: 'msg-new',
        conversationId: 'conv-1',
        senderId: 'other-user',
        content: 'New message',
        type: 'text',
        timestamp: now,
        isRead: false,
      };
      const conversations: Conversation[] = [
        {
          id: 'conv-1',
          participants: [],
          lastMessage: {
            id: 'msg-old',
            conversationId: 'conv-1',
            senderId: 'current-user',
            content: 'Old message',
            type: 'text',
            timestamp: new Date(now.getTime() - 1000),
            isRead: true,
          },
          unreadCount: 0,
          createdAt: now,
          updatedAt: now,
        },
      ];

      const result = addMessage(conversations, 'conv-1', newMessage);

      expect(result[0].unreadCount).toBe(1);
    });

    it('does not increment unreadCount when message is from current user', () => {
      const now = new Date();
      const newMessage: Message = {
        id: 'msg-new',
        conversationId: 'conv-1',
        senderId: 'current-user',
        content: 'New message',
        type: 'text',
        timestamp: now,
        isRead: false,
      };
      const conversations: Conversation[] = [
        {
          id: 'conv-1',
          participants: [],
          lastMessage: {
            id: 'msg-old',
            conversationId: 'conv-1',
            senderId: 'other-user',
            content: 'Old message',
            type: 'text',
            timestamp: new Date(now.getTime() - 1000),
            isRead: true,
          },
          unreadCount: 2,
          createdAt: now,
          updatedAt: now,
        },
      ];

      const result = addMessage(conversations, 'conv-1', newMessage);

      expect(result[0].unreadCount).toBe(2);
    });
  });

  describe('createConversation', () => {
    it('creates a new conversation with the given participants and message', () => {
      const now = new Date();
      const participants: ConversationParticipant[] = [
        { userId: 'current-user', name: 'Current User' },
        { userId: 'other-user', name: 'Alice' },
      ];
      const initialMessage: Message = {
        id: 'msg-1',
        conversationId: 'conv-temp',
        senderId: 'current-user',
        content: 'Hello!',
        type: 'text',
        timestamp: now,
        isRead: true,
      };

      const result = createConversation(participants, initialMessage);

      expect(result.participants).toEqual(participants);
      expect(result.lastMessage.content).toBe('Hello!');
      expect(result.unreadCount).toBe(0);
    });

    it('generates a unique ID', () => {
      const participants: ConversationParticipant[] = [
        { userId: 'current-user', name: 'Current User' },
        { userId: 'other-user', name: 'Alice' },
      ];
      const initialMessage: Message = {
        id: 'msg-1',
        conversationId: 'conv-temp',
        senderId: 'current-user',
        content: 'Hello!',
        type: 'text',
        timestamp: new Date(),
        isRead: true,
      };

      const result1 = createConversation(participants, initialMessage);
      // Delay to ensure different timestamp
      const laterTime = Date.now() + 10;
      while (Date.now() < laterTime) {
        // Wait for next millisecond
      }
      const result2 = createConversation(participants, {
        ...initialMessage,
        timestamp: new Date(),
      });

      expect(result1.id).not.toBe(result2.id);
    });
  });

  describe('generateMockConversations', () => {
    it('returns an array of conversations', () => {
      const result = generateMockConversations();

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(3);
    });

    it('creates conversations with different timestamps', () => {
      const result = generateMockConversations();

      // First conversation should be today
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const todayMsg = new Date(result[0].lastMessage.timestamp);
      todayMsg.setHours(0, 0, 0, 0);
      expect(todayMsg.getTime()).toBe(today.getTime());

      // Second conversation should be yesterday
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayMsg = new Date(result[1].lastMessage.timestamp);
      yesterdayMsg.setHours(0, 0, 0, 0);
      expect(yesterdayMsg.getTime()).toBe(yesterday.getTime());

      // Third conversation should be last week
      const lastWeek = new Date(today);
      lastWeek.setDate(lastWeek.getDate() - 7);
      const lastWeekMsg = new Date(result[2].lastMessage.timestamp);
      lastWeekMsg.setHours(0, 0, 0, 0);
      expect(lastWeekMsg.getTime()).toBe(lastWeek.getTime());
    });

    it('sets unreadCount correctly', () => {
      const result = generateMockConversations();

      // First conversation has unread messages
      expect(result[0].unreadCount).toBeGreaterThan(0);

      // Other conversations are read
      expect(result[1].unreadCount).toBe(0);
      expect(result[2].unreadCount).toBe(0);
    });
  });
});
