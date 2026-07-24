'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { findOrCreateConversation } from '@/services/conversation-service';
import { getConversations, generateMockConversations } from '@/services/conversation-service';

export interface Business {
  id: string;
  name: string;
  description: string | null;
  categoryId: string;
  ownerId: string;
  verified: boolean;
  createdAt: {
    timestamp: number;
  };
}

export interface BusinessDetailProps {
  business: Business | null;
  loading: boolean;
  error: string | null;
  isOwner?: boolean;
}

/**
 * BusinessDetail component - displays business information
 *
 * Shows loading state while fetching, error state if fetch fails,
 * and business details (name, category, verified status) on success.
 * Business owners can edit their profile. Verified businesses show a Chat button.
 */
export function BusinessDetail({ business, loading, error, isOwner = false }: BusinessDetailProps) {
  const router = useRouter();
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [saving, setSaving] = useState(false);

  React.useEffect(() => {
    if (business) {
      setEditName(business.name);
      setEditDescription(business.description || '');
    }
  }, [business]);

  const handleChat = () => {
    if (!business) return;

    // Get existing conversations and find or create one with this business owner
    const conversations = getConversations(generateMockConversations());
    const newConversation = findOrCreateConversation(
      conversations.map(c => ({
        id: c.id,
        participants: [],
        lastMessage: {
          id: '',
          conversationId: c.id,
          senderId: '',
          content: c.lastMessagePreview,
          type: 'text',
          timestamp: c.lastMessageTime,
          isRead: c.isUnread,
        },
        unreadCount: c.unreadCount,
        createdAt: c.lastMessageTime,
        updatedAt: c.lastMessageTime,
      })),
      business.ownerId,
      business.name
    );

    // Navigate to chat page with the conversation
    router.push(`/chat?conversationId=${newConversation.id}`);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-neutral-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-heritage-ochre mx-auto mb-4"></div>
          <p className="text-neutral-600">Loading business details...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-neutral-50">
        <div className="text-center max-w-md mx-auto px-4">
          <div className="bg-red-50 border border-red-200 rounded-lg p-6">
            <div className="text-red-600 text-4xl mb-4">!</div>
            <h2 className="text-xl font-semibold text-red-800 mb-2">
              Unable to load business
            </h2>
            <p className="text-red-700 mb-4">{error}</p>
            <button
              onClick={() => window.location.reload()}
              className="bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 transition-colors"
            >
              Try Again
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!business) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-neutral-50">
        <div className="text-center max-w-md mx-auto px-4">
          <div className="bg-neutral-100 border border-neutral-200 rounded-lg p-6">
            <div className="text-neutral-500 text-4xl mb-4">?</div>
            <h2 className="text-xl font-semibold text-neutral-800 mb-2">
              Business not found
            </h2>
            <p className="text-neutral-600 mb-4">
              The business you are looking for does not exist or has been removed.
            </p>
            <a
              href="/directory"
              className="inline-block bg-heritage-ochre text-white px-4 py-2 rounded-lg hover:bg-heritage-ochre/90 transition-colors"
            >
              Browse Directory
            </a>
          </div>
        </div>
      </div>
    );
  }

  // Format timestamp to readable date
  const formatDate = (timestamp: number): string => {
    const date = new Date(timestamp * 1000);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  // Format category ID to readable category name
  const formatCategory = (categoryId: string): string => {
    // In a real app, this would fetch the category name from the categories API
    // For now, we'll display the ID as a fallback
    return categoryId
      .split('-')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  };

  return (
    <main className="min-h-screen bg-neutral-50">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {/* Business Header */}
        <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-8">
          <div className="flex items-start justify-between mb-6">
            <div>
              <div className="flex items-center gap-2 mb-3">
                {business.verified && (
                  <span className="inline-flex items-center gap-1 bg-green-100 text-green-800 px-3 py-1 rounded-full text-sm font-medium">
                    <span aria-hidden="true">✓</span>
                    Verified Business
                  </span>
                )}
                <span className="inline-flex items-center bg-neutral-100 text-neutral-700 px-3 py-1 rounded-full text-sm font-medium">
                  {formatCategory(business.categoryId)}
                </span>
              </div>
              <h1 className="text-3xl font-bold text-neutral-900 mb-2">
                {business.name}
              </h1>
              <p className="text-neutral-500 text-sm">
                Joined: {formatDate(business.createdAt.timestamp)}
              </p>
            </div>
          </div>

          {/* Business Details */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-8">
            <div className="bg-neutral-50 rounded-lg p-4">
              <h3 className="text-sm font-medium text-neutral-500 mb-1">Business ID</h3>
              <p className="text-neutral-800 font-mono text-sm">{business.id}</p>
            </div>
            <div className="bg-neutral-50 rounded-lg p-4">
              <h3 className="text-sm font-medium text-neutral-500 mb-1">Status</h3>
              <p className="text-neutral-800">
                {business.verified ? (
                  <span className="text-green-600 font-medium">Verified</span>
                ) : (
                  <span className="text-neutral-500">Unverified</span>
                )}
              </p>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-3 mt-8 pt-6 border-t border-neutral-200">
            <a
              href="/directory"
              className="inline-flex items-center justify-center px-4 py-2 bg-neutral-100 text-neutral-700 rounded-lg hover:bg-neutral-200 transition-colors font-medium"
            >
              ← Back to Directory
            </a>
            {business.verified && (
              <button
                onClick={handleChat}
                className="inline-flex items-center justify-center px-4 py-2 bg-heritage-ochre text-white rounded-lg hover:bg-heritage-ochre/90 transition-colors font-medium"
              >
                Chat
              </button>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}

export default BusinessDetail;
