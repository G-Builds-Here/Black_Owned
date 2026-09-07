/**
 * Chat conversations API
 *
 * GET  /api/chat/conversations - the user's conversations, most recent
 *      activity first, with last-message preview + unread count (AC1).
 * POST /api/chat/conversations - create-or-resume the conversation for a
 *      business; the UNIQUE(user_id, business_id) constraint guarantees no
 *      duplicates (AC3).
 */

import { NextRequest, NextResponse } from "next/server";
import { getPool } from "@/lib/db/user-repository";
import {
  createAuthMiddleware,
  createAuthErrorResponse,
} from "@/lib/auth/jwt-middleware";
import {
  getOrCreateConversation,
  listConversationsForUser,
} from "@/lib/db/chat-repository";

function isValidUuid(id: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const requireAuth = createAuthMiddleware(["user", "business_owner", "admin"]);
  const authResult = await requireAuth(request);
  if (!authResult.authenticated) {
    return createAuthErrorResponse(authResult.errorType!, authResult.errorMessage!);
  }
  const userId = authResult.user!.userId;

  try {
    const client = await getPool().connect();
    try {
      const conversations = await listConversationsForUser(client, userId);
      return NextResponse.json({ success: true, data: { conversations } });
    } finally {
      client.release();
    }
  } catch (error) {
    console.error("Error listing conversations:", error);
    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const requireAuth = createAuthMiddleware(["user", "business_owner", "admin"]);
  const authResult = await requireAuth(request);
  if (!authResult.authenticated) {
    return createAuthErrorResponse(authResult.errorType!, authResult.errorMessage!);
  }
  const userId = authResult.user!.userId;

  let body: { businessId?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, error: "Invalid JSON body", code: "INVALID_BODY" },
      { status: 400 }
    );
  }

  const businessId = typeof body.businessId === "string" ? body.businessId.trim() : "";
  if (!isValidUuid(businessId)) {
    return NextResponse.json(
      { success: false, error: "A valid businessId is required", code: "INVALID_BUSINESS" },
      { status: 400 }
    );
  }

  try {
    const client = await getPool().connect();
    try {
      const conversation = await getOrCreateConversation(client, userId, businessId);
      if (!conversation) {
        return NextResponse.json(
          { success: false, error: "Business not found", code: "NOT_FOUND" },
          { status: 404 }
        );
      }
      return NextResponse.json(
        {
          success: true,
          data: {
            conversation: {
              id: conversation.id,
              businessId: conversation.businessId,
              createdAt: conversation.createdAt,
            },
            created: conversation.created,
          },
        },
        { status: conversation.created ? 201 : 200 }
      );
    } finally {
      client.release();
    }
  } catch (error) {
    console.error("Error creating conversation:", error);
    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
  }
}
