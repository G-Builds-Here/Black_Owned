/**
 * Cache Invalidator Unit Tests
 *
 * Run with: npm test -- cache-invalidator.spec
 */

// Mock NATS client before importing
let mockSubscribeCallCount = 0;
const mockSubscription = { unsubscribe: jest.fn() };
const mockSubscribe = jest.fn(() => {
  mockSubscribeCallCount++;
  return mockSubscription;
});
const mockNatsConnection = {
  subscribe: mockSubscribe,
};

jest.mock("./client", () => {
  return {
    getNatsConnection: jest.fn().mockResolvedValue(mockNatsConnection),
  };
});

// Mock Valkey client
const mockDel = jest.fn();
jest.mock("../valkey/valkey-client", () => {
  return {
    getValkey: jest.fn(() => ({
      del: mockDel,
    })),
  };
});

import { subscribeToCacheInvalidation, unsubscribeFromCacheInvalidation, resetCacheInvalidationSubscription } from "./cache-invalidator";

describe("Cache Invalidator", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSubscribe.mockClear();
    mockDel.mockClear();
    resetCacheInvalidationSubscription();
  });

  afterEach(async () => {
    await unsubscribeFromCacheInvalidation();
    resetCacheInvalidationSubscription();
  });

  describe("subscribeToCacheInvalidation", () => {
    it("should subscribe to cache.invalidate subject", async () => {
      await subscribeToCacheInvalidation();

      expect(mockNatsConnection.subscribe).toHaveBeenCalledWith(
        "cache.invalidate",
        expect.objectContaining({
          callback: expect.any(Function),
        })
      );
    });

    it("should not create duplicate subscriptions", async () => {
      // First call should subscribe
      await subscribeToCacheInvalidation();
      const firstCallCount = mockSubscribe.mock.calls.length;

      // Reset mock to track only subsequent calls
      mockSubscribe.mockClear();

      // Second call should not subscribe again (subscription already active)
      await subscribeToCacheInvalidation();
      const secondCallCount = mockSubscribe.mock.calls.length;

      expect(firstCallCount).toBe(1);
      expect(secondCallCount).toBe(0);
    });

    it("should delete the Valkey key when receiving a valid event", async () => {
      await subscribeToCacheInvalidation();

      // Get the callback from the subscribe call
      const subscribeCall = mockSubscribe.mock.calls[0];
      const callback = (subscribeCall as any)[1].callback;

      // Simulate a cache invalidation event
      const mockData = Buffer.from(JSON.stringify({ key: "cache:biz-123" }));
      // NATS delivers (err, msg); the handler reads msg.data.
      await callback(null, { data: mockData });

      expect(mockDel).toHaveBeenCalledWith("cache:biz-123");
    });

    it("should handle events with missing key gracefully", async () => {
      await subscribeToCacheInvalidation();

      const subscribeCall = mockSubscribe.mock.calls[0];
      const callback = (subscribeCall as any)[1].callback;

      // Simulate an event without a key
      const mockData = Buffer.from(JSON.stringify({}));
      // NATS delivers (err, msg); the handler reads msg.data.
      await callback(null, { data: mockData });

      expect(mockDel).not.toHaveBeenCalled();
    });

    it("should handle JSON parse errors gracefully", async () => {
      await subscribeToCacheInvalidation();

      const subscribeCall = mockSubscribe.mock.calls[0];
      const callback = (subscribeCall as any)[1].callback;

      // Simulate invalid JSON
      const mockData = Buffer.from("invalid json");
      // NATS delivers (err, msg); the handler reads msg.data.
      await callback(null, { data: mockData });

      expect(mockDel).not.toHaveBeenCalled();
    });

    it("should handle Valkey errors gracefully", async () => {
      mockDel.mockRejectedValue(new Error("Valkey connection failed"));

      await subscribeToCacheInvalidation();

      const subscribeCall = mockSubscribe.mock.calls[0];
      const callback = (subscribeCall as any)[1].callback;

      const mockData = Buffer.from(JSON.stringify({ key: "cache:test" }));
      // NATS delivers (err, msg); the handler reads msg.data.
      await callback(null, { data: mockData });

      expect(mockDel).toHaveBeenCalledWith("cache:test");
    });
  });

  describe("unsubscribeFromCacheInvalidation", () => {
    it("should unsubscribe from the NATS subject", async () => {
      const mockUnsubscribe = jest.fn();
      mockSubscribe.mockReturnValue({ unsubscribe: mockUnsubscribe });

      await subscribeToCacheInvalidation();
      await unsubscribeFromCacheInvalidation();

      expect(mockUnsubscribe).toHaveBeenCalled();
    });

    it("should handle multiple unsubscribe calls gracefully", async () => {
      const mockUnsubscribe = jest.fn();
      mockSubscribe.mockReturnValue({ unsubscribe: mockUnsubscribe });

      await subscribeToCacheInvalidation();
      await unsubscribeFromCacheInvalidation();
      await unsubscribeFromCacheInvalidation();

      expect(mockUnsubscribe).toHaveBeenCalledTimes(1);
    });
  });
});
