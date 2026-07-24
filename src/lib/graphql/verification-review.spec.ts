/**
 * Verification Review Integration Tests
 *
 * Tests for the admin verification review GraphQL mutations.
 */

import { describe, it, expect, beforeEach, jest } from "@jest/globals";

// Mock database before importing resolvers
const mockPool = {
  execute: jest.fn(),
};

jest.mock("../db/database", () => ({
  getPool: () => mockPool,
}));

// Mock verification service
jest.mock("../verification/verification-service", () => ({
  getPendingVerifications: jest.fn(),
  approveVerification: jest.fn(),
  rejectVerification: jest.fn(),
}));

import { getPendingVerifications, approveVerification, rejectVerification } from "../verification/verification-service";
import { resolvers } from "./resolvers";

describe("Verification Review GraphQL Mutations", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("approveVerification mutation", () => {
    it("should successfully approve a verification", async () => {
      const mockVerification = {
        id: "ver-1",
        business_id: "biz-1",
        status: "pending",
      };

      mockPool.execute
        .mockResolvedValueOnce([[mockVerification], []])
        .mockResolvedValueOnce([{}, []])
        .mockResolvedValueOnce([[{ id: "biz-1", name: "Test Business", is_verified: true }], []]);

      (approveVerification as jest.Mock).mockResolvedValueOnce({ success: true });

      const result = await (resolvers.Mutation as any).approveVerification(
        null,
        { verificationId: "ver-1", reviewedBy: "admin-1" }
      );

      expect(result.success).toBe(true);
      expect(result.error).toBeUndefined();
      expect(result.business).toBeDefined();
    });

    it("should return error when approval fails", async () => {
      (approveVerification as jest.Mock).mockResolvedValueOnce({
        success: false,
        error: "Verification already approved",
      });

      const result = await (resolvers.Mutation as any).approveVerification(
        null,
        { verificationId: "ver-1", reviewedBy: "admin-1" }
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe("Verification already approved");
    });
  });

  describe("rejectVerification mutation", () => {
    it("should successfully reject a verification", async () => {
      (rejectVerification as jest.Mock).mockResolvedValueOnce({ success: true });

      const result = await (resolvers.Mutation as any).rejectVerification(
        null,
        { verificationId: "ver-1", reviewedBy: "admin-1", reason: "Invalid documents" }
      );

      expect(result.success).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it("should return error when rejection fails", async () => {
      (rejectVerification as jest.Mock).mockResolvedValueOnce({
        success: false,
        error: "Verification not found",
      });

      const result = await (resolvers.Mutation as any).rejectVerification(
        null,
        { verificationId: "ver-1", reviewedBy: "admin-1", reason: "Invalid documents" }
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe("Verification not found");
    });
  });

  describe("getPendingVerifications query", () => {
    it("should return pending verifications with count", async () => {
      const mockPending = [
        {
          id: "ver-1",
          businessId: "biz-1",
          businessName: "Test Business",
          documentUrls: ["url1.pdf"],
          status: "pending",
          submittedAt: "2024-01-01T00:00:00Z",
        },
        {
          id: "ver-2",
          businessId: "biz-2",
          businessName: "Another Business",
          documentUrls: ["url2.pdf"],
          status: "pending",
          submittedAt: "2024-01-02T00:00:00Z",
        },
      ];

      (getPendingVerifications as jest.Mock).mockResolvedValueOnce(mockPending);

      const result = await (resolvers.Mutation as any).getPendingVerifications();

      expect(result.pendingCount).toBe(2);
      expect(result.items).toHaveLength(2);
      expect(result.items[0].businessName).toBe("Test Business");
    });

    it("should return empty result when no pending verifications", async () => {
      (getPendingVerifications as jest.Mock).mockResolvedValueOnce([]);

      const result = await (resolvers.Mutation as any).getPendingVerifications();

      expect(result.pendingCount).toBe(0);
      expect(result.items).toHaveLength(0);
    });
  });
});
