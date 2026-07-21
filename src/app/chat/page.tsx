'use client';

import { useState } from 'react';
import { Navigation } from '@/components/ui';
import { ConversationList } from '@/components/ui';
import {
  getConversations,
  generateMockConversations,
} from '@/services/conversation-service';
import type { ConversationPreview } from '@/types/conversation';

export default function ChatPage() {
  const [selectedConversationId, setSelectedConversationId] = useState<string | undefined>(
    undefined
  );

  // Generate mock conversations on mount
  const conversations: ConversationPreview[] = getConversations(
    generateMockConversations()
  );

  const handleSelectConversation = (conversationId: string) => {
    setSelectedConversationId(conversationId);
  };

  const handleNavigate = (section: 'directory' | 'admin' | 'user' | 'home') => {
    console.log('Navigate to:', section);
    // TODO: Implement navigation
  };

  return (
    <main className="min-h-screen bg-neutral-50">
      {/* Navigation */}
      <Navigation onNavigate={handleNavigate} />

      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-neutral-900">Messages</h1>
          <p className="text-neutral-600 mt-2">
            Your conversations with others
          </p>
        </div>

        <ConversationList
          conversations={conversations}
          onSelectConversation={handleSelectConversation}
          selectedConversationId={selectedConversationId}
        />
      </div>
    </main>
  );
}
