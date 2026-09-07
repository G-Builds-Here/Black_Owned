'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { getSession, authHeaders, clearSession } from '@/lib/auth/client-session';

export interface ChatButtonProps {
  businessId: string;
}

/**
 * ChatButton - opens the chat conversation for a business.
 *
 * Hidden for signed-out visitors. On click it creates or resumes the
 * conversation (UNIQUE(user_id, business_id) server-side) and deep-links
 * into /chat?conversation=<id>. A 401 means the stored token went stale:
 * clear it and send the user to /login.
 */
export function ChatButton({ businessId }: ChatButtonProps) {
  const router = useRouter();
  const [session] = useState(() => getSession());
  const [busy, setBusy] = useState(false);

  if (!session) return null;

  async function handleClick() {
    if (busy) return;
    setBusy(true);
    try {
      const res = await fetch('/api/chat/conversations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ businessId }),
      });
      if (res.status === 401) {
        clearSession();
        router.replace('/login');
        return;
      }
      const data = await res.json();
      if (res.ok && data?.data?.conversation?.id) {
        router.push(`/chat?conversation=${data.data.conversation.id}`);
        return;
      }
      setBusy(false);
    } catch {
      setBusy(false);
    }
  }

  return (
    <button
      onClick={handleClick}
      disabled={busy}
      className="inline-flex items-center justify-center px-4 py-2 bg-heritage-ochre text-white rounded-lg hover:bg-heritage-ochre/90 transition-colors font-medium disabled:opacity-60"
    >
      Chat
    </button>
  );
}

export default ChatButton;
