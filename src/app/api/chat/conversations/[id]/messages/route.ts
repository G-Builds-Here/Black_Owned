/**
 * Chat messages API
 *
 * GET  /api/chat/conversations/:id/messages - history, newest first,
 *      paged by ?before=<messageId> (AC2).
 * POST /api/chat/conversations/:id/messages - send a message: persisted,
 *      then fanned out over NATS (`chat.message.<conversationId>` for the
 *      thread and `chat.notification.<recipientId>` for the banner).
 */

import { NextRequest, NextResponse } from "next/server";
import { getPool } from "@/lib/db/user-repository";
import {
  createAuthMiddleware,
  createAuthErrorResponse,
} from "@/lib/auth/jwt-middleware";
import {
  addMessage,
  getConversationAccess,
  listMessages,
} from "@/lib/db/chat-repository";
import { publishJson } from "@/lib/nats/nats-client";

function isValidUuid(id: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
}

function preview(body: string): string {
  return body.length > 50 ? `${body.slice(0, 50).trimEnd()}…` : body;
}

export async function GET(
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

  const before = new URL(request.url).searchParams.get("before");
  if (before !== null && !isValidUuid(before)) {
    return NextResponse.json({ success: false, error: "Invalid before cursor", code: "INVALID_ID" }, { status: 400 });
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
      const { messages, hasMore } = await listMessages(client, conversationId, before ?? undefined);
      return NextResponse.json({ success: true, data: { messages, hasMore } });
    } finally {
      client.release();
    }
  } catch (error) {
    console.error("Error listing messages:", error);
    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
  }
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

  let body: { body?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: "Invalid JSON body", code: "INVALID_BODY" }, { status: 400 });
  }

  const text = typeof body.body === "string" ? body.body.trim() : "";
  if (text.length === 0) {
    return NextResponse.json({ success: false, error: "Message body is required", code: "INVALID_BODY" }, { status: 400 });
  }
  if (text.length > 2000) {
    return NextResponse.json({ success: false, error: "Message must be 2000 characters or fewer", code: "INVALID_BODY" }, { status: 400 });
  }

  try {
    const schema = process.env.POSTGRES_SCHEMA;
    const userTable = schema ? `${schema}.users` : "users";
    const businessTable = schema ? `${schema}.businesses` : "businesses";

    const client = await getPool().connect();
    try {
      const access = await getConversationAccess(client, conversationId, userId);
      if (!access) {
        return NextResponse.json(
          { success: false, error: "Conversation not found", code: "NOT_FOUND" },
          { status: 404 }
        );
      }

      const message = await addMessage(client, {
        conversationId,
        businessId: access.businessId,
        senderUserId: userId,
        body: text,
      });

      const sender = await client.query(`SELECT name FROM ${userTable} WHERE id = $1`, [userId]);
      const business = await client.query(`SELECT name FROM ${businessTable} WHERE id = $1`, [access.businessId]);
      const senderName = (sender.rows[0] as { name?: string })?.name ?? "A user";
      const businessName = (business.rows[0] as { name?: string })?.name ?? "a business";

      const recipientId = userId === access.userId ? access.ownerId : access.userId;

      let delivered = true;
      if (recipientId !== userId) {
        const event = {
          conversationId,
          businessId: access.businessId,
          businessName,
          messageId: message.id,
          senderUserId: userId,
          senderName,
          body: text,
          createdAt: message.createdAt,
        };
        delivered =
          (await publishJson(`chat.message.${conversationId}`, event)) &&
          (await publishJson(`chat.notification.${recipientId}`, {
            conversationId,
            businessName,
            senderName,
            preview: preview(text),
            messageId: message.id,
            createdAt: message.createdAt,
          }));
      }

      return NextResponse.json(
        {
          success: true,
          data: {
            message: {
              id: message.id,
              senderUserId: message.senderUserId,
              body: message.body,
              isRead: message.isRead,
              createdAt: message.createdAt,
            },
            delivered,
          },
        },
        { status: 201 }
      );
    } finally {
      client.release();
    }
  } catch (error) {
    console.error("Error sending message:", error);
    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
  }
}
