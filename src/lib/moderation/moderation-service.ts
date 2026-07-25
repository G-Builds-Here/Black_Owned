/**
 * Moderation Service
 *
 * Manages the review moderation queue for admin review and approval.
 * Provides functionality for admins to approve or hide reviews.
 */

import { getPool } from "../db/database";

export type ReviewStatus = "pending" | "approved" | "hidden";

export interface ReviewRecord {
  id: string;
  businessId: string;
  userId: string;
  rating: number;
  comment: string;
  status: ReviewStatus;
  visible: boolean;
  createdAt: string;
  reviewedAt?: string;
  reviewedBy?: string;
  hideReason?: string;
}

export interface ModerationQueueItem {
  id: string;
  businessId: string;
  businessName: string;
  userId: string;
  userName: string;
  rating: number;
  comment: string;
  status: ReviewStatus;
  createdAt: string;
}

export interface ApproveReviewInput {
  reviewId: string;
  reviewedBy: string;
}

export interface HideReviewInput {
  reviewId: string;
  reviewedBy: string;
  reason: string;
}

/**
 * Create review record in the database
 */
export async function createReviewRecord(
  businessId: string,
  userId: string,
  rating: number,
  comment: string
): Promise<string> {
  const pool = getPool();
  const result = await pool.execute(
    "INSERT INTO reviews (business_id, user_id, rating, comment, status, visible, created_at) VALUES (?, ?, ?, ?, 'pending', true, NOW())",
    [businessId, userId, rating, comment]
  );

  return result.insertId.toString();
}

/**
 * Get all pending review records for the admin moderation queue
 * Sorted oldest-first by created_at
 */
export async function getPendingReviews(): Promise<ModerationQueueItem[]> {
  const pool = getPool();
  const [rows] = await pool.execute(
    `SELECT r.id, r.business_id as businessId, r.user_id as userId, r.rating, r.comment, r.status, r.visible, r.created_at as createdAt
     FROM reviews r
     WHERE r.status = 'pending'
     ORDER BY r.created_at ASC`
  );

  // Join with businesses and users tables to get names
  const reviewIds = (rows as any[]).map((r) => r.id);
  const businessIds = (rows as any[]).map((r) => r.businessId);
  const userIds = (rows as any[]).map((r) => r.userId);

  const businessMap = new Map<string, string>();
  const userMap = new Map<string, string>();

  if (businessIds.length > 0) {
    const [businessRows] = await pool.execute(
      `SELECT id, name FROM businesses WHERE id IN (${businessIds.map(() => "?").join(",")})`,
      businessIds
    );
    (businessRows as any[]).forEach((b) => {
      businessMap.set(b.id, b.name);
    });
  }

  if (userIds.length > 0) {
    const [userRows] = await pool.execute(
      `SELECT id, name FROM users WHERE id IN (${userIds.map(() => "?").join(",")})`,
      userIds
    );
    (userRows as any[]).forEach((u) => {
      userMap.set(u.id, u.name);
    });
  }

  return (rows as any[]).map((row) => ({
    id: row.id,
    businessId: row.businessId,
    businessName: businessMap.get(row.businessId) || "Unknown",
    userId: row.userId,
    userName: userMap.get(row.userId) || "Unknown",
    rating: row.rating,
    comment: row.comment,
    status: row.status,
    createdAt: row.createdAt,
  }));
}

/**
 * Approve a review submission
 */
export async function approveReview(
  input: ApproveReviewInput
): Promise<{ success: boolean; error?: string }> {
  const { reviewId, reviewedBy } = input;
  const pool = getPool();

  try {
    // Get the review record first
    const [rows] = await pool.execute(
      "SELECT id, status FROM reviews WHERE id = ?",
      [reviewId]
    );

    const record = (rows as any[])[0];
    if (!record) {
      return { success: false, error: "Review not found" };
    }

    if (record.status !== "pending") {
      return { success: false, error: `Review is already ${record.status}` };
    }

    // Update the review status to approved
    await pool.execute(
      "UPDATE reviews SET status = 'approved', reviewed_at = NOW(), reviewed_by = ? WHERE id = ?",
      [reviewedBy, reviewId]
    );

    return { success: true };
  } catch (error) {
    console.error("Error approving review:", error);
    return { success: false, error: "Failed to approve review" };
  }
}

/**
 * Hide a review with reason
 */
export async function hideReview(
  input: HideReviewInput
): Promise<{ success: boolean; error?: string }> {
  const { reviewId, reviewedBy, reason } = input;
  const pool = getPool();

  if (!reason || reason.trim().length === 0) {
    return { success: false, error: "Hide reason is required" };
  }

  try {
    // Get the review record first
    const [rows] = await pool.execute(
      "SELECT id, status FROM reviews WHERE id = ?",
      [reviewId]
    );

    const record = (rows as any[])[0];
    if (!record) {
      return { success: false, error: "Review not found" };
    }

    if (record.status !== "pending") {
      return { success: false, error: `Review is already ${record.status}` };
    }

    // Update the review status to hidden and set visibility to false
    await pool.execute(
      "UPDATE reviews SET status = 'hidden', visible = false, reviewed_at = NOW(), reviewed_by = ?, hide_reason = ? WHERE id = ?",
      [reviewedBy, reason, reviewId]
    );

    return { success: true };
  } catch (error) {
    console.error("Error hiding review:", error);
    return { success: false, error: "Failed to hide review" };
  }
}

/**
 * Get review history for a business
 */
export async function getReviewHistory(
  businessId: string
): Promise<ReviewRecord[]> {
  const pool = getPool();
  const [rows] = await pool.execute(
    "SELECT * FROM reviews WHERE business_id = ? ORDER BY created_at DESC",
    [businessId]
  );

  return (rows as any[]).map((row) => ({
    id: row.id,
    businessId: row.business_id,
    userId: row.user_id,
    rating: row.rating,
    comment: row.comment,
    status: row.status,
    visible: row.visible,
    createdAt: row.created_at,
    reviewedAt: row.reviewed_at,
    reviewedBy: row.reviewed_by,
    hideReason: row.hide_reason,
  }));
}

/**
 * Get count of pending reviews
 */
export async function getPendingReviewCount(): Promise<number> {
  const pool = getPool();
  const [rows] = await pool.execute(
    "SELECT COUNT(*) as count FROM reviews WHERE status = 'pending'"
  );
  return (rows as any[])[0].count;
}
