/**
 * GET /api/directory/suggest
 *
 * Public autocomplete suggestions for the search bar: up to five distinct
 * business names from the directory matching the query (case-insensitive
 * substring). No minimum relevance beyond the substring match — the UI caps
 * display at five.
 *
 * Query params:
 *   - q: search term (fewer than 2 chars returns an empty list)
 */

import { NextRequest, NextResponse } from "next/server";
import { getPool } from "@/lib/db/user-repository";
import { fetchDirectoryItems } from "../route";

const MAX_SUGGESTIONS = 5;
const MIN_QUERY_LENGTH = 2;

export function buildSuggestions(
  items: { name: string }[],
  q: string
): string[] {
  const needle = q.toLowerCase();
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of items) {
    if (!item.name || !item.name.toLowerCase().includes(needle)) continue;
    if (seen.has(item.name)) continue;
    seen.add(item.name);
    out.push(item.name);
    if (out.length >= MAX_SUGGESTIONS) break;
  }
  return out;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const { searchParams } = new URL(request.url);
    const q = (searchParams.get("q") || "").trim();

    if (q.length < MIN_QUERY_LENGTH) {
      return NextResponse.json({ success: true, data: { suggestions: [] } });
    }

    const pool = getPool();
    const client = await pool.connect();

    try {
      const allItems = await fetchDirectoryItems(client);
      return NextResponse.json({
        success: true,
        data: { suggestions: buildSuggestions(allItems, q) },
      });
    } finally {
      client.release();
    }
  } catch (error) {
    console.error("Error building directory suggestions:", error);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}
