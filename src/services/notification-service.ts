/**
 * Notification Service
 *
 * Handles NATS message events and triggers in-app notification banners.
 */

import { connect, NatsConnection, Msg } from "nats";
import type { NotificationBannerData } from "../components/ui/NotificationBanner";

/**
 * NATS message event payload
 */
export interface MessageEvent {
  business_name: string;
  message_content: string;
  user_id: string;
  timestamp: string;
}

/**
 * Notification callback type
 */
export type NotificationCallback = (businessName: string, messagePreview: string) => void;

let natsConnection: NatsConnection | null = null;
let messageSubscription: any = null;
const MAX_PREVIEW_LENGTH = 50;

/**
 * Get NATS connection URL from environment
 */
function getNatsUrl(): string {
  return process.env.NATS_URL || "nats://localhost:4222";
}

/**
 * Truncate message to preview length
 */
function createPreview(content: string, maxLength: number = MAX_PREVIEW_LENGTH): string {
  if (content.length <= maxLength) {
    return content;
  }
  return content.slice(0, maxLength) + "...";
}

/**
 * Get or create NATS connection
 */
async function getNatsConnection(): Promise<NatsConnection> {
  if (natsConnection) {
    return natsConnection;
  }

  const natsUrl = getNatsUrl();

  try {
    natsConnection = await connect({
      servers: natsUrl,
    });
    console.log("Connected to NATS at", natsUrl);
    return natsConnection;
  } catch (error) {
    console.error("Failed to connect to NATS:", error);
    throw error;
  }
}

/**
 * Subscribe to message events from NATS
 * Calls the provided callback when a new message arrives
 */
export async function subscribeToMessageEvents(callback: NotificationCallback): Promise<void> {
  try {
    const nc = await getNatsConnection();

    // Unsubscribe from previous subscription if exists
    if (messageSubscription) {
      await messageSubscription.unsubscribe();
    }

    // Subscribe to message events
    messageSubscription = nc.subscribe("message.new", {
      max: 1000, // Limit messages to prevent overflow
    });

    (async () => {
      for await (const msg: Msg of messageSubscription) {
        try {
          const data = JSON.parse(new TextDecoder().decode(msg.data));
          const businessName = data.business_name || "Unknown Business";
          const content = data.message_content || "";
          const preview = createPreview(content);

          console.log(`New message notification: ${businessName} - ${preview}`);
          callback(businessName, preview);
        } catch (error) {
          console.error("Failed to process message event:", error);
        }
      }
    })().catch((err) => {
      console.error("Subscription error:", err);
    });

    console.log("Subscribed to message.new events on NATS");
  } catch (error) {
    console.error("Failed to subscribe to message events:", error);
    throw error;
  }
}

/**
 * Unsubscribe from message events
 */
export async function unsubscribeFromMessageEvents(): Promise<void> {
  if (messageSubscription) {
    await messageSubscription.unsubscribe();
    messageSubscription = null;
    console.log("Unsubscribed from message events");
  }
}

/**
 * Publish a new message event to NATS (for testing)
 */
export async function publishMessageEvent(
  businessName: string,
  messageContent: string,
  userId: string
): Promise<void> {
  try {
    const nc = await getNatsConnection();
    const event: MessageEvent = {
      business_name: businessName,
      message_content: messageContent,
      user_id: userId,
      timestamp: new Date().toISOString(),
    };

    await nc.publish(
      "message.new",
      new TextEncoder().encode(JSON.stringify(event))
    );
    console.log(`Published message event from ${businessName}`);
  } catch (error) {
    console.error("Failed to publish message event:", error);
    throw error;
  }
}

/**
 * Check notification service health
 */
export async function checkNotificationHealth(): Promise<boolean> {
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

/**
 * Close NATS connection
 */
export async function closeNotificationConnection(): Promise<void> {
  if (natsConnection) {
    await natsConnection.close();
    natsConnection = null;
    console.log("Closed NATS connection for notifications");
  }
}
