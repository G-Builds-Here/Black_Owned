/**
 * Mock NATS module for testing
 */

export const connect = jest.fn();

// Export type aliases as value exports for Jest
export type NatsConnection = any;
export type ConsumerInfo = any;
export type StreamInfo = any;
