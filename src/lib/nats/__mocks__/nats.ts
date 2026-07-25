/**
 * Mock for NATS client module
 */

// Mock the nats package
export const connect = jest.fn().mockResolvedValue({
  publish: jest.fn(),
  subscribe: jest.fn().mockResolvedValue({
    [Symbol.asyncIterator]: async function* () {
      // Empty iterator for testing
      return;
    },
  }),
  request: jest.fn().mockResolvedValue({ data: Buffer.from('') }),
  close: jest.fn(),
});

export type Msg = unknown;
