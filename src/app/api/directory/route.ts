/**
 * GET /api/directory
 *
 * Public directory data: approved pending businesses (from the review
 * pipeline) merged with canonical businesses rows.
 *
 * Query params:
 *   - search: case-insensitive name search
 *   - category: case-insensitive exact category match
 *   - location: case-insensitive neighborhood/city match
 *   - minRating: only businesses with rating >= value
 *   - sort: rating | name | newest (default newest)
 *
 * Response also includes facets (distinct categories and locations) so the
 * FilterBar options are derived from real data.
 */

import { NextRequest, NextResponse } from "next/server";
import { getPool } from "@/lib/db/user-repository";

export interface DirectoryBusiness {
  id: string;
  name: string;
  category: string;
  rating: number | null;
  reviewCount: number | null;
  location: string;
  isVerified: boolean;
  description: string | null;
  website: string | null;
  phone: string | null;
  source: string | null;
  imageUrl?: string | null;
  tags?: string[] | null;
  lat?: number | null;
  lng?: number | null;
  createdAt: string;
}

/**
 * Derive a place ("City, ST") from a location string.
 * Returns null when the value is not a recognizable "City, ST" shape —
 * raw street addresses must not leak into the location filter or facets.
 */
export function deriveLocation(address: string | null | undefined): string | null {
  if (!address) return null;
  const parts = address.split(",").map((p) => p.trim()).filter(Boolean);
  if (parts.length < 2) return null;
  const stateMatch = parts[parts.length - 1].match(/^([A-Za-z]{2})(?:\s+\d{5})?$/);
  if (!stateMatch) return null;
  return `${parts[parts.length - 2]}, ${stateMatch[1]}`;
}

interface PendingRow {
  id: string;
  name: string;
  description: string | null;
  category: string;
  source: string;
  source_data: Record<string, unknown> | null;
  created_at: Date | string;
  lat?: number | null;
  lng?: number | null;
}

interface CanonicalRow {
  id: string;
  name: string;
  description: string | null;
  category: string;
  verification_status: string;
  location: string | null;
  rating: string | number | null;
  review_count: number | null;
  website: string | null;
  image_url: string | null;
  tags: string[] | null;
  created_at: Date | string;
  lat?: number | null;
  lng?: number | null;
}

function toCreatedAt(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

/**
 * Fetch and merge the two directory sources into unfiltered items
 */
export async function fetchDirectoryItems(
  client: { query: (text: string) => Promise<{ rows: unknown[] }> }
): Promise<DirectoryBusiness[]> {
  const schema = process.env.POSTGRES_SCHEMA;
  const tableName = schema ? `${schema}.businesses` : "businesses";
  const categoryTable = schema ? `${schema}.categories` : "categories";

  // category_id is stored as the category UUID (text); resolve the display
  // name via the categories table, falling back to the raw id.
  const [pendingResult, canonicalResult] = await Promise.all([
    client.query(
      `SELECT p.id, p.name, p.description, COALESCE(c.name, p.category_id) AS category,
              p.source, p.source_data, p.created_at, p.lat, p.lng
       FROM pending_import_businesses p
       LEFT JOIN ${categoryTable} c ON c.id::text = p.category_id
       WHERE p.status = 'approved'`
    ),
    client.query(
      `SELECT b.id, b.name, b.description, COALESCE(c.name, b.category_id) AS category,
              b.verification_status, b.location, b.rating, b.review_count,
              b.website, b.image_url, b.tags, b.created_at, b.lat, b.lng
       FROM ${tableName} b
       LEFT JOIN ${categoryTable} c ON c.id::text = b.category_id`
    ),
  ]);

  const pendingItems: DirectoryBusiness[] = (pendingResult.rows as PendingRow[]).map((row) => {
    const sd = (row.source_data || {}) as Record<string, unknown>;
    return {
      id: row.id,
      name: row.name,
      category: row.category,
      rating: typeof sd.rating === "number" ? sd.rating : null,
      reviewCount: typeof sd.reviewCount === "number" ? sd.reviewCount : null,
      location: typeof sd.address === "string" ? sd.address : "",
      isVerified: true,
      description: row.description,
      website: typeof sd.website === "string" ? sd.website : null,
      phone: typeof sd.phone === "string" ? sd.phone : null,
      source: row.source,
      imageUrl: null,
      tags: [],
      lat: row.lat ?? null,
      lng: row.lng ?? null,
      createdAt: toCreatedAt(row.created_at),
    };
  });

  const canonicalItems: DirectoryBusiness[] = (canonicalResult.rows as CanonicalRow[]).map((row) => ({
    id: row.id,
    name: row.name,
    category: row.category,
    rating: row.rating != null ? Number(row.rating) : null,
    reviewCount: row.review_count != null ? Number(row.review_count) : null,
    location: row.location ?? "",
    isVerified: row.verification_status === "verified",
    description: row.description,
    website: row.website ?? null,
    phone: null,
    source: null,
    imageUrl: row.image_url ?? null,
    tags: row.tags ?? [],
    lat: row.lat ?? null,
    lng: row.lng ?? null,
    createdAt: toCreatedAt(row.created_at),
  }));

  return [...pendingItems, ...canonicalItems];
}

/**
 * Apply search / category / location / minRating filters and sorting
 */
export function filterDirectoryItems(
  items: DirectoryBusiness[],
  options: {
    search?: string;
    category?: string;
    location?: string;
    minRating?: number;
    sort?: "rating" | "name" | "newest";
  }
): DirectoryBusiness[] {
  const { search, category, location, minRating, sort = "newest" } = options;

  let result = items;

  if (search) {
    const q = search.toLowerCase();
    result = result.filter((item) => item.name.toLowerCase().includes(q));
  }

  if (category) {
    const q = category.toLowerCase();
    result = result.filter((item) => item.category.toLowerCase() === q);
  }

  if (location) {
    const q = location.toLowerCase();
    result = result.filter((item) => {
      const loc = deriveLocation(item.location);
      return loc !== null && loc.toLowerCase().includes(q);
    });
  }

  if (minRating !== undefined && !Number.isNaN(minRating)) {
    result = result.filter((item) => item.rating !== null && item.rating >= minRating);
  }

  const sorted = [...result];
  if (sort === "rating") {
    sorted.sort((a, b) => (b.rating ?? -1) - (a.rating ?? -1) || a.name.localeCompare(b.name));
  } else if (sort === "name") {
    sorted.sort((a, b) => a.name.localeCompare(b.name));
  } else {
    sorted.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  return sorted;
}

/**
 * Build distinct category and location facets from the items
 */
export function buildDirectoryFacets(items: DirectoryBusiness[]): {
  categories: string[];
  locations: string[];
} {
  const categories = new Set<string>();
  const locations = new Set<string>();

  for (const item of items) {
    if (item.category) categories.add(item.category);
    const loc = deriveLocation(item.location);
    if (loc) locations.add(loc);
  }

  return {
    categories: Array.from(categories).sort((a, b) => a.localeCompare(b)),
    locations: Array.from(locations).sort((a, b) => a.localeCompare(b)),
  };
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const { searchParams } = new URL(request.url);

    const search = searchParams.get("search") || undefined;
    const category = searchParams.get("category") || undefined;
    const location = searchParams.get("location") || undefined;
    const minRatingRaw = searchParams.get("minRating");
    const minRating = minRatingRaw !== null ? parseFloat(minRatingRaw) : undefined;
    const sortParam = searchParams.get("sort") || "newest";

    const validSorts = ["rating", "name", "newest"];
    if (!validSorts.includes(sortParam)) {
      return NextResponse.json(
        { success: false, error: `Invalid sort: ${sortParam}. Must be one of: ${validSorts.join(", ")}` },
        { status: 400 }
      );
    }

    const pool = getPool();
    const client = await pool.connect();

    try {
      const allItems = await fetchDirectoryItems(client);
      const facets = buildDirectoryFacets(allItems);
      const businesses = filterDirectoryItems(allItems, {
        search,
        category,
        location,
        minRating,
        sort: sortParam as "rating" | "name" | "newest",
      });

      return NextResponse.json({
        success: true,
        data: {
          businesses,
          facets,
          total: businesses.length,
        },
      });
    } finally {
      client.release();
    }
  } catch (error) {
    console.error("Error fetching directory:", error);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}
