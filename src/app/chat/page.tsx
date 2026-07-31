'use client';

import { useState, useMemo } from 'react';
import { Navigation, ConversationList, ConversationThread } from '@/components/ui';
import {
  getConversations,
  generateMockConversations,
  addMessage,
  getConversationById,
} from '@/services/conversation-service';
import type { ConversationPreview, Message, Conversation } from '@/types/conversation';

// Mock current user ID
const CURRENT_USER_ID = 'current-user';

export default function ChatPage() {
  const [selectedConversationId, setSelectedConversationId] = useState<string | undefined>(
    undefined
  );

  // Generate mock conversations on mount
  const baseConversations = useMemo(() => generateMockConversations(), []);
  const [conversationState, setConversationState] = useState(baseConversations);

  const conversations: ConversationPreview[] = getConversations(conversationState);

  const selectedConversation: Conversation | undefined = useMemo(() => {
    if (!selectedConversationId) return undefined;
    return getConversationById(conversationState, selectedConversationId);
  }, [conversationState, selectedConversationId]);

  const handleSelectConversation = (conversationId: string) => {
    setSelectedConversationId(conversationId);
  };

  const handleNavigate = (section: 'directory' | 'admin' | 'user' | 'home') => {
    console.log('Navigate to:', section);
    // TODO: Implement navigation
  };

  const handleMessageSent = (message: Message) => {
    // Update conversation state with the new message
    setConversationState((prev) =>
      addMessage(prev, message.conversationId, message)
    );
  };

  return (
    <main className="min-h-screen bg-neutral-50">
      {/* Navigation */}
      <Navigation onNavigate={handleNavigate} />

      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-neutral-900">Messages</h1>
          <p className="text-neutral-600 mt-2">
            Your conversations with others
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Conversation List */}
          <div>
            <ConversationList
              conversations={conversations}
              onSelectConversation={handleSelectConversation}
              selectedConversationId={selectedConversationId}
            />
          </div>

          {/* Conversation Thread */}
          <div>
            {selectedConversation ? (
              <ConversationThread
                currentUserId={CURRENT_USER_ID}
                conversationId={selectedConversation.id}
                messages={selectedConversation.lastMessage ? [selectedConversation.lastMessage] : []}
                onMessageSent={handleMessageSent}
              />
            ) : (
              <div className="h-full min-h-[400px] flex items-center justify-center border border-neutral-200 rounded-lg bg-white">
                <p className="text-neutral-500">Select a conversation to start chatting</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
