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

/**
 * Subscribe to a subject with a JSON callback. Returns an unsubscribe
 * function; a no-op when the socket is not connected.
 */
export function subscribeChat(
  subject: string,
  onMessage: (payload: unknown) => void
): () => void {
  if (!connection || connection.isClosed()) {
    return () => {};
  }
  const sub: Subscription = connection.subscribe(subject);
  (async () => {
    for await (const msg of sub) {
      try {
        onMessage(JSON.parse(msg.string()));
      } catch {
        // ignore malformed payloads
      }
    }
  })().catch(() => {});
  return () => {
    sub.unsubscribe();
  };
}

/** Close the shared socket (tests, teardown). */
export async function closeChatNats(): Promise<void> {
  if (connection) {
    await connection.close();
    connection = null;
  }
  setOnline(false);
}
