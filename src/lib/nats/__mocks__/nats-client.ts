/**
 * Mock for NATS client module
 */

// Create a mock subscription that is async iterable
function createMockSubscription() {
  let closed = false;
  return {
    async next() {
      if (closed) {
        return { done: true, value: undefined };
      }
      // Wait forever until closed
      return new Promise(() => {});
    },
    return() {
      closed = true;
      return Promise.resolve({ done: true, value: undefined });
    },
    [Symbol.asyncIterator]() {
      return this;
    },
  };
}

export const subscribe = jest.fn().mockResolvedValue(createMockSubscription());

export const sendMessage = jest.fn().mockResolvedValue();
export const subscribeToMessages = jest.fn();
export const getNatsClient = jest.fn().mockResolvedValue({
  publish: jest.fn(),
  subscribe: jest.fn().mockResolvedValue(createMockSubscription()),
  request: jest.fn().mockResolvedValue({ data: Buffer.from('') }),
  close: jest.fn(),
});
export const closeNatsConnection = jest.fn().mockResolvedValue();
export const checkNatsHealth = jest.fn().mockResolvedValue(true);
