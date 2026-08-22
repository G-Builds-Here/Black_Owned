/**
 * Chat Repository
 *
 * PostgreSQL data access for conversations + messages (LOC-0042).
 * A conversation is one (user, business) pair — the UNIQUE constraint is
 * what makes "Chat" on the detail page resume instead of duplicate.
 */

import { PoolClient } from "pg";

export interface ConversationListItem {
  id: string;
  businessId: string;
  businessName: string;
  category: string;
  lastMessage: string | null;
  lastMessageAt: Date | null;
  unreadCount: number;
  createdAt: Date;
}

export interface MessageRow {
  id: string;
  senderUserId: string;
  senderName: string;
  body: string;
  isRead: boolean;
  createdAt: Date;
}

function conversationTable(): string {
  const schema = process.env.POSTGRES_SCHEMA;
  return schema ? `${schema}.conversations` : "conversations";
}

function messageTable(): string {
  const schema = process.env.POSTGRES_SCHEMA;
  return schema ? `${schema}.messages` : "messages";
}

function businessTable(): string {
  const schema = process.env.POSTGRES_SCHEMA;
  return schema ? `${schema}.businesses` : "businesses";
}

function categoryTable(): string {
  const schema = process.env.POSTGRES_SCHEMA;
  return schema ? `${schema}.categories` : "categories";
}

function userTable(): string {
  const schema = process.env.POSTGRES_SCHEMA;
  return schema ? `${schema}.users` : "users";
}

/**
 * The user's conversations, most recent activity first, with the latest
 * message preview and the unread count (messages from the other party).
 */
export async function listConversationsForUser(
  client: PoolClient,
  userId: string
): Promise<ConversationListItem[]> {
  const result = await client.query(
    `SELECT c.id,
            c.business_id,
            c.created_at,
            b.name AS business_name,
            COALESCE(cat.name, b.category_id) AS category,
            lm.body AS last_message,
            lm.created_at AS last_message_at,
            COALESCE(u.unread_count, 0) AS unread_count
       FROM ${conversationTable()} c
       JOIN ${businessTable()} b ON b.id = c.business_id
       LEFT JOIN ${categoryTable()} cat ON cat.id::text = b.category_id
       LEFT JOIN LATERAL (
         SELECT m.body, m.created_at
           FROM ${messageTable()} m
          WHERE m.conversation_id = c.id
          ORDER BY m.created_at DESC, m.id DESC
          LIMIT 1
       ) lm ON TRUE
       LEFT JOIN (
         SELECT m2.conversation_id, COUNT(*)::int AS unread_count
           FROM ${messageTable()} m2
          WHERE m2.sender_user_id <> $1
            AND m2.is_read = FALSE
          GROUP BY m2.conversation_id
       ) u ON u.conversation_id = c.id
      WHERE c.user_id = $1
      ORDER BY COALESCE(lm.created_at, c.created_at) DESC`,
    [userId]
  );

  return result.rows.map((row: Record<string, unknown>) => ({
    id: row.id as string,
    businessId: row.business_id as string,
    businessName: row.business_name as string,
    category: row.category as string,
    lastMessage: (row.last_message as string | null) ?? null,
    lastMessageAt: row.last_message_at ? new Date(row.last_message_at as string) : null,
    unreadCount: row.unread_count as number,
    createdAt: new Date(row.created_at as string),
  }));
}

/**
 * Access check for a conversation: the user side, or the business owner.
 * Returns the conversation + business owner so routes can resolve who the
 * other party is, or null when the conversation is unknown or not the user's.
 */
export async function getConversationAccess(
  client: PoolClient,
  conversationId: string,
  userId: string
): Promise<{ conversationId: string; userId: string; businessId: string; ownerId: string } | null> {
  const result = await client.query(
    `SELECT c.id AS conversation_id,
            c.user_id,
            c.business_id,
            b.owner_id
       FROM ${conversationTable()} c
       JOIN ${businessTable()} b ON b.id = c.business_id
      WHERE c.id = $1
        AND (c.user_id = $2 OR b.owner_id = $2)`,
    [conversationId, userId]
  );
  if (result.rows.length === 0) return null;
  const row = result.rows[0] as Record<string, unknown>;
  return {
    conversationId: row.conversation_id as string,
    userId: row.user_id as string,
    businessId: row.business_id as string,
    ownerId: row.owner_id as string,
  };
}

/**
 * Create-or-resume the conversation for (user, business). `created` is true
 * only when a new row was inserted. Returns null when the business is unknown.
 */
export async function getOrCreateConversation(
  client: PoolClient,
  userId: string,
  businessId: string
): Promise<{ id: string; businessId: string; createdAt: Date; created: boolean } | null> {
  const business = await client.query(
    `SELECT id FROM ${businessTable()} WHERE id = $1`,
    [businessId]
  );
  if (business.rows.length === 0) return null;

  const inserted = await client.query(
    `INSERT INTO ${conversationTable()} (user_id, business_id)
     VALUES ($1, $2)
     ON CONFLICT (user_id, business_id) DO NOTHING
     RETURNING id, business_id, created_at`,
    [userId, businessId]
  );

  if (inserted.rows.length > 0) {
    const row = inserted.rows[0] as Record<string, unknown>;
    return {
      id: row.id as string,
      businessId: row.business_id as string,
      createdAt: new Date(row.created_at as string),
      created: true,
    };
  }

  const existing = await client.query(
    `SELECT id, business_id, created_at
       FROM ${conversationTable()}
      WHERE user_id = $1 AND business_id = $2`,
    [userId, businessId]
  );
  const row = existing.rows[0] as Record<string, unknown>;
  return {
    id: row.id as string,
    businessId: row.business_id as string,
    createdAt: new Date(row.created_at as string),
    created: false,
  };
}

/**
 * Message history for a conversation, newest first. `beforeId` pages older
 * than a known message id.
 */
export async function listMessages(
  client: PoolClient,
  conversationId: string,
  beforeId?: string
): Promise<{ messages: MessageRow[]; hasMore: boolean }> {
  const pageSize = 51;
  const result = await client.query(
    `SELECT m.id, m.sender_user_id, m.body, m.is_read, m.created_at,
            u.name AS sender_name
       FROM ${messageTable()} m
       JOIN ${userTable()} u ON u.id = m.sender_user_id
      WHERE m.conversation_id = $1
        AND ($2::uuid IS NULL
             OR (m.created_at, m.id) < (
               SELECT m2.created_at, m2.id FROM ${messageTable()} m2 WHERE m2.id = $2
             ))
      ORDER BY m.created_at DESC, m.id DESC
      LIMIT ${pageSize}`,
    [conversationId, beforeId ?? null]
  );

  const messages: MessageRow[] = result.rows.map((row: Record<string, unknown>) => ({
    id: row.id as string,
    senderUserId: row.sender_user_id as string,
    senderName: row.sender_name as string,
    body: row.body as string,
    isRead: row.is_read as boolean,
    createdAt: new Date(row.created_at as string),
  }));
  return { messages, hasMore: messages.length === pageSize };
}

/**
 * Insert a message (the sender's own row is marked read so it never counts
 * against their unread badge) and bump the conversation activity timestamp.
 */
export async function addMessage(
  client: PoolClient,
  params: { conversationId: string; businessId: string; senderUserId: string; body: string }
): Promise<MessageRow> {
  const result = await client.query(
    `INSERT INTO ${messageTable()} (conversation_id, business_id, sender_user_id, body, is_read)
     VALUES ($1, $2, $3, $4, TRUE)
     RETURNING id, sender_user_id, body, is_read, created_at`,
    [params.conversationId, params.businessId, params.senderUserId, params.body]
  );

  await client.query(
    `UPDATE ${conversationTable()} SET updated_at = NOW() WHERE id = $1`,
    [params.conversationId]
  );

  const row = result.rows[0] as Record<string, unknown>;
  return {
    id: row.id as string,
    senderUserId: row.sender_user_id as string,
    senderName: "",
    body: row.body as string,
    isRead: row.is_read as boolean,
    createdAt: new Date(row.created_at as string),
  };
}

/**
 * Mark every other-party message in the conversation as read; returns the
 * number of messages that flipped.
 */
export async function markConversationRead(
  client: PoolClient,
  conversationId: string,
  userId: string
): Promise<number> {
  const result = await client.query(
    `UPDATE ${messageTable()}
        SET is_read = TRUE
      WHERE conversation_id = $1
        AND sender_user_id <> $2
        AND is_read = FALSE`,
    [conversationId, userId]
  );
  return result.rowCount ?? 0;
}
