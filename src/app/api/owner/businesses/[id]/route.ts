/**
 * Owner Business Profile API Route
 *
 * PATCH /api/owner/businesses/[id] - edit one's own business profile
 * (name and/or description; owner dashboard, LOC-0043). `description: null`
 * clears the description.
 */

import { NextRequest, NextResponse } from "next/server";
import { getPool } from "@/lib/db/user-repository";
import {
  createAuthMiddleware,
  createAuthErrorResponse,
} from "@/lib/auth/jwt-middleware";
import {
  updateNameById,
  updateDescriptionById,
} from "@/lib/db/business-repository";
import { Business } from "@/types/business";

function isValidUuid(id: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(id);
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const requireAuth = createAuthMiddleware(["user", "business_owner", "admin"]);
  const authResult = await requireAuth(request);
  if (!authResult.authenticated) {
    return createAuthErrorResponse(
      authResult.errorType!,
      authResult.errorMessage!
    );
  }
  const userId = authResult.user!.userId;

  try {
    const { id } = await context.params;
    if (!isValidUuid(id)) {
      return NextResponse.json(
        { success: false, error: "Invalid business ID format", code: "INVALID_ID" },
        { status: 400 }
      );
    }

    let body: { name?: unknown; description?: unknown };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { success: false, error: "Invalid JSON body", code: "INVALID_BODY" },
        { status: 400 }
      );
    }

    let updated: Business | undefined;

    const name =
      typeof body.name === "string" ? body.name.trim() : undefined;
    if (name !== undefined) {
      if (name.length === 0) {
        return NextResponse.json(
          { success: false, error: "Business name must not be empty", code: "INVALID_NAME" },
          { status: 400 }
        );
      }
      if (name.length > 255) {
        return NextResponse.json(
          { success: false, error: "Business name must be 255 characters or fewer", code: "INVALID_NAME" },
          { status: 400 }
        );
      }
    }

    const hasDescription = Object.prototype.hasOwnProperty.call(body, "description");
    const description = hasDescription
      ? body.description === null || body.description === ""
        ? null
        : typeof body.description === "string"
          ? body.description
          : undefined
      : undefined;

    if (name === undefined && description === undefined) {
      return NextResponse.json(
        { success: false, error: "Provide name and/or description", code: "INVALID_BODY" },
        { status: 400 }
      );
    }

    const client = await getPool().connect();
    try {
      if (name !== undefined) {
        updated = await updateNameById(client, id, name, userId);
      }
      if (description !== undefined) {
        const result = await updateDescriptionById(client, id, description, userId);
        if (result) {
          updated = { ...updated, ...result };
        }
      }
    } finally {
      client.release();
    }

    if (!updated) {
      return NextResponse.json(
        { success: false, error: "Business not found or not your business", code: "NOT_FOUND" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        id: updated.id,
        name: updated.name,
        description: updated.description ?? null,
      },
    });
  } catch (error) {
    console.error("Error updating business profile:", error);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}
