/**
 * NATS Client Tests
 *
 * Tests the NATS messaging client including message sending and subscription.
 */

import * as nats from "nats";
import {
  getNatsClient,
  closeNatsConnection,
  checkNatsHealth,
  sendMessage,
  subscribeToMessages,
} from "./nats-client";
import { SendMessagePayload, ReceivedMessagePayload } from "../../types/message";

// Mock the nats module
jest.mock("nats", () => ({
  connect: jest.fn(),
  subscribe: jest.fn(),
}));

describe("NATS Client", () => {
  const mockNatsConnection = {
    publish: jest.fn(),
    subscribe: jest.fn(),
    request: jest.fn(),
    close: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (nats.connect as jest.Mock).mockResolvedValue(mockNatsConnection);
  });

  afterEach(async () => {
    await closeNatsConnection();
  });

  describe("getNatsClient", () => {
    it("creates a new connection when none exists", async () => {
      const client = await getNatsClient();

      expect(nats.connect).toHaveBeenCalledWith(
        expect.objectContaining({
          servers: "nats://localhost:4222",
          reconnect: true,
          maxReconnectAttempts: 10,
        })
      );
      expect(client).toBe(mockNatsConnection);
    });

    it("returns cached connection on subsequent calls", async () => {
      const client1 = await getNatsClient();
      const client2 = await getNatsClient();

      expect(nats.connect).toHaveBeenCalledTimes(1);
      expect(client1).toBe(client2);
    });
  });

  describe("closeNatsConnection", () => {
    it("closes the connection and resets the client", async () => {
      await getNatsClient();
      await closeNatsConnection();

      expect(mockNatsConnection.close).toHaveBeenCalled();
    });
  });

  describe("checkNatsHealth", () => {
    it("returns true when connection is healthy", async () => {
      (mockNatsConnection.request as jest.Mock).mockResolvedValue({
        data: Buffer.from(""),
      });

      const health = await checkNatsHealth();

      expect(health).toBe(true);
      expect(mockNatsConnection.request).toHaveBeenCalledWith(
        "$SYS.REQ.SERVER.PING",
        expect.any(Buffer),
        expect.objectContaining({ timeout: 5000 })
      );
    });

    it("returns false when connection fails", async () => {
      (mockNatsConnection.request as jest.Mock).mockRejectedValue(
        new Error("Connection failed")
      );

      const health = await checkNatsHealth();

      expect(health).toBe(false);
    });
  });

  describe("sendMessage", () => {
    it("publishes message to NATS", async () => {
      const payload: SendMessagePayload = {
        conversationId: "conv-1",
        content: "Hello!",
        senderId: "user-1",
        type: "text",
      };

      await sendMessage(payload);

      expect(mockNatsConnection.publish).toHaveBeenCalledWith(
        "message.send",
        expect.any(Buffer)
      );
    });

    it("includes all payload fields in the message", async () => {
      const payload: SendMessagePayload = {
        conversationId: "conv-1",
        content: "Hello!",
        senderId: "user-1",
        type: "text",
      };

      await sendMessage(payload);

      const call = (mockNatsConnection.publish as jest.Mock).mock.calls[0];
      const messageData = JSON.parse(call[1].toString());

      expect(messageData).toMatchObject({
        conversationId: "conv-1",
        content: "Hello!",
        senderId: "user-1",
        type: "text",
      });
      expect(messageData.id).toBeDefined();
      expect(messageData.timestamp).toBeDefined();
    });

    it("generates unique message ID", async () => {
      const payload: SendMessagePayload = {
        conversationId: "conv-1",
        content: "Hello!",
        senderId: "user-1",
        type: "text",
      };

      await sendMessage(payload);

      const call = (mockNatsConnection.publish as jest.Mock).mock.calls[0];
      const messageData = JSON.parse(call[1].toString());

      expect(messageData.id).toMatch(/^msg-\d+$/);
    });
  });

  describe("subscribeToMessages", () => {
    it("subscribes to the message receive subject", () => {
      const mockSubscription = {
        [Symbol.asyncIterator]: jest.fn().mockReturnValue({
          next: jest.fn().mockResolvedValue({ done: true, value: undefined }),
        }),
      };
      (nats.subscribe as jest.Mock).mockReturnValue(mockSubscription);

      const callback = jest.fn();
      subscribeToMessages(callback);

      expect(nats.subscribe).toHaveBeenCalledWith("message.receive");
    });

    it("calls callback with parsed message payload", async () => {
      const receivedPayload: ReceivedMessagePayload = {
        id: "msg-1",
        conversationId: "conv-1",
        senderId: "user-2",
        content: "Hello!",
        type: "text",
        timestamp: Date.now(),
      };

      const mockMsg = {
        data: Buffer.from(JSON.stringify(receivedPayload)),
      };

      const mockSubscription = {
        [Symbol.asyncIterator]: jest.fn().mockReturnValue({
          next: jest.fn().mockResolvedValue({ done: true, value: mockMsg }),
        }),
      };
      (nats.subscribe as jest.Mock).mockReturnValue(mockSubscription);

      const callback = jest.fn();
      subscribeToMessages(callback);

      // Wait for async processing
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(callback).toHaveBeenCalledWith(receivedPayload);
    });

    it("handles malformed JSON gracefully", async () => {
      const mockMsg = {
        data: Buffer.from("invalid json"),
      };

      const mockSubscription = {
        [Symbol.asyncIterator]: jest.fn().mockReturnValue({
          next: jest.fn().mockResolvedValue({ done: true, value: mockMsg }),
        }),
      };
      (nats.subscribe as jest.Mock).mockReturnValue(mockSubscription);

      const callback = jest.fn();
      subscribeToMessages(callback);

      // Wait for async processing
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Callback should not be called for malformed JSON
      expect(callback).not.toHaveBeenCalled();
    });
  });
});
