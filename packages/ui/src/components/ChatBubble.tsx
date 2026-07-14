import React from 'react';

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
    <div className={`chat-bubble ${direction}`}>
      {senderName && <span className="sender-name">{senderName}</span>}
      <div className="bubble-content">
        <p>{message}</p>
      </div>
      {timestamp && <span className="timestamp">{timestamp}</span>}
    </div>
  );
};

export default ChatBubble;
