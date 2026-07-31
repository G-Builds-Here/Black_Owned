/**
 * User Management API Route
 *
 * GET /api/users - List users with pagination and search
 * PATCH /api/users/role - Update user role
 * PATCH /api/users/status - Update user status
 */

import { NextRequest, NextResponse } from "next/server";
import {
  getUsersPaginated,
  updateUserRole,
  updateUserStatus,
  initializeUserManagementSchema,
} from "@/lib/db/user-management-repository";
import { publishRoleChangedEvent } from "@/lib/nats/nats-client";
import {
  isValidRole,
  isValidStatus,
  RoleChangedEvent,
} from "@/types/user-management";

/**
 * GET /api/users
 * List users with pagination and optional email search
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    // Initialize schema on first request
    await initializeUserManagementSchema();

    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get("page") || "1", 10);
    const pageSize = parseInt(searchParams.get("pageSize") || "20", 10);
    const emailSearch = searchParams.get("search") || undefined;

    // Validate pagination params
    if (page < 1 || pageSize < 1 || pageSize > 100) {
      return NextResponse.json(
        {
          success: false,
          error: "Invalid pagination parameters. Page must be >= 1, pageSize must be 1-100.",
        },
        { status: 400 }
      );
    }

    const result = await getUsersPaginated({
      page,
      pageSize,
      emailSearch,
    });

    return NextResponse.json({
      success: true,
      data: result,
    });
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
 * PATCH /api/users/role
 * Update a user's role (admin only)
 */
export async function PATCH(request: NextRequest): Promise<NextResponse> {
  try {
    const body = await request.json();
    const { userId, role } = body;

    // Validate required fields
    if (!userId || !role) {
      return NextResponse.json(
        {
          success: false,
          error: "userId and role are required",
        },
        { status: 400 }
      );
    }

    // Validate role
    if (!isValidRole(role)) {
      return NextResponse.json(
        {
          success: false,
          error: `Invalid role. Must be one of: user, business_owner, admin`,
        },
        { status: 400 }
      );
    }

    // Get target user to find old role
    const { findByIdWithRole } = await import(
      "@/lib/db/user-management-repository"
    );
    const targetUser = await findByIdWithRole(userId);

    if (!targetUser) {
      return NextResponse.json(
        {
          success: false,
          error: "User not found",
        },
        { status: 404 }
      );
    }

    const oldRole = targetUser.role;

    // Update role
    const updatedUser = await updateUserRole(userId, role);

    if (!updatedUser) {
      return NextResponse.json(
        {
          success: false,
          error: "Failed to update user role",
        },
        { status: 500 }
      );
    }

    // Publish NATS event for role change
    try {
      const event: RoleChangedEvent = {
        userId,
        oldRole,
        newRole: role,
        changedBy: "system",
        timestamp: new Date().toISOString(),
      };
      await publishRoleChangedEvent(event);
    } catch (natsError) {
      console.warn("Failed to publish role_changed event:", natsError);
      // Don't fail the request if NATS publish fails
    }

    return NextResponse.json({
      success: true,
      data: updatedUser,
      message: "Role updated successfully",
    });
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

/**
 * PATCH /api/users/status
 * Update a user's status (admin only)
 */
export async function PATCH_STATUS(request: NextRequest): Promise<NextResponse> {
  try {
    const body = await request.json();
    const { userId, status } = body;

    // Validate required fields
    if (!userId || !status) {
      return NextResponse.json(
        {
          success: false,
          error: "userId and status are required",
        },
        { status: 400 }
      );
    }

    // Validate status
    if (!isValidStatus(status)) {
      return NextResponse.json(
        {
          success: false,
          error: `Invalid status. Must be one of: active, inactive, suspended`,
        },
        { status: 400 }
      );
    }

    // Update status
    const updatedUser = await updateUserStatus(userId, status);

    if (!updatedUser) {
      return NextResponse.json(
        {
          success: false,
          error: "Failed to update user status",
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      data: updatedUser,
      message: "Status updated successfully",
    });
  } catch (error) {
    console.error("Error updating user status:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Internal server error",
      },
      { status: 500 }
    );
  }
}
