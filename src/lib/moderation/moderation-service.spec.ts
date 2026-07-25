/**
 * Moderation Service Tests
 *
 * Tests for the admin review moderation queue functionality.
 */

import { describe, it, expect, beforeEach, jest } from "@jest/globals";

// Mock database before importing service
const mockPool = {
  execute: jest.fn(),
};

jest.mock("../db/database", () => ({
  getPool: () => mockPool,
}));

import {
  getPendingReviews,
  approveReview,
  hideReview,
  createReviewRecord,
  getPendingReviewCount,
} from "./moderation-service";

describe("Moderation Service", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("createReviewRecord", () => {
    it("should create a new pending review record", async () => {
      mockPool.execute.mockResolvedValueOnce({ insertId: "rev-123" });

      const reviewId = await createReviewRecord(
        "biz-123",
        "user-456",
        5,
        "Great place!"
      );

      expect(reviewId).toBe("rev-123");
      expect(mockPool.execute).toHaveBeenCalledWith(
        "INSERT INTO reviews (business_id, user_id, rating, comment, status, visible, created_at) VALUES (?, ?, ?, ?, 'pending', true, NOW())",
        ["biz-123", "user-456", 5, "Great place!"]
      );
    });
  });

  describe("getPendingReviews", () => {
    it("should return pending reviews sorted oldest-first", async () => {
      const mockRows = [
        {
          id: "rev-1",
          businessId: "biz-1",
          userId: "user-1",
          rating: 5,
          comment: "Great!",
          status: "pending",
          visible: true,
          createdAt: "2024-01-01T00:00:00Z",
        },
        {
          id: "rev-2",
          businessId: "biz-2",
          userId: "user-2",
          rating: 3,
          comment: "Okay",
          status: "pending",
          visible: true,
          createdAt: "2024-01-02T00:00:00Z",
        },
      ];

      mockPool.execute
        .mockResolvedValueOnce([mockRows, []])
        .mockResolvedValueOnce([
          [
            { id: "biz-1", name: "Business 1" },
            { id: "biz-2", name: "Business 2" },
          ],
          [],
        ])
        .mockResolvedValueOnce([
          [
            { id: "user-1", name: "User 1" },
            { id: "user-2", name: "User 2" },
          ],
          [],
        ]);

      const result = await getPendingReviews();

      expect(result).toHaveLength(2);
      expect(result[0].id).toBe("rev-1");
      expect(result[0].businessName).toBe("Business 1");
      expect(result[0].userName).toBe("User 1");
      expect(result[1].id).toBe("rev-2");
    });

    it("should return empty array when no pending reviews", async () => {
      mockPool.execute.mockResolvedValueOnce([[], []]);

      const result = await getPendingReviews();

      expect(result).toHaveLength(0);
    });
  });

  describe("approveReview", () => {
    it("should successfully approve a pending review", async () => {
      mockPool.execute
        .mockResolvedValueOnce([[{ id: "rev-1", status: "pending" }], []])
        .mockResolvedValueOnce([{}, []]);

      const result = await approveReview({
        reviewId: "rev-1",
        reviewedBy: "admin-1",
      });

      expect(result.success).toBe(true);
      expect(result.error).toBeUndefined();
      expect(mockPool.execute).toHaveBeenCalledWith(
        "UPDATE reviews SET status = 'approved', reviewed_at = NOW(), reviewed_by = ? WHERE id = ?",
        ["admin-1", "rev-1"]
      );
    });

    it("should return error when review not found", async () => {
      mockPool.execute.mockResolvedValueOnce([[], []]);

      const result = await approveReview({
        reviewId: "rev-nonexistent",
        reviewedBy: "admin-1",
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe("Review not found");
    });

    it("should return error when review is already approved", async () => {
      mockPool.execute.mockResolvedValueOnce([[{ id: "rev-1", status: "approved" }], []]);

      const result = await approveReview({
        reviewId: "rev-1",
        reviewedBy: "admin-1",
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe("Review is already approved");
    });
  });

  describe("hideReview", () => {
    it("should successfully hide a review with reason", async () => {
      mockPool.execute
        .mockResolvedValueOnce([[{ id: "rev-1", status: "pending" }], []])
        .mockResolvedValueOnce([{}, []]);

      const result = await hideReview({
        reviewId: "rev-1",
        reviewedBy: "admin-1",
        reason: "Inappropriate content",
      });

      expect(result.success).toBe(true);
      expect(result.error).toBeUndefined();
      expect(mockPool.execute).toHaveBeenCalledWith(
        "UPDATE reviews SET status = 'hidden', visible = false, reviewed_at = NOW(), reviewed_by = ?, hide_reason = ? WHERE id = ?",
        ["admin-1", "Inappropriate content", "rev-1"]
      );
    });

    it("should return error when reason is missing", async () => {
      const result = await hideReview({
        reviewId: "rev-1",
        reviewedBy: "admin-1",
        reason: "",
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe("Hide reason is required");
    });

    it("should return error when review not found", async () => {
      mockPool.execute.mockResolvedValueOnce([[], []]);

      const result = await hideReview({
        reviewId: "rev-nonexistent",
        reviewedBy: "admin-1",
        reason: "Invalid content",
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe("Review not found");
    });

    it("should return error when review is already hidden", async () => {
      mockPool.execute.mockResolvedValueOnce([[{ id: "rev-1", status: "hidden" }], []]);

      const result = await hideReview({
        reviewId: "rev-1",
        reviewedBy: "admin-1",
        reason: "Invalid content",
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe("Review is already hidden");
    });
  });

  describe("getPendingReviewCount", () => {
    it("should return the count of pending reviews", async () => {
      mockPool.execute.mockResolvedValueOnce([[{ count: 12 }], []]);

      const count = await getPendingReviewCount();

      expect(count).toBe(12);
    });

    it("should return 0 when no pending reviews", async () => {
      mockPool.execute.mockResolvedValueOnce([[{ count: 0 }], []]);

      const count = await getPendingReviewCount();

      expect(count).toBe(0);
    });
  });
});
