/**
 * Message Types for NATS messaging
 */

/**
 * Message entity for the UI
 */
export interface Message {
  id: string;
  conversationId: string;
  senderId: string;
  content: string;
  type: 'text' | 'image' | 'file';
  timestamp: Date;
  isRead: boolean;
  status?: 'sending' | 'sent' | 'failed';
}

/**
 * NATS message subject for sending messages
 */
export const MESSAGE_SEND_SUBJECT = 'message.send';

/**
 * NATS message subject for receiving messages
 */
export const MESSAGE_RECEIVE_SUBJECT = 'message.receive';

/**
 * NATS message payload for sending a message
 */
export interface SendMessagePayload {
  conversationId: string;
  content: string;
  senderId: string;
  type: 'text' | 'image' | 'file';
}

/**
 * NATS message payload for receiving a message
 */
export interface ReceivedMessagePayload {
  id: string;
  conversationId: string;
  senderId: string;
  content: string;
  type: 'text' | 'image' | 'file';
  timestamp: number;
}

/**
 * Convert received NATS payload to Message entity
 */
export function payloadToMessage(payload: ReceivedMessagePayload): Message {
  return {
    id: payload.id,
    conversationId: payload.conversationId,
    senderId: payload.senderId,
    content: payload.content,
    type: payload.type,
    timestamp: new Date(payload.timestamp),
    isRead: false,
    status: 'sent',
  };
}
