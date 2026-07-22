/**
 * Message Types
 *
 * Defines the data structures for message sending, receiving, and queue management.
 */

/**
 * Message status for optimistic UI updates
 */
export type MessageStatus = 'sending' | 'sent' | 'failed' | 'offline';

/**
 * Message entity with status tracking
 */
export interface Message {
  id: string;
  conversationId: string;
  senderId: string;
  content: string;
  type: 'text' | 'image' | 'file';
  timestamp: Date;
  isRead: boolean;
  status: MessageStatus;
}

/**
 * Outgoing message for sending via NATS
 */
export interface OutgoingMessage {
  conversationId: string;
  senderId: string;
  content: string;
  type: 'text' | 'image' | 'file';
  clientTimestamp: Date;
}

/**
 * Incoming message received from NATS
 */
export interface IncomingMessage {
  messageId: string;
  conversationId: string;
  senderId: string;
  content: string;
  type: 'text' | 'image' | 'file';
  timestamp: Date;
}

/**
 * Message acknowledgment from NATS
 */
export interface MessageAck {
  messageId: string;
  acknowledged: boolean;
  timestamp: Date;
}

/**
 * Offline message queue entry
 */
export interface OfflineQueueEntry {
  message: OutgoingMessage;
  retryCount: number;
  lastAttempt: Date;
}

/**
 * Generate a unique message ID
 */
export function generateMessageId(): string {
  return `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Create an outgoing message with optimistic UI state
 */
export function createOutgoingMessage(
  conversationId: string,
  senderId: string,
  content: string,
  type: 'text' | 'image' | 'file' = 'text'
): OutgoingMessage {
  return {
    conversationId,
    senderId,
    content,
    type,
    clientTimestamp: new Date(),
  };
}

/**
 * Convert outgoing message to full message with sending status
 */
export function toSendingMessage(
  outgoing: OutgoingMessage
): Message {
  return {
    id: generateMessageId(),
    conversationId: outgoing.conversationId,
    senderId: outgoing.senderId,
    content: outgoing.content,
    type: outgoing.type,
    timestamp: outgoing.clientTimestamp,
    isRead: true,
    status: 'sending',
  };
}

/**
 * Convert incoming message to full message
 */
export function toMessage(
  incoming: IncomingMessage
): Message {
  return {
    id: incoming.messageId,
    conversationId: incoming.conversationId,
    senderId: incoming.senderId,
    content: incoming.content,
    type: incoming.type,
    timestamp: incoming.timestamp,
    isRead: false,
    status: 'sent',
  };
}

/**
 * Update message status
 */
export function updateMessageStatus(
  message: Message,
  status: MessageStatus
): Message {
  return {
    ...message,
    status,
  };
}
