'use client';

import React, { forwardRef, useEffect, useRef, useState } from 'react';
import type { Message } from '../../types/message';
import { formatTimestamp } from '../../types/conversation';
import { NotificationBanner } from './NotificationBanner';

export interface ConversationThreadProps {
  /** Messages to display in the thread */
  messages: Message[];
  /** Current user ID for message alignment */
  currentUserId: string;
  /** Callback when sending a new message */
  onSendMessage?: (content: string) => void;
  /** Whether the send operation is in progress */
  isSending?: boolean;
  /** Error message to display */
  errorMessage?: string;
  /** Clear error callback */
  onClearError?: () => void;
}

/**
 * Conversation thread component
 *
 * Displays a chat-style message thread with:
 * - Messages aligned left (others) or right (self)
 * - Timestamps below each message
 * - Sending indicator for optimistic UI
 * - Input field for new messages
 * - Error banner for failed sends
 */
const ConversationThread = forwardRef<HTMLDivElement, ConversationThreadProps>(
  (
    {
      messages,
      currentUserId,
      onSendMessage,
      isSending = false,
      errorMessage,
      onClearError,
    },
    ref
  ) => {
    const [inputValue, setInputValue] = useState('');
    const messagesEndRef = useRef<HTMLDivElement>(null);

    // Auto-scroll to bottom when messages change
    useEffect(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    // Auto-clear error after 5 seconds
    useEffect(() => {
      if (errorMessage && onClearError) {
        const timer = setTimeout(onClearError, 5000);
        return () => clearTimeout(timer);
      }
    }, [errorMessage, onClearError]);

    const handleSubmit = (e: React.FormEvent) => {
      e.preventDefault();
      if (inputValue.trim() && onSendMessage && !isSending) {
        onSendMessage(inputValue.trim());
        setInputValue('');
      }
    };

    const isOwnMessage = (message: Message) => message.senderId === currentUserId;

    const getMessageStatusIndicator = (message: Message) => {
      if (message.status === 'sending') {
        return (
          <span className="ml-2 text-neutral-400 text-xs animate-pulse">
            sending...
          </span>
        );
      }
      if (message.status === 'failed') {
        return (
          <span className="ml-2 text-red-500 text-xs" title="Failed to send">
            failed
          </span>
        );
      }
      if (message.status === 'sent') {
        return (
          <span className="ml-2 text-neutral-400 text-xs" title="Sent">
            ✓
          </span>
        );
      }
      return null;
    };

    return (
      <div ref={ref} className="flex flex-col h-full">
        {/* Error banner */}
        {errorMessage && (
          <NotificationBanner
            variant="error"
            message={errorMessage}
            onClose={onClearError}
          />
        )}

        {/* Messages container */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.length === 0 ? (
            <div className="text-center text-neutral-500 py-8">
              No messages yet. Start the conversation!
            </div>
          ) : (
            messages.map((message) => {
              const isOwn = isOwnMessage(message);
              return (
                <div
                  key={message.id}
                  className={`flex ${isOwn ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`
                      max-w-[70%] rounded-lg p-3
                      ${
                        isOwn
                          ? 'bg-heritage-ochre text-white'
                          : 'bg-neutral-200 text-neutral-900'
                      }
                    `}
                  >
                    <p className="text-sm break-words">{message.content}</p>
                    <div className="flex items-center justify-end gap-1 mt-1">
                      <span
                        className={`text-xs ${
                          isOwn ? 'text-heritage-ochre/80' : 'text-neutral-500'
                        }`}
                      >
                        {formatTimestamp(message.timestamp)}
                      </span>
                      {getMessageStatusIndicator(message)}
                    </div>
                  </div>
                </div>
              );
            })
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Message input */}
        <form
          onSubmit={handleSubmit}
          className="border-t border-neutral-200 p-4 bg-white"
        >
          <div className="flex gap-2">
            <input
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              placeholder="Type a message..."
              disabled={isSending}
              className="flex-1 px-4 py-2 border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-heritage-ochre focus:border-transparent disabled:bg-neutral-100"
            />
            <button
              type="submit"
              disabled={!inputValue.trim() || isSending}
              className="px-4 py-2 bg-heritage-ochre text-white rounded-lg font-medium hover:bg-heritage-ochre/90 disabled:bg-neutral-300 disabled:cursor-not-allowed transition-colors"
            >
              {isSending ? 'Sending...' : 'Send'}
            </button>
          </div>
        </form>
      </div>
    );
  }
);

ConversationThread.displayName = 'ConversationThread';

export default ConversationThread;
