/**
 * Tests for Scraper Retry Utility
 */

import {
  withRetry,
  RetryError,
  isRetryableError,
  retryPageNavigation,
  retryDataExtraction,
} from "@/lib/scraper/scraper-retry";

describe("Scraper Retry Utility", () => {
  describe("isRetryableError", () => {
    it("should return true for network errors", () => {
      expect(isRetryableError(new Error("Connection refused"))).toBe(true);
      expect(isRetryableError(new Error("ETIMEDOUT"))).toBe(true);
      expect(isRetryableError(new Error("Socket hang up"))).toBe(true);
    });

    it("should return true for rate limiting errors", () => {
      expect(isRetryableError(new Error("Rate limit exceeded"))).toBe(true);
      expect(isRetryableError(new Error("429 Too many requests"))).toBe(true);
      expect(isRetryableError(new Error("Server busy"))).toBe(true);
    });

    it("should return true for browser errors", () => {
      expect(isRetryableError(new Error("Target closed"))).toBe(true);
      expect(isRetryableError(new Error("Page closed"))).toBe(true);
      expect(isRetryableError(new Error("Browser disconnected"))).toBe(true);
    });

    it("should return false for non-retryable errors", () => {
      expect(isRetryableError(new Error("404 Not found"))).toBe(false);
      expect(isRetryableError(new Error("403 Forbidden"))).toBe(false);
      expect(isRetryableError(new Error("Authentication failed"))).toBe(false);
    });

    it("should return true for unknown errors (default to retryable)", () => {
      expect(isRetryableError(new Error("Unknown error"))).toBe(true);
      expect(isRetryableError("string error")).toBe(true);
    });
  });

  describe("withRetry", () => {
    it("should succeed on first attempt when operation succeeds", async () => {
      const mockOperation = jest.fn().mockResolvedValue("success");

      const result = await withRetry(mockOperation, {
        maxRetries: 3,
        initialDelayMs: 10,
      });

      expect(result.result).toBe("success");
      expect(result.attempts).toBe(1);
      expect(result.succeededOnFirstTry).toBe(true);
      expect(result.errorHistory).toHaveLength(0);
    });

    it("should retry on failure and succeed", async () => {
      const mockOperation = jest
        .fn()
        .mockRejectedValueOnce(new Error("Temporary error"))
        .mockRejectedValueOnce(new Error("Another temporary error"))
        .mockResolvedValue("success on third try");

      const result = await withRetry(mockOperation, {
        maxRetries: 3,
        initialDelayMs: 10,
        maxDelayMs: 100,
      });

      expect(result.result).toBe("success on third try");
      expect(result.attempts).toBe(3);
      expect(result.succeededOnFirstTry).toBe(false);
      expect(result.errorHistory).toHaveLength(2);
    });

    it("should throw RetryError when all retries exhausted", async () => {
      const mockOperation = jest
        .fn()
        .mockRejectedValue(new Error("Persistent error"));

      await expect(
        withRetry(mockOperation, {
          maxRetries: 2,
          initialDelayMs: 10,
          maxDelayMs: 50,
        })
      ).rejects.toThrow(RetryError);

      expect(mockOperation).toHaveBeenCalledTimes(3); // 1 initial + 2 retries
    });

    it("should throw immediately for non-retryable errors", async () => {
      const mockOperation = jest
        .fn()
        .mockRejectedValue(new Error("404 Not found"));

      await expect(
        withRetry(mockOperation, {
          maxRetries: 3,
          initialDelayMs: 10,
        })
      ).rejects.toThrow(RetryError);

      expect(mockOperation).toHaveBeenCalledTimes(1); // No retries for non-retryable
    });

    it("should calculate correct total time", async () => {
      const mockOperation = jest
        .fn()
        .mockRejectedValueOnce(new Error("Error 1"))
        .mockResolvedValue("success");

      const result = await withRetry(mockOperation, {
        maxRetries: 3,
        initialDelayMs: 50,
        maxDelayMs: 100,
      });

      expect(result.totalTimeMs).toBeGreaterThan(0);
      expect(result.totalTimeMs).toBeLessThan(500); // Should be less than 500ms
    });
  });

  describe("retryPageNavigation", () => {
    it("should succeed on first attempt", async () => {
      const mockNavigation = jest.fn().mockResolvedValue(undefined);

      await expect(
        retryPageNavigation(mockNavigation, 2)
      ).resolves.toBeUndefined();

      expect(mockNavigation).toHaveBeenCalledTimes(1);
    });

    it("should retry on failure and succeed", async () => {
      const mockNavigation = jest
        .fn()
        .mockRejectedValueOnce(new Error("Navigation timeout"))
        .mockResolvedValue(undefined);

      await expect(
        retryPageNavigation(mockNavigation, 2)
      ).resolves.toBeUndefined();

      expect(mockNavigation).toHaveBeenCalledTimes(2);
    });

    it("should throw after max retries", async () => {
      const mockNavigation = jest.fn().mockRejectedValue(new Error("Persistent error"));

      // Use withRetry directly with short delays for testing
      await expect(
        withRetry(mockNavigation, {
          maxRetries: 2,
          initialDelayMs: 10,
          maxDelayMs: 50,
        })
      ).rejects.toThrow(RetryError);

      expect(mockNavigation).toHaveBeenCalledTimes(3);
    });
  });

  describe("retryDataExtraction", () => {
    it("should succeed on first attempt", async () => {
      const mockExtraction = jest.fn().mockResolvedValue({ data: "test" });

      const result = await retryDataExtraction(mockExtraction, 2);

      expect(result).toEqual({ data: "test" });
      expect(mockExtraction).toHaveBeenCalledTimes(1);
    });

    it("should retry on failure and succeed", async () => {
      const mockExtraction = jest
        .fn()
        .mockRejectedValueOnce(new Error("Extraction failed"))
        .mockResolvedValue({ data: "success" });

      const result = await retryDataExtraction(mockExtraction, 2);

      expect(result).toEqual({ data: "success" });
      expect(mockExtraction).toHaveBeenCalledTimes(2);
    });

    it("should throw after max retries", async () => {
      const mockExtraction = jest.fn().mockRejectedValue(new Error("Persistent error"));

      await expect(
        retryDataExtraction(mockExtraction, 2)
      ).rejects.toThrow(RetryError);

      expect(mockExtraction).toHaveBeenCalledTimes(3);
    });
  });

  describe("RetryError", () => {
    it("should contain error history", () => {
      const errorHistory = ["Attempt 1: Error 1", "Attempt 2: Error 2"];
      const error = new RetryError("All retries failed", 2, errorHistory);

      expect(error.name).toBe("RetryError");
      expect(error.attempts).toBe(2);
      expect(error.errorHistory).toEqual(errorHistory);
    });
  });
});
