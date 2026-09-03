/**
 * Admin Business Content API Route
 *
 * GET  /api/admin/businesses/[id]/content - content fields for the editor form
 * PATCH /api/admin/businesses/[id]/content - partial update of the editable
 *      content fields (website, phone, menu_url, image_url, description,
 *      social_urls). Manual override is intentional: admin writes apply even
 *      when the enrichment pipeline set the value (no fill-empty rule here).
 */

import { NextRequest, NextResponse } from "next/server";
import {
  createAuthMiddleware,
  createAuthErrorResponse,
} from "@/lib/auth/jwt-middleware";
import {
  fetchBusinessContent,
  updateBusinessContent,
  validateContentBody,
} from "@/lib/db/business-content";

/**
 * Validate UUID format
 */
function isValidUuid(id: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(id);
}

type ContentRouteContext = { params: Promise<{ id: string }> };

/**
 * GET /api/admin/businesses/[id]/content
 * Return the editable content fields so the admin form can pre-fill.
 */
export async function GET(
  _request: NextRequest,
  context: ContentRouteContext
): Promise<NextResponse> {
  const requireAdmin = createAuthMiddleware(["admin"]);
  const authResult = await requireAdmin(_request);
  if (!authResult.authenticated) {
    return createAuthErrorResponse(authResult.errorType!, authResult.errorMessage!);
  }

  const { id } = await context.params;
  if (!isValidUuid(id)) {
    return NextResponse.json(
      {
        success: false,
        error: "Invalid business ID format",
        code: "INVALID_ID",
      },
      { status: 400 }
    );
  }

  try {
    const business = await fetchBusinessContent(id);
    if (!business) {
      return NextResponse.json(
        {
          success: false,
          error: "Business not found",
          code: "NOT_FOUND",
        },
        { status: 404 }
      );
    }
    return NextResponse.json({
      success: true,
      data: { business },
    });
  } catch (error) {
    console.error("Error reading business content:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Internal server error",
      },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/admin/businesses/[id]/content
 * Partial update: only the fields present in the body are written.
 */
export async function PATCH(
  request: NextRequest,
  context: ContentRouteContext
): Promise<NextResponse> {
  const requireAdmin = createAuthMiddleware(["admin"]);
  const authResult = await requireAdmin(request);
  if (!authResult.authenticated) {
    return createAuthErrorResponse(authResult.errorType!, authResult.errorMessage!);
  }

  const { id } = await context.params;
  if (!isValidUuid(id)) {
    return NextResponse.json(
      {
        success: false,
        error: "Invalid business ID format",
        code: "INVALID_ID",
      },
      { status: 400 }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      {
        success: false,
        error: "Request body must be valid JSON",
        code: "VALIDATION_ERROR",
      },
      { status: 400 }
    );
  }

  const validation = validateContentBody(body);
  if (!validation.ok) {
    return NextResponse.json(
      {
        success: false,
        error: validation.error,
        code: "VALIDATION_ERROR",
      },
      { status: 400 }
    );
  }

  try {
    const business = await updateBusinessContent(id, validation.updates);
    if (!business) {
      return NextResponse.json(
        {
          success: false,
          error: "Business not found",
          code: "NOT_FOUND",
        },
        { status: 404 }
      );
    }
    return NextResponse.json({
      success: true,
      data: { business },
    });
  } catch (error) {
    console.error("Error updating business content:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Internal server error",
      },
      { status: 500 }
    );
  }
}
