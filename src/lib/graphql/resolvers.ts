/**
 * GraphQL Resolvers
 */

import {
  register,
  login,
  refreshTokens,
} from "../auth/auth-service";
import { searchBusinesses, getBusinessById } from "../graphql/business-service";
import {
  submitVerification,
  minioService,
  resetMinioService,
} from "./resolvers";
import {
  getPendingVerifications,
  approveVerification,
  rejectVerification,
  VerificationQueueItem,
} from "../verification/verification-service";
import {
  getPendingReviews,
  approveReview,
  hideReview,
  ModerationQueueItem,
} from "../moderation/moderation-service";
import { getPool } from "../db/database";

/**
 * Root query resolver
 */
export const resolvers = {
  Query: {
    health: () => "OK",
    searchBusinesses,
    business: getBusinessById,
  },
  Mutation: {
    register,
    login,
    refreshTokens,
    submitVerification,
    /**
     * Approve a verification submission
     */
    approveVerification: async (
      _parent: unknown,
      args: { verificationId: string; reviewedBy: string }
    ) => {
      const { verificationId, reviewedBy } = args;

      const result = await approveVerification({
        verificationId,
        reviewedBy,
      });

      if (!result.success) {
        return {
          success: false,
          business: null,
          error: result.error || "Failed to approve verification",
        };
      }

      // Fetch the updated business
      const pool = getPool();
      const verificationRecord = await getVerificationRecord(verificationId);
      
      let business = null;
      if (verificationRecord) {
        const [rows] = await pool.execute(
          "SELECT * FROM businesses WHERE id = ?",
          [verificationRecord.businessId]
        );
        business = (rows as any[])[0] || null;
      }

      return {
        success: true,
        business,
        error: undefined,
      };
    },
    /**
     * Reject a verification submission
     */
    rejectVerification: async (
      _parent: unknown,
      args: { verificationId: string; reviewedBy: string; reason: string }
    ) => {
      const { verificationId, reviewedBy, reason } = args;

      const result = await rejectVerification({
        verificationId,
        reviewedBy,
        reason,
      });

      return {
        success: result.success,
        error: result.error || undefined,
      };
    },
    /**
     * Get all pending verifications for the admin queue
     */
    getPendingVerifications: async (): Promise<{
      pendingCount: number;
      items: VerificationQueueItem[];
    }> => {
      const items = await getPendingVerifications();
      return {
        pendingCount: items.length,
        items,
      };
    },
    /**
     * Approve a review submission
     */
    approveReview: async (
      _parent: unknown,
      args: { reviewId: string; reviewedBy: string }
    ) => {
      const { reviewId, reviewedBy } = args;

      const result = await approveReview({
        reviewId,
        reviewedBy,
      });

      return {
        success: result.success,
        error: result.error || undefined,
      };
    },
    /**
     * Hide a review with reason
     */
    hideReview: async (
      _parent: unknown,
      args: { reviewId: string; reviewedBy: string; reason: string }
    ) => {
      const { reviewId, reviewedBy, reason } = args;

      const result = await hideReview({
        reviewId,
        reviewedBy,
        reason,
      });

      return {
        success: result.success,
        error: result.error || undefined,
      };
    },
    /**
     * Get all pending reviews for the admin moderation queue
     */
    getPendingReviews: async (): Promise<{
      pendingCount: number;
      items: ModerationQueueItem[];
    }> => {
      const items = await getPendingReviews();
      return {
        pendingCount: items.length,
        items,
      };
    },
  },
};

/**
 * Helper to fetch a verification record by ID
 */
async function getVerificationRecord(
  verificationId: string
): Promise<{ businessId: string } | null> {
  const pool = getPool();
  const [rows] = await pool.execute(
    "SELECT business_id FROM business_verifications WHERE id = ?",
    [verificationId]
  );
  const record = (rows as any[])[0];
  return record ? { businessId: record.business_id } : null;
}
