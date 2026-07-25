/**
 * Moderation Review Integration Tests
 *
 * Tests for the admin review moderation GraphQL mutations.
 */

import { describe, it, expect, beforeEach, jest } from "@jest/globals";

// Mock database before importing resolvers
const mockPool = {
  execute: jest.fn(),
};

jest.mock("../db/database", () => ({
  getPool: () => mockPool,
}));

// Mock moderation service
jest.mock("../moderation/moderation-service", () => ({
  getPendingReviews: jest.fn(),
  approveReview: jest.fn(),
  hideReview: jest.fn(),
}));

import { getPendingReviews, approveReview, hideReview } from "../moderation/moderation-service";
import { resolvers } from "./resolvers";

describe("Moderation Review GraphQL Mutations", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("approveReview mutation", () => {
    it("should successfully approve a review", async () => {
      (approveReview as jest.Mock).mockResolvedValueOnce({ success: true });

      const result = await (resolvers.Mutation as any).approveReview(
        null,
        { reviewId: "rev-1", reviewedBy: "admin-1" }
      );

      expect(result.success).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it("should return error when approval fails", async () => {
      (approveReview as jest.Mock).mockResolvedValueOnce({
        success: false,
        error: "Review not found",
      });

      const result = await (resolvers.Mutation as any).approveReview(
        null,
        { reviewId: "rev-1", reviewedBy: "admin-1" }
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe("Review not found");
    });
  });

  describe("hideReview mutation", () => {
    it("should successfully hide a review with reason", async () => {
      (hideReview as jest.Mock).mockResolvedValueOnce({ success: true });

      const result = await (resolvers.Mutation as any).hideReview(
        null,
        { reviewId: "rev-1", reviewedBy: "admin-1", reason: "Inappropriate content" }
      );

      expect(result.success).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it("should return error when reason is missing", async () => {
      (hideReview as jest.Mock).mockResolvedValueOnce({
        success: false,
        error: "Hide reason is required",
      });

      const result = await (resolvers.Mutation as any).hideReview(
        null,
        { reviewId: "rev-1", reviewedBy: "admin-1", reason: "" }
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe("Hide reason is required");
    });

    it("should return error when hide fails", async () => {
      (hideReview as jest.Mock).mockResolvedValueOnce({
        success: false,
        error: "Review not found",
      });

      const result = await (resolvers.Mutation as any).hideReview(
        null,
        { reviewId: "rev-1", reviewedBy: "admin-1", reason: "Invalid content" }
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe("Review not found");
    });
  });

  describe("getPendingReviews query", () => {
    it("should return pending reviews with count", async () => {
      const mockPending = [
        {
          id: "rev-1",
          businessId: "biz-1",
          businessName: "Test Business",
          userId: "user-1",
          userName: "Test User",
          rating: 5,
          comment: "Great place!",
          status: "pending",
          createdAt: "2024-01-01T00:00:00Z",
        },
        {
          id: "rev-2",
          businessId: "biz-2",
          businessName: "Another Business",
          userId: "user-2",
          userName: "Another User",
          rating: 3,
          comment: "Okay experience",
          status: "pending",
          createdAt: "2024-01-02T00:00:00Z",
        },
      ];

      (getPendingReviews as jest.Mock).mockResolvedValueOnce(mockPending);

      const result = await (resolvers.Mutation as any).getPendingReviews();

      expect(result.pendingCount).toBe(2);
      expect(result.items).toHaveLength(2);
      expect(result.items[0].businessName).toBe("Test Business");
      expect(result.items[0].rating).toBe(5);
    });

    it("should return empty result when no pending reviews", async () => {
      (getPendingReviews as jest.Mock).mockResolvedValueOnce([]);

      const result = await (resolvers.Mutation as any).getPendingReviews();

      expect(result.pendingCount).toBe(0);
      expect(result.items).toHaveLength(0);
    });
  });
});
