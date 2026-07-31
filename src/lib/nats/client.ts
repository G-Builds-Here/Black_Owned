/**
 * NATS Client
 *
 * NATS messaging client for publishing events.
 */

import { connect, Connection, NatsConnection } from "nats";

let natsConnection: NatsConnection | null = null;

/**
 * NATS event payload for role changed event
 */
export interface RoleChangedEvent {
  user_id: string;
  old_role: string;
  new_role: string;
  changed_by: string;
  timestamp: string;
}

/**
 * Get or create NATS connection
 */
export async function getNatsConnection(): Promise<NatsConnection> {
  if (natsConnection) {
    return natsConnection;
  }

  const natsUrl = process.env.NATS_URL || "nats://localhost:4222";

  try {
    natsConnection = await connect({
      servers: natsUrl,
    });
    return natsConnection;
  } catch (error) {
    console.error("Failed to connect to NATS:", error);
    throw error;
  }
}

/**
 * Publish a role changed event to NATS
 */
export async function publishRoleChangedEvent(
  userId: string,
  oldRole: string,
  newRole: string,
  changedBy: string
): Promise<void> {
  try {
    const nc = await getNatsConnection();
    const event: RoleChangedEvent = {
      user_id: userId,
      old_role: oldRole,
      new_role: newRole,
      changed_by: changedBy,
      timestamp: new Date().toISOString(),
    };

    await nc.publish("user.role_changed", new TextEncoder().encode(JSON.stringify(event)));
    console.log(`Published role_changed event for user ${userId}: ${oldRole} -> ${newRole}`);
  } catch (error) {
    console.error("Failed to publish role_changed event:", error);
    throw error;
  }
}

/**
 * Publish a verification approved event to NATS
 */
export async function publishVerificationApprovedEvent(
  businessId: string,
  approvedBy: string
): Promise<void> {
  try {
    const nc = await getNatsConnection();
    const event = {
      businessId,
      approvedBy,
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
 * Close NATS connection
 */
export async function closeNatsConnection(): Promise<void> {
  if (natsConnection) {
    await natsConnection.close();
    natsConnection = null;
  }
}
