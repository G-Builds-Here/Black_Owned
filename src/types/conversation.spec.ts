/**
 * Conversation Types Tests
 */

import {
  sortByRecency,
  truncateMessage,
  formatTimestamp,
  toConversationPreview,
  type Conversation,
} from './conversation';

describe('Conversation Types', () => {
  describe('sortByRecency', () => {
    it('sorts conversations by last message timestamp (newest first)', () => {
      const now = new Date();
      const yesterday = new Date(now);
      yesterday.setDate(yesterday.getDate() - 1);
      const lastWeek = new Date(now);
      lastWeek.setDate(lastWeek.getDate() - 7);

      const conversations: Conversation[] = [
        {
          id: 'conv-3',
          participants: [],
          lastMessage: {
            id: 'msg-3',
            conversationId: 'conv-3',
            senderId: 'user-1',
            content: 'Last week message',
            type: 'text',
            timestamp: lastWeek,
            isRead: true,
          },
          unreadCount: 0,
          createdAt: lastWeek,
          updatedAt: lastWeek,
        },
        {
          id: 'conv-1',
          participants: [],
          lastMessage: {
            id: 'msg-1',
            conversationId: 'conv-1',
            senderId: 'user-1',
            content: 'Today message',
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
            content: 'Yesterday message',
            type: 'text',
            timestamp: yesterday,
            isRead: true,
          },
          unreadCount: 0,
          createdAt: yesterday,
          updatedAt: yesterday,
        },
      ];

      const sorted = sortByRecency(conversations);

      expect(sorted[0].id).toBe('conv-1');
      expect(sorted[1].id).toBe('conv-2');
      expect(sorted[2].id).toBe('conv-3');
    });

    it('returns a new array without mutating the original', () => {
      const now = new Date();
      const conversations: Conversation[] = [
        {
          id: 'conv-1',
          participants: [],
          lastMessage: {
            id: 'msg-1',
            conversationId: 'conv-1',
            senderId: 'user-1',
            content: 'Message',
            type: 'text',
            timestamp: now,
            isRead: true,
          },
          unreadCount: 0,
          createdAt: now,
          updatedAt: now,
        },
      ];

      const originalLength = conversations.length;
      const sorted = sortByRecency(conversations);

      expect(sorted.length).toBe(originalLength);
      expect(sorted).not.toBe(conversations);
    });
  });

  describe('truncateMessage', () => {
    it('returns the original string if within max length', () => {
      const result = truncateMessage('Hello', 10);
      expect(result).toBe('Hello');
    });

    it('truncates and adds ellipsis when exceeding max length', () => {
      const result = truncateMessage('Hello World', 5);
      expect(result).toBe('Hello...');
    });

    it('truncates exactly to max length', () => {
      const result = truncateMessage('Hello World', 5);
      expect(result.length).toBe(8); // 5 + 3 for ellipsis
    });

    it('handles empty string', () => {
      const result = truncateMessage('', 10);
      expect(result).toBe('');
    });

    it('handles exact length boundary', () => {
      const result = truncateMessage('Hello', 5);
      expect(result).toBe('Hello');
    });
  });

  describe('formatTimestamp', () => {
    it('shows time for messages from today', () => {
      const now = new Date();
      const result = formatTimestamp(now);
      expect(result).toMatch(/\d{1,2}:\d{2} (AM|PM)/);
    });

    it('shows Yesterday for messages from yesterday', () => {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const result = formatTimestamp(yesterday);
      expect(result).toBe('Yesterday');
    });

    it('shows weekday for messages within the last week', () => {
      const threeDaysAgo = new Date();
      threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
      const result = formatTimestamp(threeDaysAgo);
      expect(result).toMatch(/(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)/);
    });

    it('shows date for older messages', () => {
      const twoWeeksAgo = new Date();
      twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);
      const result = formatTimestamp(twoWeeksAgo);
      expect(result).toMatch(/(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)/);
    });
  });

  describe('toConversationPreview', () => {
    it('extracts the other participant name', () => {
      const now = new Date();
      const conversation: Conversation = {
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
      };

      const preview = toConversationPreview(conversation, 'current-user');

      expect(preview.otherUserName).toBe('Alice');
    });

    it('truncates message to 50 characters', () => {
      const now = new Date();
      const longMessage = 'A'.repeat(100);
      const conversation: Conversation = {
        id: 'conv-1',
        participants: [
          { userId: 'current-user', name: 'Current User' },
          { userId: 'other-user', name: 'Alice' },
        ],
        lastMessage: {
          id: 'msg-1',
          conversationId: 'conv-1',
          senderId: 'other-user',
          content: longMessage,
          type: 'text',
          timestamp: now,
          isRead: false,
        },
        unreadCount: 1,
        createdAt: now,
        updatedAt: now,
      };

      const preview = toConversationPreview(conversation, 'current-user');

      expect(preview.lastMessagePreview.length).toBe(53); // 50 + 3 for ellipsis
      expect(preview.lastMessagePreview).toBe('A'.repeat(50) + '...');
    });

    it('sets isUnread based on unreadCount', () => {
      const now = new Date();
      const conversation: Conversation = {
        id: 'conv-1',
        participants: [
          { userId: 'current-user', name: 'Current User' },
          { userId: 'other-user', name: 'Alice' },
        ],
        lastMessage: {
          id: 'msg-1',
          conversationId: 'conv-1',
          senderId: 'other-user',
          content: 'Hello',
          type: 'text',
          timestamp: now,
          isRead: false,
        },
        unreadCount: 3,
        createdAt: now,
        updatedAt: now,
      };

      const preview = toConversationPreview(conversation, 'current-user');

      expect(preview.isUnread).toBe(true);
      expect(preview.unreadCount).toBe(3);
    });

    it('sets isUnread to false when unreadCount is 0', () => {
      const now = new Date();
      const conversation: Conversation = {
        id: 'conv-1',
        participants: [
          { userId: 'current-user', name: 'Current User' },
          { userId: 'other-user', name: 'Alice' },
        ],
        lastMessage: {
          id: 'msg-1',
          conversationId: 'conv-1',
          senderId: 'current-user',
          content: 'Hello',
          type: 'text',
          timestamp: now,
          isRead: true,
        },
        unreadCount: 0,
        createdAt: now,
        updatedAt: now,
      };

      const preview = toConversationPreview(conversation, 'current-user');

      expect(preview.isUnread).toBe(false);
    });
  });
});
