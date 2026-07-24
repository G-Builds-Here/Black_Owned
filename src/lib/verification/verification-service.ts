/**
 * Verification Service
 *
 * Manages the verification queue for business document review and approval.
 * Provides functionality for admins to approve or reject verification submissions.
 */

import { getPool } from "../db/database";

export type VerificationStatus = "pending" | "approved" | "rejected";

export interface VerificationRecord {
  id: string;
  businessId: string;
  documentUrls: string[];
  status: VerificationStatus;
  submittedAt: string;
  reviewedAt?: string;
  reviewedBy?: string;
  rejectionReason?: string;
}

export interface VerificationQueueItem {
  id: string;
  businessId: string;
  businessName: string;
  documentUrls: string[];
  status: VerificationStatus;
  submittedAt: string;
}

export interface ApproveVerificationInput {
  verificationId: string;
  reviewedBy: string;
}

export interface RejectVerificationInput {
  verificationId: string;
  reviewedBy: string;
  reason: string;
}

/**
 * Create verification record in the database
 */
export async function createVerificationRecord(
  businessId: string,
  documentUrls: string[]
): Promise<string> {
  const pool = getPool();
  const result = await pool.execute(
    "INSERT INTO business_verifications (business_id, document_urls, status, submitted_at) VALUES (?, ?, 'pending', NOW())",
    [businessId, JSON.stringify(documentUrls)]
  );

  return result.insertId.toString();
}

/**
 * Get all pending verification records for the admin queue
 */
export async function getPendingVerifications(): Promise<VerificationQueueItem[]> {
  const pool = getPool();
  const [rows] = await pool.execute(
    `SELECT v.id, v.business_id as businessId, v.document_urls as documentUrls, v.status, v.submitted_at as submittedAt
     FROM business_verifications v
     WHERE v.status = 'pending'
     ORDER BY v.submitted_at ASC`
  );

  // Join with businesses table to get business names
  const businessIds = (rows as any[]).map((r) => r.businessId);
  const businessMap = new Map<string, string>();

  if (businessIds.length > 0) {
    const [businessRows] = await pool.execute(
      `SELECT id, name FROM businesses WHERE id IN (${businessIds.map(() => "?").join(",")})`,
      businessIds
    );

    (businessRows as any[]).forEach((b) => {
      businessMap.set(b.id, b.name);
    });
  }

  return (rows as any[]).map((row) => ({
    id: row.id,
    businessId: row.businessId,
    businessName: businessMap.get(row.businessId) || "Unknown",
    documentUrls: JSON.parse(row.documentUrls),
    status: row.status,
    submittedAt: row.submittedAt,
  }));
}

/**
 * Approve a verification submission
 */
export async function approveVerification(
  input: ApproveVerificationInput
): Promise<{ success: boolean; error?: string }> {
  const { verificationId, reviewedBy } = input;
  const pool = getPool();

  try {
    // Get the verification record first
    const [rows] = await pool.execute(
      "SELECT id, status, business_id FROM business_verifications WHERE id = ?",
      [verificationId]
    );

    const record = (rows as any[])[0];
    if (!record) {
      return { success: false, error: "Verification record not found" };
    }

    if (record.status !== "pending") {
      return { success: false, error: `Verification is already ${record.status}` };
    }

    // Update the verification status
    await pool.execute(
      "UPDATE business_verifications SET status = 'approved', reviewed_at = NOW(), reviewed_by = ? WHERE id = ?",
      [reviewedBy, verificationId]
    );

    // Update the business verification status
    await pool.execute(
      "UPDATE businesses SET is_verified = TRUE WHERE id = ?",
      [record.business_id]
    );

    return { success: true };
  } catch (error) {
    console.error("Error approving verification:", error);
    return { success: false, error: "Failed to approve verification" };
  }
}

/**
 * Reject a verification submission
 */
export async function rejectVerification(
  input: RejectVerificationInput
): Promise<{ success: boolean; error?: string }> {
  const { verificationId, reviewedBy, reason } = input;
  const pool = getPool();

  if (!reason || reason.trim().length === 0) {
    return { success: false, error: "Rejection reason is required" };
  }

  try {
    // Get the verification record first
    const [rows] = await pool.execute(
      "SELECT id, status FROM business_verifications WHERE id = ?",
      [verificationId]
    );

    const record = (rows as any[])[0];
    if (!record) {
      return { success: false, error: "Verification record not found" };
    }

    if (record.status !== "pending") {
      return { success: false, error: `Verification is already ${record.status}` };
    }

    // Update the verification status with rejection reason
    await pool.execute(
      "UPDATE business_verifications SET status = 'rejected', reviewed_at = NOW(), reviewed_by = ?, rejection_reason = ? WHERE id = ?",
      [reviewedBy, reason, verificationId]
    );

    return { success: true };
  } catch (error) {
    console.error("Error rejecting verification:", error);
    return { success: false, error: "Failed to reject verification" };
  }
}

/**
 * Get verification history for a business
 */
export async function getVerificationHistory(
  businessId: string
): Promise<VerificationRecord[]> {
  const pool = getPool();
  const [rows] = await pool.execute(
    "SELECT * FROM business_verifications WHERE business_id = ? ORDER BY submitted_at DESC",
    [businessId]
  );

  return (rows as any[]).map((row) => ({
    id: row.id,
    businessId: row.business_id,
    documentUrls: JSON.parse(row.document_urls),
    status: row.status,
    submittedAt: row.submitted_at,
    reviewedAt: row.reviewed_at,
    reviewedBy: row.reviewed_by,
    rejectionReason: row.rejection_reason,
  }));
}
