/**
 * NATS Client
 *
 * Provides NATS connection and publishing functionality for event-driven architecture.
 */

import * as nats from "nats";
import { Msg } from "nats";
type Client = nats.NatsConnection;
import { RoleChangedEvent, ROLE_CHANGED_SUBJECT } from "../../types/user-management";

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
 * Check NATS connection health and return detailed status
 */
export async function checkNatsHealth(): Promise<{ healthy: boolean; latencyMs?: number }> {
  try {
    const client = await getNatsClient();
    const startTime = Date.now();
    // Send a ping to verify connection
    await client.request("$SYS.REQ.SERVER.PING", Buffer.from(""), {
      timeout: 5000,
    });
    const latencyMs = Date.now() - startTime;
    return { healthy: true, latencyMs };
  } catch {
    return { healthy: false };
  }
}
