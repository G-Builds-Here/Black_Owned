/**
 * Conversation Types
 *
 * Defines the data structures for user conversations and messages.
 */

/**
 * Conversation participant
 */
export interface ConversationParticipant {
  userId: string;
  name: string;
  avatarUrl?: string;
}

/**
 * Message type
 */
export type MessageType = 'text' | 'image' | 'file';

/**
 * Message entity
 */
export interface Message {
  id: string;
  conversationId: string;
  senderId: string;
  content: string;
  type: MessageType;
  timestamp: Date;
  isRead: boolean;
}

/**
 * Conversation entity
 */
export interface Conversation {
  id: string;
  participants: ConversationParticipant[];
  lastMessage: Message;
  unreadCount: number;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Conversation preview data for list display
 */
export interface ConversationPreview {
  id: string;
  otherUserName: string;
  otherUserAvatarUrl?: string;
  lastMessagePreview: string;
  lastMessageTime: Date;
  unreadCount: number;
  isUnread: boolean;
}

/**
 * Sort conversations by recency (newest first)
 */
export function sortByRecency(conversations: Conversation[]): Conversation[] {
  return [...conversations].sort((a, b) => {
    return b.lastMessage.timestamp.getTime() - a.lastMessage.timestamp.getTime();
  });
}

/**
 * Truncate message text to specified length with ellipsis
 */
export function truncateMessage(content: string, maxLength: number): string {
  if (content.length <= maxLength) {
    return content;
  }
  return content.slice(0, maxLength) + '...';
}

/**
 * Format timestamp for display
 */
export function formatTimestamp(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } else if (diffDays === 1) {
    return 'Yesterday';
  } else if (diffDays < 7) {
    return date.toLocaleDateString([], { weekday: 'long' });
  } else {
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
  }
}

/**
 * Convert full conversation to preview data
 */
export function toConversationPreview(
  conversation: Conversation,
  currentUserId: string
): ConversationPreview {
  const otherParticipant = conversation.participants.find(p => p.userId !== currentUserId);
  const preview = truncateMessage(conversation.lastMessage.content, 50);

  return {
    id: conversation.id,
    otherUserName: otherParticipant?.name ?? 'Unknown',
    otherUserAvatarUrl: otherParticipant?.avatarUrl,
    lastMessagePreview: preview,
    lastMessageTime: conversation.lastMessage.timestamp,
    unreadCount: conversation.unreadCount,
    isUnread: conversation.unreadCount > 0,
  };
}
