'use client';

import React, { forwardRef } from 'react';
import { ConversationPreview } from '../../types/conversation';
import { formatTimestamp } from '../../types/conversation';
import Badge from './Badge';

export interface ConversationListProps {
  /** Array of conversation previews to display */
  conversations: ConversationPreview[];
  /** Callback when a conversation is clicked */
  onSelectConversation?: (conversationId: string) => void;
  /** Currently selected conversation ID */
  selectedConversationId?: string;
}

/**
 * Conversation list component
 *
 * Displays conversations in reverse-chronological order with:
 * - 50-character message preview with ellipsis
 * - Unread message count badge (red)
 * - Timestamp formatting (today/yesterday/weekday/date)
 */
const ConversationList = forwardRef<HTMLUListElement, ConversationListProps>(
  ({ conversations, onSelectConversation, selectedConversationId }, ref) => {
    const handleItemClick = (conversationId: string) => {
      if (onSelectConversation) {
        onSelectConversation(conversationId);
      }
    };

    return (
      <ul
        ref={ref}
        className="divide-y divide-neutral-200 border border-neutral-200 rounded-lg overflow-hidden"
      >
        {conversations.map((conversation) => {
          const isSelected = selectedConversationId === conversation.id;

          return (
            <li
              key={conversation.id}
              onClick={() => handleItemClick(conversation.id)}
              className={`
                p-4 cursor-pointer transition-colors duration-150
                ${isSelected ? 'bg-heritage-ochre/10' : 'bg-white hover:bg-neutral-50'}
                ${conversation.isUnread ? 'font-medium' : ''}
              `}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  handleItemClick(conversation.id);
                }
              }}
            >
              <div className="flex items-start gap-3">
                {/* Avatar */}
                <div className="flex-shrink-0">
                  {conversation.otherUserAvatarUrl ? (
                    <img
                      src={conversation.otherUserAvatarUrl}
                      alt={conversation.otherUserName}
                      className="w-12 h-12 rounded-full object-cover"
                    />
                  ) : (
                    <div className="w-12 h-12 rounded-full bg-heritage-ochre/20 flex items-center justify-center">
                      <span className="text-lg font-medium text-heritage-ochre">
                        {conversation.otherUserName.charAt(0).toUpperCase()}
                      </span>
                    </div>
                  )}
                </div>

                {/* Conversation content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-1">
                    <h3 className="text-base font-semibold text-neutral-900 truncate">
                      {conversation.otherUserName}
                    </h3>
                    <span className="text-sm text-neutral-500 flex-shrink-0">
                      {formatTimestamp(conversation.lastMessageTime)}
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <p
                      className={`
                        text-sm truncate flex-1
                        ${conversation.isUnread ? 'text-neutral-900' : 'text-neutral-600'}
                      `}
                    >
                      {conversation.lastMessagePreview}
                    </p>

                    {/* Unread badge */}
                    {conversation.isUnread && (
                      <Badge variant="error" size="sm" pill>
                        {conversation.unreadCount}
                      </Badge>
                    )}
                  </div>
                </div>
              </div>
            </li>
          );
        })}

        {conversations.length === 0 && (
          <li className="p-8 text-center text-neutral-500">
            No conversations yet. Start chatting!
          </li>
        )}
      </ul>
    );
  }
);

ConversationList.displayName = 'ConversationList';

export default ConversationList;
