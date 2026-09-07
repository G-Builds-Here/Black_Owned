'use client';

import React, { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getSession } from '@/lib/auth/client-session';
import { connectChatNats, subscribeChat } from '@/lib/chat/nats-client';

interface ChatNotification {
  conversationId?: string;
  businessId?: string;
  businessName?: string;
  messageId?: string;
  senderUserId?: string;
  senderName?: string;
  preview?: string;
  createdAt?: string;
}

/**
 * NotificationBanner - global toast for incoming chat messages (LOC-0042).
 *
 * Mounted in the root layout. Subscribes to chat.notification.<userId> over
 * NATS; the most recent notification wins. Auto-dismisses after 5s (a new
 * notification resets the timer); a manually dismissed message never
 * re-shows. Clicking the banner deep-links into /chat?conversation=<id>.
 */
export function NotificationBanner() {
  const router = useRouter();
  const [session] = useState(() => getSession());
  const [notification, setNotification] = useState<ChatNotification | null>(null);
  const dismissedRef = useRef<Set<string>>(new Set());

  const userId = session?.user.id;

  useEffect(() => {
    if (!userId) return;
    const unsubscribe = subscribeChat(`chat.notification.${userId}`, (event) => {
      const payload = event as ChatNotification;
      if (!payload?.conversationId || !payload.messageId) return;
      if (dismissedRef.current.has(payload.messageId)) return;
      setNotification(payload);
    });
    // The banner mounts on every page, before /chat has connected the
    // socket — the client's subject registry wires this up once the
    // connection exists.
    connectChatNats().catch(() => {});
    return unsubscribe;
  }, [userId]);

  useEffect(() => {
    if (!notification) return;
    const timer = setTimeout(() => setNotification(null), 5000);
    return () => clearTimeout(timer);
  }, [notification]);

  if (!session || !notification?.conversationId) return null;

  const openConversation = () => {
    router.push(`/chat?conversation=${notification!.conversationId}`);
  };

  const dismiss = () => {
    if (notification.messageId) dismissedRef.current.add(notification.messageId);
    setNotification(null);
  };

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={openConversation}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") openConversation();
      }}
      className="fixed bottom-4 right-4 z-[1100] w-80 max-w-[calc(100vw-2rem)] cursor-pointer rounded-lg border border-neutral-200 bg-white p-4 shadow-lg transition-shadow hover:shadow-xl"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-neutral-900 truncate">
            {notification.businessName || "New message"}
            {notification.senderName ? ` — ${notification.senderName}` : ""}
          </p>
          {notification.preview ? (
            <p className="mt-1 text-sm text-neutral-600 line-clamp-2">{notification.preview}</p>
          ) : null}
          <p className="mt-2 text-xs text-heritage-ochre font-medium">Click to open the conversation</p>
        </div>
        <button
          aria-label="Dismiss notification"
          onClick={(e) => {
            e.stopPropagation();
            dismiss();
          }}
          className="shrink-0 rounded p-1 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-600"
        >
          <span aria-hidden="true">×</span>
        </button>
      </div>
    </div>
  );
}

export default NotificationBanner;
