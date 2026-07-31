/**
 * NATS Monitor
 *
 * Provides stream and consumer monitoring functionality for the admin console.
 */

import { connect, NatsConnection, ConsumerInfo, StreamInfo } from "nats";

/**
 * Consumer info with stream context
 */
export interface ConsumerStatus {
  streamName: string;
  consumerName: string;
  pendingCount: number;
  oldestAgeMs: number | null;
  status: "healthy" | "warning";
}

/**
 * Get NATS connection URL from environment
 */
function getNatsUrl(): string {
  return process.env.NATS_URL || "nats://localhost:4222";
}

/**
 * Fetch all stream names from NATS
 */
async function getStreamNames(nc: NatsConnection): Promise<string[]> {
  const js = nc.jetstream();
  const streams: string[] = [];

  try {
    const streamLister = js.streams();
    for await (const info of streamLister) {
      streams.push(info.config.name);
    }
  } catch (error) {
    console.error("Failed to fetch stream names:", error);
    throw error;
  }

  return streams;
}

/**
 * Fetch consumer info for a given stream
 */
async function getConsumersForStream(
  nc: NatsConnection,
  streamName: string
): Promise<ConsumerInfo[]> {
  const js = nc.jetstream();
  const consumers: ConsumerInfo[] = [];

  try {
    const stream = await js.streams.get(streamName);
    const consumerLister = stream.consumers();

    for await (const info of consumerLister) {
      consumers.push(info);
    }
  } catch (error) {
    console.error(`Failed to fetch consumers for stream ${streamName}:`, error);
    // Return empty array on error - caller can handle
    return [];
  }

  return consumers;
}

/**
 * Calculate the age of the oldest unacknowledged message
 */
function calculateOldestAge(consumerInfo: ConsumerInfo): number | null {
  const info = consumerInfo as unknown as {
    info?: {
      delivered?: { timestamp?: string };
      ack_floor?: { timestamp?: string };
    };
  };

  // Check for pending messages with timestamps
  if (consumerInfo.pending === 0) {
    return null;
  }

  // Try to get age from delivered sequence info
  // The NATS JS client provides this in the consumer info
  const deliveredTs = (consumerInfo as any)?.info?.delivered?.timestamp;
  if (deliveredTs) {
    const deliveredDate = new Date(deliveredTs);
    const now = new Date();
    return now.getTime() - deliveredDate.getTime();
  }

  // Fallback: if there are pending messages but no timestamp info
  // We cannot determine age, return null
  return null;
}

/**
 * Determine status based on pending count
 */
function determineStatus(pendingCount: number): "healthy" | "warning" {
  return pendingCount >= 100 ? "warning" : "healthy";
}

/**
 * Fetch all consumer statuses across all streams
 */
export async function getConsumerStatuses(
  nc?: NatsConnection
): Promise<ConsumerStatus[]> {
  const shouldCloseConnection = !nc;
  const connection = nc || (await connect({ servers: getNatsUrl() }));

  try {
    const streamNames = await getStreamNames(connection);
    const statuses: ConsumerStatus[] = [];

    for (const streamName of streamNames) {
      const consumers = await getConsumersForStream(connection, streamName);

      for (const consumer of consumers) {
        const pendingCount = consumer.num_pending || 0;
        const oldestAgeMs = calculateOldestAge(consumer);
        const status = determineStatus(pendingCount);

        statuses.push({
          streamName,
          consumerName: consumer.name,
          pendingCount,
          oldestAgeMs,
          status,
        });
      }
    }

    return statuses;
  } finally {
    if (shouldCloseConnection) {
      await connection.close();
    }
  }
}

/**
 * Check NATS monitoring health
 */
export async function checkMonitorHealth(): Promise<boolean> {
  try {
    const nc = await connect({
      servers: getNatsUrl(),
      timeout: 5000,
    });
    await nc.close();
    return true;
  } catch {
    return false;
  }
}
