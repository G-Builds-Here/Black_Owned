/**
 * NATS Monitor Tests
 *
 * Tests for the NATS consumer monitoring functionality.
 */

import { getConsumerStatuses, checkMonitorHealth } from "./nats-monitor";

// Mock the nats module
jest.mock("nats", () => ({
  connect: jest.fn(),
}));

const nats = require("nats") as any;

describe("NATS Monitor", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("getConsumerStatuses", () => {
    it("should return empty array when no streams exist", async () => {
      const mockStreamLister = {
        [Symbol.asyncIterator]: async function* () {
          // No streams
        },
      };

      // Create a function that also has a `get` property
      const mockStreamsFn = jest.fn().mockReturnValue(mockStreamLister);
      mockStreamsFn.get = jest.fn();

      const mockJetStream = {
        streams: mockStreamsFn,
      };

      const mockConnection = {
        jetstream: jest.fn().mockReturnValue(mockJetStream),
        close: jest.fn(),
      };

      nats.connect.mockResolvedValue(mockConnection);

      const result = await getConsumerStatuses();

      expect(result).toEqual([]);
      expect(mockConnection.close).toHaveBeenCalled();
    });

    it("should return consumer statuses for each consumer in each stream", async () => {
      const mockConsumerInfo1 = {
        name: "consumer-1",
        num_pending: 0,
      };

      const mockConsumerInfo2 = {
        name: "consumer-2",
        num_pending: 142,
      };

      const mockStreamInfo1 = {
        config: {
          name: "stream-1",
        },
        consumers: jest.fn().mockImplementation(() => ({
          [Symbol.asyncIterator]: async function* () {
            yield mockConsumerInfo1;
            yield mockConsumerInfo2;
          },
        })),
      };

      const mockStreamLister = {
        [Symbol.asyncIterator]: async function* () {
          yield mockStreamInfo1;
        },
      };

      // Create a function that also has a `get` property
      const mockStreamsFn = jest.fn().mockReturnValue(mockStreamLister);
      mockStreamsFn.get = jest.fn().mockResolvedValue(mockStreamInfo1);

      const mockJetStream = {
        streams: mockStreamsFn,
      };

      const mockConnection = {
        jetstream: jest.fn().mockReturnValue(mockJetStream),
        close: jest.fn(),
      };

      nats.connect.mockResolvedValue(mockConnection);

      const result = await getConsumerStatuses();

      expect(result).toHaveLength(2);
      expect(result[0]).toMatchObject({
        streamName: "stream-1",
        consumerName: "consumer-1",
        pendingCount: 0,
        status: "healthy",
      });
      expect(result[1]).toMatchObject({
        streamName: "stream-1",
        consumerName: "consumer-2",
        pendingCount: 142,
        status: "warning",
      });
    });

    it("should mark consumers with 100+ pending as warning", async () => {
      const mockConsumerInfo = {
        name: "high-lag-consumer",
        num_pending: 150,
      };

      const mockStreamInfo = {
        config: {
          name: "orders",
        },
        consumers: jest.fn().mockImplementation(() => ({
          [Symbol.asyncIterator]: async function* () {
            yield mockConsumerInfo;
          },
        })),
      };

      const mockStreamLister = {
        [Symbol.asyncIterator]: async function* () {
          yield mockStreamInfo;
        },
      };

      // Create a function that also has a `get` property
      const mockStreamsFn = jest.fn().mockReturnValue(mockStreamLister);
      mockStreamsFn.get = jest.fn().mockResolvedValue(mockStreamInfo);

      const mockJetStream = {
        streams: mockStreamsFn,
      };

      const mockConnection = {
        jetstream: jest.fn().mockReturnValue(mockJetStream),
        close: jest.fn(),
      };

      nats.connect.mockResolvedValue(mockConnection);

      const result = await getConsumerStatuses();

      expect(result[0].status).toBe("warning");
      expect(result[0].pendingCount).toBe(150);
    });

    it("should mark consumers with 0 pending as healthy", async () => {
      const mockConsumerInfo = {
        name: "healthy-consumer",
        num_pending: 0,
      };

      const mockStreamInfo = {
        config: {
          name: "events",
        },
        consumers: jest.fn().mockImplementation(() => ({
          [Symbol.asyncIterator]: async function* () {
            yield mockConsumerInfo;
          },
        })),
      };

      const mockStreamLister = {
        [Symbol.asyncIterator]: async function* () {
          yield mockStreamInfo;
        },
      };

      // Create a function that also has a `get` property
      const mockStreamsFn = jest.fn().mockReturnValue(mockStreamLister);
      mockStreamsFn.get = jest.fn().mockResolvedValue(mockStreamInfo);

      const mockJetStream = {
        streams: mockStreamsFn,
      };

      const mockConnection = {
        jetstream: jest.fn().mockReturnValue(mockJetStream),
        close: jest.fn(),
      };

      nats.connect.mockResolvedValue(mockConnection);

      const result = await getConsumerStatuses();

      expect(result[0].status).toBe("healthy");
      expect(result[0].pendingCount).toBe(0);
    });
  });

  describe("checkMonitorHealth", () => {
    it("should return true when NATS is reachable", async () => {
      const mockConnection = {
        close: jest.fn(),
      };

      nats.connect.mockResolvedValue(mockConnection);

      const result = await checkMonitorHealth();

      expect(result).toBe(true);
    });

    it("should return false when NATS is unreachable", async () => {
      nats.connect.mockRejectedValue(new Error("Connection refused"));

      const result = await checkMonitorHealth();

      expect(result).toBe(false);
    });
  });
});
