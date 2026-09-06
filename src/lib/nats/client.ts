/**
 * NATS Client
 *
 * Single NATS connection factory and event publishers.
 * All NATS operations in the web app go through this module.
 */

import { connect, NatsConnection, Msg } from "nats";
import { RoleChangedEvent, ROLE_CHANGED_SUBJECT } from "@/types/user-management";

let natsConnection: NatsConnection | null = null;

/**
 * Get NATS connection URL from environment
 */
function getNatsUrl(): string {
  return process.env.NATS_URL || "nats://localhost:4222";
}

/**
 * Get or create NATS connection.
 * Includes reconnect support and staleness detection.
 */
export async function getNatsConnection(): Promise<NatsConnection> {
  if (natsConnection) {
    if (!natsConnection.isClosed()) {
      return natsConnection;
    }
    // Reconnect attempts were exhausted: the cached connection is permanently
    // closed and must be replaced.
    natsConnection = null;
  }

  const url = getNatsUrl();
  try {
    natsConnection = await connect({
      servers: url,
      reconnect: true,
      maxReconnectAttempts: 10,
    });
    return natsConnection;
  } catch (error) {
    console.error("Failed to connect to NATS:", error);
    throw error;
  }
}

/**
 * Publish an arbitrary JSON payload to a NATS subject.
 * Returns true on success, false when NATS is unreachable.
 */
export async function publishJson(subject: string, payload: unknown): Promise<boolean> {
  try {
    const nc = await getNatsConnection();
    await nc.publish(subject, new TextEncoder().encode(JSON.stringify(payload)));
    return true;
  } catch (error) {
    console.error(`Failed to publish to NATS subject ${subject}:`, error);
    return false;
  }
}

/**
 * Publish a role changed event to NATS.
 */
export async function publishRoleChangedEvent(event: RoleChangedEvent): Promise<void> {
  try {
    const nc = await getNatsConnection();
    await nc.publish(ROLE_CHANGED_SUBJECT, new TextEncoder().encode(JSON.stringify(event)));
    console.log(`Published role_changed event for user ${event.userId}`);
  } catch (error) {
    console.error("Failed to publish role_changed event:", error);
    throw error;
  }
}

/**
 * NATS event payloads for verification decisions (LOC-0039)
 */
export interface VerificationApprovedEvent {
  businessId: string;
  timestamp: string;
}

export interface VerificationRejectedEvent {
  businessId: string;
  reason: string;
  timestamp: string;
}

/**
 * Publish a verification.approved event to NATS
 */
export async function publishVerificationApproved(businessId: string): Promise<void> {
  try {
    const nc = await getNatsConnection();
    const event: VerificationApprovedEvent = {
      businessId,
      timestamp: new Date().toISOString(),
    };
    await nc.publish("verification.approved", new TextEncoder().encode(JSON.stringify(event)));
    console.log(`Published verification.approved event for business ${businessId}`);
  } catch (error) {
    console.error("Failed to publish verification.approved event:", error);
    throw error;
  }
}

/**
 * Publish a verification.rejected event to NATS
 */
export async function publishVerificationRejected(businessId: string, reason: string): Promise<void> {
  try {
    const nc = await getNatsConnection();
    const event: VerificationRejectedEvent = {
      businessId,
      reason,
      timestamp: new Date().toISOString(),
    };
    await nc.publish("verification.rejected", new TextEncoder().encode(JSON.stringify(event)));
    console.log(`Published verification.rejected event for business ${businessId}`);
  } catch (error) {
    console.error("Failed to publish verification.rejected event:", error);
    throw error;
  }
}

/**
 * Subscribe to a NATS subject
 */
export async function subscribe(subject: string, callback: (msg: Msg) => void): Promise<void> {
  const nc = await getNatsConnection();
  const subscription = nc.subscribe(subject);
  (async () => {
    for await (const msg of subscription) {
      callback(msg);
    }
  })().catch((err: unknown) => {
    console.error("Subscription error:", err);
  });
}

/**
 * Check NATS connection health
 */
export async function checkNatsHealth(): Promise<boolean> {
  try {
    const nc = await getNatsConnection();
    await nc.request("$SYS.REQ.SERVER.PING", new TextEncoder().encode(""), {
      timeout: 5000,
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Close NATS connection
 */
export async function closeNatsConnection(): Promise<void> {
  if (natsConnection) {
    await natsConnection.close();
    natsConnection = null;
  }
}
