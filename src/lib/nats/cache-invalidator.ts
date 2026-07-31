/**
 * Cache Invalidator
 *
 * Subscribes to NATS cache.invalidate subject and deletes Valkey keys.
 */

import { getNatsConnection } from "./client";
import { getValkey } from "../valkey/valkey-client";

/**
 * NATS event payload for cache invalidation
 */
export interface CacheInvalidationEvent {
  key: string;
}

/**
 * Subscription handle for the cache invalidation subscriber
 */
let cacheInvalidationSubscription: any | null = null;

/**
 * Reset the subscription state (for testing)
 */
export function resetCacheInvalidationSubscription(): void {
  cacheInvalidationSubscription = null;
}

/**
 * Subscribe to cache invalidation events
 * When a message is published on `cache.invalidate`, the specified Valkey key is deleted.
 */
export async function subscribeToCacheInvalidation(): Promise<void> {
  const nc = await getNatsConnection();

  if (cacheInvalidationSubscription) {
    console.log("Cache invalidation subscription already active");
    return;
  }

  cacheInvalidationSubscription = nc.subscribe("cache.invalidate", {
    callback: async (msg) => {
      try {
        const msgData = (msg as { data?: Uint8Array }).data;
        const payload = Buffer.from(msgData ? msgData : "").toString("utf-8");
        const event: CacheInvalidationEvent = JSON.parse(payload);

        if (!event.key) {
          console.warn("Cache invalidation event missing key field");
          return;
        }

        const valkey = getValkey();
        const deleted = await valkey.del(event.key);

        console.log(
          `Cache invalidation: deleted key "${event.key}" (${deleted === 1 ? "success" : "key not found"})`
        );
      } catch (error) {
        console.error("Failed to process cache invalidation event:", error);
      }
    },
  });

  console.log("Subscribed to cache.invalidate NATS subject");
}

/**
 * Unsubscribe from cache invalidation events
 */
export async function unsubscribeFromCacheInvalidation(): Promise<void> {
  if (cacheInvalidationSubscription) {
    cacheInvalidationSubscription.unsubscribe();
    cacheInvalidationSubscription = null;
    console.log("Unsubscribed from cache.invalidate NATS subject");
  }
}
