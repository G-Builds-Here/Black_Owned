'use client';

import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import Input from '@/components/ui/Input';
import Badge from '@/components/ui/Badge';
import Navigation from '@/components/ui/Navigation';
import { getSession, authHeaders, clearSession } from '@/lib/auth/client-session';
import {
  connectChatNats,
  isOnline,
  onConnectionChange,
  subscribeChat,
} from '@/lib/chat/nats-client';

interface ConversationItem {
  id: string;
  businessId: string;
  businessName: string;
  category: string;
  lastMessage: string | null;
  lastMessageAt: string | null;
  unreadCount: number;
  createdAt: string;
}

interface ThreadMessage {
  id: string;
  senderUserId: string;
  senderName: string;
  body: string;
  isRead: boolean;
  createdAt: string;
  /** Optimistic lifecycle: sending -> sent, or queued while offline (AC2). */
  status?: 'sending' | 'sent' | 'queued';
}

interface QueuedMessage {
  tempId: string;
  conversationId: string;
  body: string;
}

const PREVIEW_LIMIT = 50;

function preview(text: string | null): string {
  if (!text) return 'No messages yet';
  return text.length > PREVIEW_LIMIT ? `${text.slice(0, PREVIEW_LIMIT).trimEnd()}…` : text;
}

function timeLabel(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? ''
    : d.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function ChatPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [ready, setReady] = useState(false);
  const [me, setMe] = useState<string | null>(null);

  const [conversations, setConversations] = useState<ConversationItem[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);

  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ThreadMessage[]>([]);
  const [threadLoading, setThreadLoading] = useState(false);
  const [threadError, setThreadError] = useState<string | null>(null);

  const [draft, setDraft] = useState('');
  const [natsOnline, setNatsOnline] = useState(false);

  const queueRef = useRef<QueuedMessage[]>([]);
  const knownIdsRef = useRef<Set<string>>(new Set());
  const flushRef = useRef<() => void>(() => {});
  const activeIdRef = useRef<string | null>(null);

  // Session gate + list load + NATS connect (once).
  useEffect(() => {
    const session = getSession();
    if (!session) {
      router.replace('/login');
      return;
    }
    setMe(session.user.id);
    setReady(true);

    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/chat/conversations', { headers: authHeaders() });
        if (res.status === 401) {
          clearSession();
          router.replace('/login');
          return;
        }
        if (!res.ok) throw new Error('Failed to load conversations');
        const body = await res.json();
        if (cancelled) return;
        setConversations(body.data?.conversations ?? []);
        setListLoading(false);
      } catch {
        if (!cancelled) {
          setListError('Could not load your conversations. Please try again.');
          setListLoading(false);
        }
      }
    })();

    connectChatNats().then((ok) => {
      if (!cancelled) setNatsOnline(ok ? isOnline() : false);
    });
    const unsubscribe = onConnectionChange((online) => {
      if (cancelled) return;
      setNatsOnline(online);
      if (online) flushRef.current();
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [router]);

  // Deep link: /chat?conversation=<id> (from the detail-page Chat button, AC3).
  useEffect(() => {
    const fromUrl = searchParams.get('conversation');
    if (fromUrl && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(fromUrl)) {
      setActiveId(fromUrl);
    }
  }, [searchParams]);

  const activeConversation = useMemo(
    () => conversations.find((c) => c.id === activeId) ?? null,
    [conversations, activeId]
  );

  const markRead = (conversationId: string) => {
    fetch(`/api/chat/conversations/${conversationId}/read`, {
      method: 'POST',
      headers: authHeaders(),
    }).catch(() => {});
    setConversations((prev) =>
      prev.map((c) => (c.id === conversationId ? { ...c, unreadCount: 0 } : c))
    );
  };

  // Thread load + mark-read when the active conversation changes.
  useEffect(() => {
    activeIdRef.current = activeId ?? null;
    if (!activeId) {
      setMessages([]);
      return;
    }
    let cancelled = false;
    setThreadLoading(true);
    setThreadError(null);
    markRead(activeId);
    fetch(`/api/chat/conversations/${activeId}/messages`, { headers: authHeaders() })
      .then(async (res) => {
        if (res.status === 404) {
          setActiveId(null);
          setThreadLoading(false);
          return;
        }
        if (!res.ok) throw new Error('Failed to load messages');
        const body = await res.json();
        if (cancelled) return;
        const rows: ThreadMessage[] = (body.data?.messages ?? []).slice().reverse();
        // A late history response must not clobber local entries the server
        // has not seen yet (optimistic messages still in flight).
        const serverIds = new Set(rows.map((m) => m.id));
        setMessages((prev) => [...rows, ...prev.filter((m) => !serverIds.has(m.id))]);
        knownIdsRef.current = new Set(rows.map((m) => m.id));
        setThreadLoading(false);
      })
      .catch(() => {
        if (!cancelled) {
          setThreadError('Could not load the conversation. Please try again.');
          setThreadLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId]);

  // Live thread updates over NATS while a conversation is open.
  useEffect(() => {
    if (!activeId) return;
    const unsubscribe = subscribeChat(`chat.message.${activeId}`, (event) => {
      const payload = event as {
        conversationId?: string;
        messageId?: string;
        senderUserId?: string;
        senderName?: string;
        body?: string;
        createdAt?: string;
      };
      if (!payload || payload.conversationId !== activeId || !payload.messageId) return;
      if (knownIdsRef.current.has(payload.messageId)) return;
      knownIdsRef.current.add(payload.messageId);
      const incoming: ThreadMessage = {
        id: payload.messageId,
        senderUserId: payload.senderUserId ?? '',
        senderName: payload.senderName ?? 'Unknown',
        body: payload.body ?? '',
        isRead: true,
        createdAt: payload.createdAt ?? new Date().toISOString(),
      };
      setMessages((prev) =>
        payload.senderUserId === me ? prev : [...prev, incoming]
      );
      if (payload.senderUserId !== me) {
        markRead(activeId);
      }
      setConversations((prev) =>
        prev.map((c) =>
          c.id === activeId
            ? {
                ...c,
                lastMessage: payload.body ?? c.lastMessage,
                lastMessageAt: payload.createdAt ?? c.lastMessageAt,
                // the open thread is read as it happens — the badge stays at 0
                unreadCount: 0,
              }
            : c
        )
      );
    });
    return unsubscribe;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId, me]);

  const appendIncoming = (event: unknown) => {
    const payload = event as { conversationId?: string; body?: string; createdAt?: string };
    if (!payload || !payload.conversationId) return;
    setConversations((prev) =>
      prev.map((c) =>
        c.id === payload.conversationId
          ? {
              ...c,
              lastMessage: payload.body ?? c.lastMessage,
              lastMessageAt: payload.createdAt ?? c.lastMessageAt,
              // the open thread reads as it happens (the thread subscription
              // keeps its badge at 0); every other conversation gains a read
              unreadCount: c.id === activeIdRef.current ? c.unreadCount : c.unreadCount + 1,
            }
          : c
      )
    );
  };

  // List-level live preview updates (conversation not open in the thread pane).
  useEffect(() => {
    if (!me) return;
    const unsubscribe = subscribeChat('chat.message.*', appendIncoming);
    return unsubscribe;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me]);

  const send = async (tempId: string, conversationId: string, body: string) => {
    const res = await fetch(`/api/chat/conversations/${conversationId}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ body }),
    });
    if (!res.ok) throw new Error(`Message send failed (${res.status})`);
    const data = await res.json();
    setMessages((prev) =>
      prev.map((m) =>
        m.id === tempId
          ? {
              ...m,
              id: data.data.message.id,
              senderName: me ?? '',
              isRead: data.data.message.isRead,
              createdAt: data.data.message.createdAt,
              status: 'sent',
            }
          : m
      )
    );
    knownIdsRef.current.add(data.data.message.id);
    setConversations((prev) =>
      prev.map((c) =>
        c.id === conversationId ? { ...c, lastMessage: body, lastMessageAt: new Date().toISOString() } : c
      )
    );
  };

  const flushQueue = async () => {
    const queued = queueRef.current;
    if (queued.length === 0) return;
    queueRef.current = [];
    for (const item of queued) {
      try {
        await send(item.tempId, item.conversationId, item.body);
      } catch {
        queueRef.current = [...queueRef.current, item];
      }
    }
  };
  flushRef.current = flushQueue;

  // Periodic retry while anything is queued (the reconnect listener is the
  // primary trigger; this covers flapping sockets).
  useEffect(() => {
    if (queueRef.current.length === 0) return;
    const timer = setInterval(() => {
      flushRef.current();
    }, 5000);
    return () => clearInterval(timer);
  }, [messages]);

  const handleSend = () => {
    const text = draft.trim();
    if (!text || !activeId) return;
    const tempId = `tmp-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const optimistic: ThreadMessage = {
      id: tempId,
      senderUserId: me ?? '',
      senderName: 'You',
      body: text,
      isRead: true,
      createdAt: new Date().toISOString(),
      status: 'sending',
    };
    setMessages((prev) => [...prev, optimistic]);
    setDraft('');
    send(tempId, activeId, text).catch(() => {
      queueRef.current = [...queueRef.current, { tempId, conversationId: activeId, body: text }];
      setMessages((prev) =>
        prev.map((m) => (m.id === tempId ? { ...m, status: 'queued' } : m))
      );
      setConversations((prev) =>
        prev.map((c) =>
          c.id === activeId ? { ...c, lastMessage: text, lastMessageAt: new Date().toISOString() } : c
        )
      );
    });
  };

  if (!ready) {
    return (
      <div className="min-h-screen bg-white dark:bg-neutral-900">
        <Navigation />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-neutral-50 dark:bg-neutral-900">
      <Navigation />
      <div className="py-8 px-4">
        <div className="max-w-5xl mx-auto">
          <div className="mb-6">
            <h1 className="text-2xl font-bold text-neutral-900 dark:text-white">Messages</h1>
            <p className="text-neutral-600 dark:text-neutral-300 mt-1">
              Chat with the businesses you browse.
            </p>
          </div>

          {!natsOnline && (
            <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-300 px-3 py-2 rounded-lg text-sm mb-6">
              Live updates off — messages will sync when the connection is back.
            </div>
          )}

          <div className="flex flex-col md:flex-row gap-6 items-start">
            {/* Conversation list (AC1) */}
            <Card padding="md" className="w-full md:w-72 shrink-0">
              <h2 className="text-sm font-semibold text-neutral-700 dark:text-neutral-200 mb-3">
                Conversations
              </h2>
              {listError && (
                <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 px-3 py-2 rounded-lg text-sm">
                  {listError}
                </div>
              )}
              {listLoading ? (
                <div className="text-neutral-500 dark:text-neutral-400 text-sm py-4">Loading…</div>
              ) : conversations.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-neutral-600 dark:text-neutral-300 text-sm mb-4">
                    No conversations yet — browse the directory
                  </p>
                  <Link href="/directory">
                    <Button variant="secondary" size="sm">
                      Browse Directory
                    </Button>
                  </Link>
                </div>
              ) : (
                <ul className="space-y-2">
                  {conversations.map((c) => {
                    const active = c.id === activeId;
                    return (
                      <li key={c.id}>
                        <button
                          type="button"
                          onClick={() => {
                            setActiveId(c.id);
                            router.replace(`/chat?conversation=${c.id}`);
                          }}
                          className={`w-full text-left rounded-lg px-3 py-2 transition-colors ${
                            active
                              ? 'bg-heritage-ochre/10 dark:bg-heritage-ochre/20'
                              : 'hover:bg-neutral-100 dark:hover:bg-neutral-800'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-sm font-medium text-neutral-900 dark:text-white truncate">
                              {c.businessName}
                            </span>
                            {c.unreadCount > 0 && (
                              <Badge variant="info" pill>
                                {c.unreadCount}
                              </Badge>
                            )}
                          </div>
                          <p className="text-xs text-neutral-500 dark:text-neutral-400 truncate mt-0.5">
                            {preview(c.lastMessage)}
                          </p>
                          {c.lastMessageAt && (
                            <p className="text-[11px] text-neutral-400 dark:text-neutral-500 mt-0.5">
                              {timeLabel(c.lastMessageAt)}
                            </p>
                          )}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Card>

            {/* Thread (AC2) */}
            <Card padding="md" className="w-full flex-1">
              {!activeId ? (
                <div className="text-center py-12 text-neutral-500 dark:text-neutral-400 text-sm">
                  Select a conversation to start chatting.
                </div>
              ) : (
                <div className="flex flex-col h-[28rem]">
                  <div className="flex items-center justify-between border-b border-neutral-200 dark:border-neutral-700 pb-3 mb-3">
                    <div>
                      <h2 className="text-base font-semibold text-neutral-900 dark:text-white">
                        {activeConversation?.businessName ?? 'Conversation'}
                      </h2>
                      {activeConversation?.category && (
                        <p className="text-xs text-neutral-500 dark:text-neutral-400">
                          {activeConversation.category}
                        </p>
                      )}
                    </div>
                    <Link href={`/business/${activeConversation?.businessId ?? ''}`}>
                      <Button variant="secondary" size="sm">
                        View Business
                      </Button>
                    </Link>
                  </div>

                  {threadError && (
                    <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 px-3 py-2 rounded-lg text-sm mb-3">
                      {threadError}
                    </div>
                  )}

                  <div className="flex-1 overflow-y-auto space-y-3 pr-1">
                    {threadLoading ? (
                      <div className="text-neutral-500 dark:text-neutral-400 text-sm text-center py-6">
                        Loading…
                      </div>
                    ) : messages.length === 0 ? (
                      <div className="text-neutral-500 dark:text-neutral-400 text-sm text-center py-6">
                        No messages yet. Say hello!
                      </div>
                    ) : (
                      messages.map((m) => {
                        const own = m.senderUserId === me;
                        return (
                          <div
                            key={m.id}
                            className={`flex flex-col ${own ? 'items-end' : 'items-start'}`}
                            data-message-id={m.id}
                          >
                            {!own && (
                              <span className="text-[11px] text-neutral-400 dark:text-neutral-500 mb-0.5 px-1">
                                {m.senderName}
                              </span>
                            )}
                            <div
                              className={`max-w-[75%] rounded-2xl px-3 py-2 text-sm ${
                                own
                                  ? 'bg-heritage-ochre/20 dark:bg-heritage-ochre/30 text-neutral-900 dark:text-neutral-100 rounded-br-sm'
                                  : 'bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 text-neutral-900 dark:text-neutral-100 rounded-bl-sm'
                              }`}
                            >
                              <p className="whitespace-pre-wrap break-words">{m.body}</p>
                            </div>
                            {own && m.status && (
                              <span className="text-[11px] text-neutral-400 dark:text-neutral-500 mt-0.5 px-1">
                                {m.status === 'sending'
                                  ? 'Sending…'
                                  : m.status === 'queued'
                                    ? 'Queued — will send when back online'
                                    : 'Sent'}
                              </span>
                            )}
                          </div>
                        );
                      })
                    )}
                  </div>

                  <div className="border-t border-neutral-200 dark:border-neutral-700 pt-3 mt-3 flex gap-2">
                    <Input
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          handleSend();
                        }
                      }}
                      placeholder="Write a message…"
                      maxLength={2000}
                      aria-label="Message"
                    />
                    <Button variant="primary" onClick={handleSend} disabled={draft.trim() === ''}>
                      Send
                    </Button>
                  </div>
                </div>
              )}
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function ChatPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-white dark:bg-neutral-900">
          <Navigation />
        </div>
      }
    >
      <ChatPageInner />
    </Suspense>
  );
}
