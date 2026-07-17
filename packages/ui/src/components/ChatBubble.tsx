import React from 'react';
import styles from './ChatBubble.module.css';

export type MessageDirection = 'sent' | 'received';

export interface ChatBubbleProps {
  message: string;
  direction: MessageDirection;
  timestamp?: string;
  senderName?: string;
}

export const ChatBubble: React.FC<ChatBubbleProps> = ({
  message,
  direction,
  timestamp,
  senderName,
}) => {
  return (
    <div className={`${styles.chatBubble} ${styles[direction]}`}>
      {senderName && <span className={styles.senderName}>{senderName}</span>}
      <div className={styles.bubbleContent}>
        <p>{message}</p>
      </div>
      {timestamp && <span className={styles.timestamp}>{timestamp}</span>}
    </div>
  );
};

export default ChatBubble;
