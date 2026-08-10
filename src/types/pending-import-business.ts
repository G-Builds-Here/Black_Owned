/**
 * Pending Import Business Types
 *
 * Defines data structures for businesses in the import workflow.
 */

/**
 * Status for a pending import business record
 */
export type PendingImportStatus = "pending_review" | "approved" | "rejected";

/**
 * Pending import business entity - represents a business awaiting review
 */
export interface PendingImportBusiness {
  id: string;
  name: string;
  description: string | undefined;
  categoryId: string;
  status: PendingImportStatus;
  sourceData: Record<string, unknown> | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Input for creating a pending import business (normalized business record)
 */
export interface PendingImportBusinessInput {
  name: string;
  description: string | undefined;
  categoryId: string;
  sourceData?: Record<string, unknown>;
}
