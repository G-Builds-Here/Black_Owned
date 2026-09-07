/**
 * Mark a conversation read.
 *
 * POST /api/chat/conversations/:id/read - flips every other-party message in
 * the conversation to read; powers the unread badge on the chat list (AC1).
 */

import { NextRequest, NextResponse } from "next/server";
import { getPool } from "@/lib/db/user-repository";
import {
  createAuthMiddleware,
  createAuthErrorResponse,
} from "@/lib/auth/jwt-middleware";
import { getConversationAccess, markConversationRead } from "@/lib/db/chat-repository";

function isValidUuid(id: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const requireAuth = createAuthMiddleware(["user", "business_owner", "admin"]);
  const authResult = await requireAuth(request);
  if (!authResult.authenticated) {
    return createAuthErrorResponse(authResult.errorType!, authResult.errorMessage!);
  }
  const userId = authResult.user!.userId;

  const { id: conversationId } = await context.params;
  if (!isValidUuid(conversationId)) {
    return NextResponse.json({ success: false, error: "Invalid conversation id", code: "INVALID_ID" }, { status: 400 });
  }

  try {
    const client = await getPool().connect();
    try {
      const access = await getConversationAccess(client, conversationId, userId);
      if (!access) {
        return NextResponse.json(
          { success: false, error: "Conversation not found", code: "NOT_FOUND" },
          { status: 404 }
        );
      }
      const read = await markConversationRead(client, conversationId, userId);
      return NextResponse.json({ success: true, data: { read } });
    } finally {
      client.release();
    }
  } catch (error) {
    console.error("Error marking conversation read:", error);
    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
  }
}
