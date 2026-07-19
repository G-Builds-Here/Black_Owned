/**
 * Users API Route
 *
 * GET /api/users - Fetch paginated users with optional search and filtering
 * POST /api/users/role - Update user role
 */

import { NextRequest, NextResponse } from "next/server";
import { getPaginatedUsers, updateUserRole } from "@/lib/db/user-repository";
import { publishRoleChangedEvent } from "@/lib/nats/client";
import { UserRole } from "@/types/user";

/**
 * GET /api/users
 * Fetch paginated users with optional email search and role/status filtering
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const { searchParams } = new URL(request.url);

    const page = parseInt(searchParams.get("page") || "1", 10);
    const pageSize = parseInt(searchParams.get("pageSize") || "20", 10);
    const emailSearch = searchParams.get("emailSearch") || undefined;
    const role = searchParams.get("role") as UserRole | null;
    const status = searchParams.get("status") || undefined;

    // Validate pagination params
    if (page < 1 || pageSize < 1 || pageSize > 100) {
      return NextResponse.json(
        {
          success: false,
          error: "Invalid pagination parameters. Page must be >= 1, pageSize must be between 1 and 100.",
        },
        { status: 400 }
      );
    }

    const result = await getPaginatedUsers({
      page,
      pageSize,
      emailSearch,
      role: role || undefined,
      status: status || undefined,
    });

    return NextResponse.json(
      {
        success: true,
        data: result,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Error fetching users:", error);
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
 * POST /api/users/role
 * Update a user's role
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body = await request.json();
    const { userId, newRole, changedBy } = body;

    // Validate required fields
    if (!userId || !newRole) {
      return NextResponse.json(
        {
          success: false,
          error: "Missing required fields: userId, newRole",
        },
        { status: 400 }
      );
    }

    // Validate role
    const validRoles: UserRole[] = ["user", "business_owner", "admin"];
    if (!validRoles.includes(newRole)) {
      return NextResponse.json(
        {
          success: false,
          error: `Invalid role. Must be one of: ${validRoles.join(", ")}`,
        },
        { status: 400 }
      );
    }

    // Get current user to capture old role
    const { findById } = await import("@/lib/db/user-repository");
    const currentUser = await findById(userId);

    if (!currentUser) {
      return NextResponse.json(
        {
          success: false,
          error: "User not found",
        },
        { status: 404 }
      );
    }

    const oldRole = currentUser.role;

    // Update role
    const updatedUser = await updateUserRole(userId, newRole);

    if (!updatedUser) {
      return NextResponse.json(
        {
          success: false,
          error: "Failed to update user role",
        },
        { status: 500 }
      );
    }

    // Publish NATS event
    try {
      await publishRoleChangedEvent(userId, oldRole, newRole, changedBy || "system");
    } catch (natsError) {
      console.warn("Failed to publish NATS event (non-fatal):", natsError);
      // Don't fail the request if NATS is unavailable
    }

    return NextResponse.json(
      {
        success: true,
        data: updatedUser,
        oldRole,
        newRole,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Error updating user role:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Internal server error",
      },
      { status: 500 }
    );
  }
}
