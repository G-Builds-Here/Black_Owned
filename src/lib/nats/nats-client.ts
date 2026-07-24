/**
 * NATS Client
 *
 * Provides NATS connection and publishing functionality for event-driven architecture.
 */

import * as nats from "nats";
import { Msg } from "nats";
type Client = nats.NatsConnection;
import {
  RoleChangedEvent,
  ROLE_CHANGED_SUBJECT,
  VerificationApprovedEvent,
  VERIFICATION_APPROVED_SUBJECT,
} from "../../types/user-management";
import {
  MESSAGE_SEND_SUBJECT,
  MESSAGE_RECEIVE_SUBJECT,
  SendMessagePayload,
  ReceivedMessagePayload,
} from "../../types/message";

/**
 * NATS connection instance
 */
let natsClient: Client | null = null;

/**
 * Get NATS connection URL from environment
 */
function getNatsUrl(): string {
  return process.env.NATS_URL || "nats://localhost:4222";
}

/**
 * Get or create NATS client connection
 */
export async function getNatsClient(): Promise<Client> {
  if (natsClient) {
    return natsClient;
  }

  const url = getNatsUrl();
  natsClient = await nats.connect({
    servers: url,
    reconnect: true,
    maxReconnectAttempts: 10,
  });

  return natsClient;
}

/**
 * Close NATS connection
 */
export async function closeNatsConnection(): Promise<void> {
  if (natsClient) {
    natsClient.close();
    natsClient = null;
  }
}

/**
 * Publish a role changed event to NATS
 */
export async function publishRoleChangedEvent(
  event: RoleChangedEvent
): Promise<void> {
  const client = await getNatsClient();
  const payload = JSON.stringify(event);

  client.publish(ROLE_CHANGED_SUBJECT, Buffer.from(payload));
}

/**
 * Publish a verification approved event to NATS
 */
export async function publishVerificationApprovedEvent(
  event: VerificationApprovedEvent
): Promise<void> {
  const client = await getNatsClient();
  const payload = JSON.stringify(event);

  client.publish(VERIFICATION_APPROVED_SUBJECT, Buffer.from(payload));
}

/**
 * Subscribe to a NATS subject
 */
export async function subscribe(
  subject: string,
  callback: (msg: Msg) => void
): Promise<void> {
  const client = await getNatsClient();
  const subscription = client.subscribe(subject);

  (async () => {
    for await (const msg of subscription) {
      callback(msg);
    }
  })().catch((err) => {
    console.error("Subscription error:", err);
  });
}

/**
 * Check NATS connection health
 */
export async function checkNatsHealth(): Promise<boolean> {
  try {
    const client = await getNatsClient();
    // Send a ping to verify connection
    await client.request("$SYS.REQ.SERVER.PING", Buffer.from(""), {
      timeout: 5000,
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Send a message via NATS
 */
export async function sendMessage(payload: SendMessagePayload): Promise<void> {
  const client = await getNatsClient();
  const messagePayload: ReceivedMessagePayload = {
    id: `msg-${Date.now()}`,
    conversationId: payload.conversationId,
    senderId: payload.senderId,
    content: payload.content,
    type: payload.type,
    timestamp: Date.now(),
  };

  client.publish(MESSAGE_SEND_SUBJECT, Buffer.from(JSON.stringify(messagePayload)));
}

/**
 * Subscribe to incoming messages
 */
export function subscribeToMessages(
  callback: (payload: ReceivedMessagePayload) => void
): void {
  const subscription = nats.subscribe(MESSAGE_RECEIVE_SUBJECT);

  (async () => {
    for await (const msg of subscription) {
      try {
        const payload = JSON.parse(msg.data.toString()) as ReceivedMessagePayload;
        callback(payload);
      } catch (error) {
        console.error("Failed to parse message payload:", error);
      }
    }
  })().catch((err) => {
    console.error("Message subscription error:", err);
  });
}
