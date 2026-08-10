/**
 * Business Importer Service
 *
 * Handles the import of normalized business records into the pending queue.
 */

import { PoolClient } from "pg";
import { PendingImportBusinessInput } from "../types/pending-import-business";
import { insertPendingImportBusiness } from "../lib/db/pending-import-business-repository";

/**
 * Import result for a batch of business records
 */
export interface ImportResult {
  success: boolean;
  importedCount: number;
  failedCount: number;
  errors: string[];
}

/**
 * Business importer service
 */
export class BusinessImporter {
  /**
   * Import a single normalized business record into the pending queue
   *
   * @param client - PostgreSQL pool client
   * @param input - Normalized business record
   * @returns The created pending import business record
   * @throws Error if the record cannot be inserted
   */
  async importBusiness(
    client: PoolClient,
    input: PendingImportBusinessInput
  ): Promise<void> {
    // Validate input
    if (!input.name || input.name.trim() === "") {
      throw new Error("Business name is required");
    }
    if (!input.categoryId || input.categoryId.trim() === "") {
      throw new Error("Category ID is required");
    }

    await insertPendingImportBusiness(client, input);
  }

  /**
   * Import a batch of normalized business records into the pending queue
   *
   * @param client - PostgreSQL pool client
   * @param inputs - Array of normalized business records
   * @returns Import result with counts and errors
   */
  async importBatch(
    client: PoolClient,
    inputs: PendingImportBusinessInput[]
  ): Promise<ImportResult> {
    const errors: string[] = [];
    let importedCount = 0;
    let failedCount = 0;

    for (const input of inputs) {
      try {
        await this.importBusiness(client, input);
        importedCount++;
      } catch (error) {
        failedCount++;
        const errorMessage = error instanceof Error ? error.message : "Unknown error";
        errors.push(`Failed to import ${input.name || "unknown"}: ${errorMessage}`);
      }
    }

    return {
      success: failedCount === 0,
      importedCount,
      failedCount,
      errors,
    };
  }
}

/**
 * Singleton instance of the business importer
 */
export const businessImporter = new BusinessImporter();
