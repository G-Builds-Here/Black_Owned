/**
 * POST /api/pending-businesses/import
 *
 * Batch import endpoint for normalized businesses.
 * Handles import failures with proper transaction rollback and error logging.
 * Includes business data validation before import.
 */

import { NextRequest, NextResponse } from "next/server";
import { getPool } from "@/lib/db/user-repository";
import { importNormalizedBusinesses } from "@/lib/db/pending-import-business-repository";
import {
  createAuthMiddleware,
  createAuthErrorResponse,
} from "@/lib/auth/jwt-middleware";
import { ScraperSource } from "@/types/scraper-result";
import { validateBusinessData, BusinessValidationInput } from "@/lib/utils/business-data-validator";

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
 * Business validation error with additional context
 */
interface BusinessValidationError {
  index: number;
  businessName: string;
  errors: Array<{ field: string; message: string }>;
  warnings: string[];
}

/**
 * Validate business data using the business-data-validator
 */
function validateBusinessDataForImport(
  businesses: Array<Record<string, unknown>>
): { valid: boolean; errors: BusinessValidationError[] } {
  const allErrors: BusinessValidationError[] = [];

  for (let i = 0; i < businesses.length; i++) {
    const business = businesses[i];
    const castBusiness = business as Record<string, unknown>;

    // Convert to validation input format
    const validationInput: BusinessValidationInput = {
      name: typeof castBusiness.name === "string" ? castBusiness.name : "",
      description: typeof castBusiness.description === "string" ? castBusiness.description : undefined,
      categoryId: typeof castBusiness.category_id === "string" ? castBusiness.category_id : "",
      phone: typeof castBusiness.phone === "string" ? castBusiness.phone : undefined,
      email: typeof castBusiness.email === "string" ? castBusiness.email : undefined,
      website: typeof castBusiness.website === "string" ? castBusiness.website : undefined,
      address: typeof castBusiness.address === "string" ? castBusiness.address : undefined,
      rating: castBusiness.rating as number | string | undefined,
      reviewCount: castBusiness.reviewCount as number | string | undefined,
      source: castBusiness.source as ScraperSource,
      sourceData:
        typeof castBusiness.source_data === "object" && castBusiness.source_data !== null
          ? (castBusiness.source_data as Record<string, unknown>)
          : undefined,
    };

    const result = validateBusinessData(validationInput);

    if (!result.isValid) {
      allErrors.push({
        index: i,
        businessName: castBusiness.name as string || "unknown",
        errors: result.errors.map((e) => ({ field: e.field, message: e.message })),
        warnings: result.warnings,
      });
    } else if (result.warnings.length > 0) {
      // Even if valid, record warnings for visibility
      allErrors.push({
        index: i,
        businessName: castBusiness.name as string || "unknown",
        errors: [],
        warnings: result.warnings,
      });
    }
  }

  return {
    valid: allErrors.every((e) => e.errors.length === 0),
    errors: allErrors,
  };
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
  const requireAdmin = createAuthMiddleware(["admin"]);
  const authResult = await requireAdmin(request);
  if (!authResult.authenticated) {
    return createAuthErrorResponse(authResult.errorType!, authResult.errorMessage!);
  }

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
        error: "Invalid JSON in request body",
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
        error: "Import request validation failed",
        errors: validation.errors,
      },
      { status: 400 }
    );
  }

  // Validate business data using the business-data-validator
  const businessValidation = validateBusinessDataForImport(body.businesses);
  if (!businessValidation.valid) {
    client.release();
    const errorDetails = businessValidation.errors
      .filter((e) => e.errors.length > 0)
      .map((e) => `${e.businessName}: ${e.errors.map((err) => err.message).join(", ")}`);
    return NextResponse.json(
      {
        success: false,
        error: "Business data validation failed",
        errors: [
          {
            field: "business_data",
            error: `Business data validation failed: ${errorDetails.join("; ")}`,
          },
        ],
      },
      { status: 400 }
    );
  }

  // Log warnings for visibility (non-blocking)
  const warnings = businessValidation.errors.filter((e) => e.errors.length === 0 && e.warnings.length > 0);
  if (warnings.length > 0) {
    console.warn(
      `[Import API] Business data warnings: ${warnings
        .map((w) => `${w.businessName}: ${w.warnings.join(", ")}`)
        .join("; ")}`
    );
  }

  try {
    // Begin transaction
    await client.query("BEGIN");

    // Import businesses (normalize description to a required key for the repository)
    const result = await importNormalizedBusinesses(
      client,
      body.businesses.map((b) => ({ ...b, description: b.description })),
      body.jobId
    );

    // Commit transaction
    await client.query("COMMIT");

    return NextResponse.json({
      success: true,
      data: {
        total: result.total,
        succeeded: result.succeeded,
        failed: result.failed,
        results: result.results,
        errors: result.errors,
      },
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
        error: "Batch import transaction failed",
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
