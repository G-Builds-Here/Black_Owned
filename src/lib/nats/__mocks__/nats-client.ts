/**
 * NATS Client Mock
 *
 * Mock implementation for NATS client used in testing.
 * Provides controlled simulation of NATS connection and message handling.
 */

import type { Msg } from 'nats';

// Mock NATS client state
let mockClient: MockNatsClient | null = null;
let mockSubscriptions: Map<string, Array<(msg: MockMsg) => void>> = new Map();
let mockPublishedMessages: Array<{ subject: string; data: Buffer }> = [];

/**
 * Mock message class that mimics nats.Msg
 */
export class MockMsg {
  subject: string;
  data: Buffer;
  reply?: string;

  constructor(subject: string, data: Buffer, reply?: string) {
    this.subject = subject;
    this.data = data;
    this.reply = reply;
  }

  respond(data: Buffer): boolean {
    if (this.reply) {
      mockPublishedMessages.push({ subject: this.reply, data });
      return true;
    }
    return false;
  }
}

/**
 * Mock NATS client class
 */
class MockNatsClient {
  private closed = false;

  async publish(subject: string, data: Buffer): Promise<void> {
    if (this.closed) {
      throw new Error('Client is closed');
    }
    mockPublishedMessages.push({ subject, data });

    // Notify all subscribers for this subject
    const subscribers = mockSubscriptions.get(subject) || [];
    const msg = new MockMsg(subject, data);
    subscribers.forEach((callback) => callback(msg));
  }

  async request(subject: string, data: Buffer, options?: { timeout: number }): Promise<MockMsg> {
    if (this.closed) {
      throw new Error('Client is closed');
    }

    return new Promise((resolve, reject) => {
      const timeout = options?.timeout ?? 5000;

      setTimeout(() => {
        reject(new Error('Request timeout'));
      }, timeout);

      const subscribers = mockSubscriptions.get(subject) || [];
      const msg = new MockMsg(subject, data);
      subscribers.forEach((callback) => callback(msg));

      // Return a mock response
      resolve(new MockMsg(subject, Buffer.from('{"ack":true}')));
    });
  }

  subscribe(subject: string): AsyncIterable<MockMsg> {
    if (!mockSubscriptions.has(subject)) {
      mockSubscriptions.set(subject, []);
    }

    // Return an async iterable that yields messages
    const messages: MockMsg[] = [];
    let resolveNext: () => void;
    let nextPromise: Promise<void>;

    const iterable = {
      [Symbol.asyncIterator]() {
        return {
          async next() {
            if (nextPromise) {
              await nextPromise;
            }
            if (messages.length === 0) {
              return { done: true, value: undefined };
            }
            const msg = messages.shift()!;
            nextPromise = undefined;
            return { done: false, value: msg };
          },
          async return() {
            return { done: true, value: undefined };
          },
        };
      },
    };

    mockSubscriptions.get(subject)!.push((msg) => {
      messages.push(msg);
      if (resolveNext) {
        resolveNext();
        resolveNext = undefined;
      }
    });

    return iterable as unknown as AsyncIterable<MockMsg>;
  }

  async close(): Promise<void> {
    this.closed = true;
    mockClient = null;
  }
}

/**
 * Get or create mock NATS client
 */
export async function getNatsClient(): Promise<MockNatsClient> {
  if (mockClient) {
    return mockClient;
  }
  mockClient = new MockNatsClient();
  return mockClient;
}

/**
 * Close mock NATS connection
 */
export async function closeNatsConnection(): Promise<void> {
  if (mockClient) {
    await mockClient.close();
    mockClient = null;
  }
}

/**
 * Subscribe to a subject
 */
export async function subscribe(
  subject: string,
  callback: (msg: MockMsg) => void
): Promise<void> {
  if (!mockSubscriptions.has(subject)) {
    mockSubscriptions.set(subject, []);
  }
  mockSubscriptions.get(subject)!.push(callback);
}

/**
 * Publish a message
 */
export async function publish(subject: string, data: Buffer): Promise<void> {
  const client = await getNatsClient();
  await client.publish(subject, data);
}

/**
 * Reset all mock state
 */
export function resetMockNats(): void {
  mockClient = null;
  mockSubscriptions.clear();
  mockPublishedMessages = [];
}

/**
 * Get all published messages for verification
 */
export function getPublishedMessages(): Array<{ subject: string; data: Buffer }> {
  return [...mockPublishedMessages];
}

/**
 * Get all subscribers for a subject
 */
export function getSubscribers(subject: string): number {
  return mockSubscriptions.get(subject)?.length ?? 0;
}

/**
 * Check if client is connected
 */
export function isMockClientConnected(): boolean {
  return mockClient !== null;
}
