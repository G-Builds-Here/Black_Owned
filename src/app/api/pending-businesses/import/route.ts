/**
 * POST /api/pending-businesses/import
 *
 * Batch import endpoint for normalized businesses.
 * Handles import failures with proper transaction rollback and error logging.
 */

import { NextRequest, NextResponse } from "next/server";
import { getPool } from "@/lib/db/user-repository";
import { importNormalizedBusinesses } from "@/lib/db/pending-import-business-repository";
import { ScraperSource } from "@/types/scraper-result";

/**
 * Request body schema for batch import
 */
interface ImportBusinessRequest {
  businesses: Array<{
    name: string;
    description?: string;
    category_id: string;
    source_data: Record<string, unknown>;
    source: ScraperSource;
    originalId: string;
  }>;
  jobId?: string;
}

/**
 * Validation error
 */
interface ValidationError {
  field: string;
  error: string;
}

/**
 * Validate import request body
 */
function validateImportRequest(body: unknown): { valid: boolean; errors: ValidationError[] } {
  const errors: ValidationError[] = [];

  if (!body || typeof body !== "object") {
    errors.push({ field: "body", error: "Request body must be an object" });
    return { valid: false, errors };
  }

  const castBody = body as Record<string, unknown>;

  // Check for businesses array
  if (!("businesses" in castBody)) {
    errors.push({ field: "businesses", error: "'businesses' array is required" });
    return { valid: false, errors };
  }

  if (!Array.isArray(castBody.businesses)) {
    errors.push({ field: "businesses", error: "'businesses' must be an array" });
    return { valid: false, errors };
  }

  // Validate each business
  for (let i = 0; i < castBody.businesses.length; i++) {
    const business = castBody.businesses[i];

    if (!business || typeof business !== "object") {
      errors.push({ field: `businesses[${i}]`, error: "Each business must be an object" });
      continue;
    }

    const castBusiness = business as Record<string, unknown>;

    // Name is required
    if (!("name" in castBusiness) || !castBusiness.name || typeof castBusiness.name !== "string") {
      errors.push({ field: `businesses[${i}].name`, error: "name is required and must be a string" });
    }

    // Category ID is required
    if (!("category_id" in castBusiness) || !castBusiness.category_id || typeof castBusiness.category_id !== "string") {
      errors.push({ field: `businesses[${i}].category_id`, error: "Category ID is required and must be a string" });
    }

    // Source is required
    if (!("source" in castBusiness) || !castBusiness.source) {
      errors.push({ field: `businesses[${i}].source`, error: "source is required" });
    }

    // Source data is required
    if (!("source_data" in castBusiness)) {
      errors.push({ field: `businesses[${i}].source_data`, error: "source_data is required" });
    }

    // Original ID is required
    if (!("originalId" in castBusiness) || !castBusiness.originalId) {
      errors.push({ field: `businesses[${i}].originalId`, error: "originalId is required" });
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * POST /api/pending-businesses/import
 * Import normalized businesses with transaction support and error handling
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const client = await getPool().connect();

  // Parse request body
  let body: ImportBusinessRequest;
  try {
    body = await request.json();
  } catch (error) {
    client.release();
    return NextResponse.json(
      {
        success: false,
        errors: [{ field: "body", error: "Invalid JSON in request body" }],
      },
      { status: 400 }
    );
  }

  // Validate request
  const validation = validateImportRequest(body);
  if (!validation.valid) {
    client.release();
    return NextResponse.json(
      {
        success: false,
        errors: validation.errors,
      },
      { status: 400 }
    );
  }

  try {
    // Begin transaction
    await client.query("BEGIN");

    // Import businesses
    const result = await importNormalizedBusinesses(
      client,
      body.businesses,
      body.jobId
    );

    // Commit transaction
    await client.query("COMMIT");

    return NextResponse.json({
      success: true,
      total: result.total,
      succeeded: result.succeeded,
      failed: result.failed,
      results: result.results,
      errors: result.errors,
    });
  } catch (error) {
    // Rollback transaction on error
    try {
      await client.query("ROLLBACK");
    } catch (rollbackError) {
      console.error("[Import API] Rollback failed:", rollbackError);
    }

    const errorMessage = error instanceof Error ? error.message : "Unknown error";

    // Log the error with business details
    console.error(
      `[Import API] Transaction failed for batch import: ${errorMessage}. ` +
        `Rolling back ${body.businesses.length} records.`
    );

    // Log each business that would have been imported
    for (const business of body.businesses) {
      console.error(
        `[Import API] Business rolled back: name="${business.name}", ` +
          `source=${business.source}, originalId=${business.originalId}`
      );
    }

    return NextResponse.json(
      {
        success: false,
        errors: [
          {
            field: "transaction",
            error: errorMessage,
          },
        ],
      },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}
