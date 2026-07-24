/**
 * Verification Service Tests
 *
 * Tests for the verification queue and admin review functionality.
 */

import { describe, it, expect, beforeEach, jest } from "@jest/globals";
import {
  createVerificationRecord,
  getPendingVerifications,
  approveVerification,
  rejectVerification,
  getVerificationHistory,
} from "./verification-service";

// Mock database
const mockPool = {
  execute: jest.fn(),
};

jest.mock("../db/database", () => ({
  getPool: () => mockPool,
}));

describe("Verification Service", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("createVerificationRecord", () => {
    it("should create a verification record and return the ID", async () => {
      const mockResult = { insertId: "ver-123" };
      mockPool.execute.mockResolvedValueOnce([mockResult, []]);

      const result = await createVerificationRecord(
        "biz-123",
        ["url1.pdf", "url2.pdf"]
      );

      expect(result).toBe("ver-123");
      expect(mockPool.execute).toHaveBeenCalledWith(
        expect.stringContaining("INSERT INTO business_verifications"),
        ["biz-123", expect.stringContaining("url1.pdf")]
      );
    });
  });

  describe("getPendingVerifications", () => {
    it("should return all pending verification records", async () => {
      const mockVerifications = [
        {
          id: "ver-1",
          businessId: "biz-1",
          documentUrls: '["url1.pdf"]',
          status: "pending",
          submittedAt: "2024-01-01T00:00:00Z",
        },
      ];
      const mockBusinesses = [{ id: "biz-1", name: "Test Business" }];

      mockPool.execute
        .mockResolvedValueOnce([mockVerifications, []])
        .mockResolvedValueOnce([mockBusinesses, []]);

      const result = await getPendingVerifications();

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe("ver-1");
      expect(result[0].businessName).toBe("Test Business");
      expect(result[0].status).toBe("pending");
    });

    it("should return empty array when no pending verifications", async () => {
      mockPool.execute.mockResolvedValueOnce([[], []]);

      const result = await getPendingVerifications();

      expect(result).toHaveLength(0);
    });
  });

  describe("approveVerification", () => {
    it("should approve a pending verification", async () => {
      const mockVerification = {
        id: "ver-1",
        status: "pending",
        business_id: "biz-1",
      };

      mockPool.execute
        .mockResolvedValueOnce([[mockVerification], []])
        .mockResolvedValueOnce([{}, []])
        .mockResolvedValueOnce([{}, []]);

      const result = await approveVerification({
        verificationId: "ver-1",
        reviewedBy: "admin-1",
      });

      expect(result.success).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it("should return error when verification not found", async () => {
      mockPool.execute.mockResolvedValueOnce([[], []]);

      const result = await approveVerification({
        verificationId: "ver-nonexistent",
        reviewedBy: "admin-1",
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe("Verification record not found");
    });

    it("should return error when verification already approved", async () => {
      const mockVerification = {
        id: "ver-1",
        status: "approved",
        business_id: "biz-1",
      };

      mockPool.execute.mockResolvedValueOnce([[mockVerification], []]);

      const result = await approveVerification({
        verificationId: "ver-1",
        reviewedBy: "admin-1",
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe("Verification is already approved");
    });
  });

  describe("rejectVerification", () => {
    it("should reject a pending verification with reason", async () => {
      const mockVerification = {
        id: "ver-1",
        status: "pending",
      };

      mockPool.execute
        .mockResolvedValueOnce([[mockVerification], []])
        .mockResolvedValueOnce([{}, []]);

      const result = await rejectVerification({
        verificationId: "ver-1",
        reviewedBy: "admin-1",
        reason: "Invalid documents",
      });

      expect(result.success).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it("should return error when verification not found", async () => {
      mockPool.execute.mockResolvedValueOnce([[], []]);

      const result = await rejectVerification({
        verificationId: "ver-nonexistent",
        reviewedBy: "admin-1",
        reason: "Invalid documents",
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe("Verification record not found");
    });

    it("should return error when reason is empty", async () => {
      const result = await rejectVerification({
        verificationId: "ver-1",
        reviewedBy: "admin-1",
        reason: "",
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe("Rejection reason is required");
    });

    it("should return error when reason is whitespace only", async () => {
      const result = await rejectVerification({
        verificationId: "ver-1",
        reviewedBy: "admin-1",
        reason: "   ",
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe("Rejection reason is required");
    });
  });

  describe("getVerificationHistory", () => {
    it("should return verification history for a business", async () => {
      const mockHistory = [
        {
          id: "ver-1",
          business_id: "biz-1",
          document_urls: '["url1.pdf"]',
          status: "approved",
          submitted_at: "2024-01-01T00:00:00Z",
          reviewed_at: "2024-01-02T00:00:00Z",
          reviewed_by: "admin-1",
          rejection_reason: null,
        },
        {
          id: "ver-2",
          business_id: "biz-1",
          document_urls: '["url2.pdf"]',
          status: "rejected",
          submitted_at: "2024-01-03T00:00:00Z",
          reviewed_at: "2024-01-04T00:00:00Z",
          reviewed_by: "admin-1",
          rejection_reason: "Invalid documents",
        },
      ];

      mockPool.execute.mockResolvedValueOnce([mockHistory, []]);

      const result = await getVerificationHistory("biz-1");

      expect(result).toHaveLength(2);
      expect(result[0].status).toBe("approved");
      expect(result[1].status).toBe("rejected");
      expect(result[1].rejectionReason).toBe("Invalid documents");
    });

    it("should return empty array when no history", async () => {
      mockPool.execute.mockResolvedValueOnce([[], []]);

      const result = await getVerificationHistory("biz-nonexistent");

      expect(result).toHaveLength(0);
    });
  });
});
