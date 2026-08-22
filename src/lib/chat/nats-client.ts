/**
 * Browser-side NATS client for chat real-time (LOC-0042).
 *
 * The `nats` package is Node-only; `nats.ws` is the WebSocket fork that
 * runs in the browser against the server's -w endpoint. Chat sending
 * always goes through the REST API; this client only subscribes for live
 * thread updates and exposes connection status so the chat page can
 * queue-and-flush when the socket is down (AC2).
 */

import { connect, Events } from "nats.ws";
import type { NatsConnection, Subscription } from "nats.ws";

const WS_URL =
  process.env.NEXT_PUBLIC_NATS_WS_URL || "ws://localhost:8081";

type StatusListener = (online: boolean) => void;

let connection: NatsConnection | null = null;
let online = false;
const listeners = new Set<StatusListener>();

/**
 * Subject -> handlers registered via subscribeChat. Kept independently of
 * the live connection so that subscriptions created before the socket is
 * up (or after a close) are established the moment a connection exists.
 */
const subjectHandlers = new Map<string, Set<(payload: unknown) => void>>();
const activeSubjects = new Map<string, Subscription>();

function setOnline(value: boolean) {
  if (value === online) return;
  online = value;
  listeners.forEach((listener) => listener(value));
}

/**
 * Establish the shared browser socket. Resolves true when connected,
 * false when the initial connect failed (the caller stays offline).
 */
export async function connectChatNats(): Promise<boolean> {
  if (connection && !connection.isClosed()) {
    setOnline(true);
    return true;
  }
  try {
    connection = await connect({
      servers: WS_URL,
      reconnect: true,
      maxReconnectAttempts: 100,
    });
  } catch {
    setOnline(false);
    return false;
  }
  setOnline(true);
  // Establish any subjects registered before the socket was up.
  for (const subject of subjectHandlers.keys()) {
    ensureSubject(subject);
  }
  (async () => {
    for await (const status of connection!.status()) {
      if (status.type === Events.Disconnect) {
        setOnline(false);
      } else if (status.type === Events.Reconnect) {
        setOnline(true);
      }
    }
  })().catch(() => setOnline(false));
  return true;
}

/** Current socket state; the page renders its "live updates off" hint from this. */
export function isOnline(): boolean {
  return online;
}

/**
 * Subscribe to connection changes. Returns an unsubscribe function.
 * The listener is not invoked with the current state — callers should
 * read isOnline() first.
 */
export function onConnectionChange(listener: StatusListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Fan out a decoded payload to every handler registered on a subject. */
function deliver(subject: string, payload: unknown): void {
  const handlers = subjectHandlers.get(subject);
  if (!handlers) return;
  handlers.forEach((handler) => {
    try {
      handler(payload);
    } catch {
      // one handler's error must not break the others
    }
  });
}

/**
 * Open the real NATS subscription for a subject, once per subject.
 * No-op when the socket is not connected yet — connectChatNats() re-runs
 * this for every registered subject once the socket is up, and the
 * nats client re-sends its subscriptions automatically on reconnect.
 */
function ensureSubject(subject: string): void {
  if (!connection || connection.isClosed()) return;
  if (activeSubjects.has(subject)) return;
  const sub: Subscription = connection.subscribe(subject);
  activeSubjects.set(subject, sub);
  (async () => {
    for await (const msg of sub) {
      try {
        deliver(subject, JSON.parse(msg.string()));
      } catch {
        // ignore malformed payloads
      }
    }
  })().catch(() => activeSubjects.delete(subject));
}

/**
 * Subscribe to a subject with a JSON callback. The handler stays registered
 * even before the socket connects — it is wired up as soon as a connection
 * exists. Returns an unsubscribe function.
 */
export function subscribeChat(
  subject: string,
  onMessage: (payload: unknown) => void
): () => void {
  let handlers = subjectHandlers.get(subject);
  if (!handlers) {
    handlers = new Set();
    subjectHandlers.set(subject, handlers);
  }
  handlers.add(onMessage);
  ensureSubject(subject);
  return () => {
    handlers!.delete(onMessage);
    if (handlers!.size === 0) subjectHandlers.delete(subject);
  };
}

/** Close the shared socket (tests, teardown). */
export async function closeChatNats(): Promise<void> {
  if (connection) {
    await connection.close();
    connection = null;
  }
  activeSubjects.clear();
  setOnline(false);
}
