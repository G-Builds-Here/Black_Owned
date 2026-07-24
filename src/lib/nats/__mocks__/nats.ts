/**
 * Mock for NATS client
 */

import { jest } from "@jest/globals";

export interface NatsConnection {
  jetstream: () => any;
  close: () => Promise<void>;
}

export interface ConsumerInfo {
  name: string;
  num_pending: number;
  pending: number;
  info?: {
    delivered?: {
      timestamp?: string;
    };
    ack_floor?: {
      timestamp?: string;
    };
  };
}

export interface StreamInfo {
  config: {
    name: string;
  };
  consumers: () => AsyncIterable<ConsumerInfo>;
}

export interface JetStreamManager {
  streams: () => any;
  get: (name: string) => Promise<StreamInfo>;
}

// Mock connect function
export const connect = jest.fn();

export { connect as NatsConnection };
