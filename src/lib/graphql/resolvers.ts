/**
 * GraphQL Resolvers
 */

import {
  findByEmail,
  create,
} from "../db/user-repository";
import {
  hashPassword,
  generateTokenPair,
  verifyToken,
} from "../auth/auth-service";
import {
  validatePassword,
  isValidEmail,
  User,
  JwtPayload,
} from "../../types/user";
import { storeRefreshToken } from "../valkey/valkey-client";
import { getCachedResponse, cacheResponse, generateCacheKey } from "./query-cache";
import {
  MinioService,
  createMinioServiceFromEnv,
  PresignedUrlResult,
} from "../minio/minio-service";
import {
  findBusinessById,
  updateNameById,
} from "../db/business-repository";
import { findScrapedBusinessById } from "../db/scraped-business-repository";
import { getPool } from "../db/user-repository";
import { Business } from "../../types/business";
import { fetchDirectoryItems, type DirectoryBusiness } from "@/app/api/directory/route";

/**
 * Convert User record to GraphQL User type
 */
function userToGraphqlUser(user: User) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    createdAt: user.createdAt.toISOString(),
  };
}

/**
 * Lazy-initialized MinIO service instance
 */
let minioService: MinioService | null = null;

function getMinioService(): MinioService {
  if (!minioService) {
    minioService = createMinioServiceFromEnv();
  }
  return minioService;
}

/**
 * Submit verification mutation resolver
 * Generates presigned PUT URLs for uploading verification documents to MinIO
 */
export async function submitVerification(
  _parent: unknown,
  args: { businessId: string; fileNames: string[] }
): Promise<{
  success: boolean;
  presignedUrls?: PresignedUrlResult[];
  error?: string;
}> {
  const { businessId, fileNames } = args;

  // Validate required fields
  if (!businessId || businessId.trim() === "") {
    return {
      success: false,
      error: "Missing required field: businessId",
    };
  }

  if (!fileNames || fileNames.length === 0) {
    return {
      success: false,
      error: "Missing required field: fileNames (must provide at least one file)",
    };
  }

  try {
    const minio = getMinioService();

    // Use the verification-docs bucket for verification documents
    const bucket = "verification-docs";

    // Generate object names in the format: {businessId}/{filename}
    const objectNames = fileNames.map((fileName) => `${businessId}/${fileName}`);

    // Generate presigned PUT URLs with 15-minute expiry (900 seconds)
    const presignedUrls = await minio.generatePresignedPutUrlsBatch(
      bucket,
      objectNames,
      900 // 15 minutes
    );

    return {
      success: true,
      presignedUrls,
    };
  } catch (error) {
    console.error("Submit verification error:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to generate presigned URLs",
    };
  }
}

/**
 * Register mutation resolver
 */
export async function register(
  _parent: unknown,
  args: { email: string; password: string; name: string }
): Promise<{
  success: boolean;
  user?: unknown;
  tokens?: { accessToken: string; refreshToken: string };
  error?: string;
}> {
  const { email, password, name } = args;

  // Validate email format
  if (!isValidEmail(email)) {
    return {
      success: false,
      error: "Invalid email format",
    };
  }

  // Validate password strength
  const passwordValidation = validatePassword(password);
  if (!passwordValidation.valid) {
    return {
      success: false,
      error: passwordValidation.errors.join(", "),
    };
  }

  // Normalize email to lowercase
  const normalizedEmail = email.toLowerCase();

  // Check for existing user
  const existingUser = await findByEmail(normalizedEmail);
  if (existingUser) {
    return {
      success: false,
      error: "Email already registered",
    };
  }

  // Hash password
  const passwordHash = await hashPassword(password);

  // Create user
  const user = await create(normalizedEmail, passwordHash, name);

  // Generate tokens
  const tokens = generateTokenPair(user);

  // Store refresh token in Valkey
  await storeRefreshToken(tokens.refreshToken, user.id);

  return {
    success: true,
    user: userToGraphqlUser(user),
    tokens,
  };
}

/**
 * Health check resolver
 */
export function health(): string {
  return "ok";
}

/**
 * Business query resolver
 *
 * Resolves a business by ID across the three sources, in priority order:
 *   1. Canonical `businesses` row (owner-submitted / verified pipeline)
 *   2. Approved `pending_import_businesses` row (passed admin review)
 *   3. `scraped_businesses` row (raw scrape — shown as unverified)
 *
 * Returns the GraphQL Business shape, or null when no source has the ID.
 */
export async function business(
  _parent: unknown,
  args: { id: string }
): Promise<{
  id: string;
  name: string;
  categoryId: string;
  verified: boolean;
  createdAt: { timestamp: number };
} | null> {
  const { id } = args;
  if (!id) return null;

  const client = await getPool().connect();
  try {
    // 1. Canonical business
    const canonical = await findBusinessById(client, id);
    if (canonical) {
      return businessToGraphqlBusiness(canonical);
    }

    // 2. Approved pending import (passed review)
    const pendingResult = await client.query(
      `SELECT id, name, category_id, created_at
       FROM pending_import_businesses
       WHERE id = $1 AND status = 'approved'`,
      [id]
    );
    if (pendingResult.rows[0]) {
      const row = pendingResult.rows[0] as {
        id: string;
        name: string;
        category_id: string;
        created_at: Date | string;
      };
      const createdAt =
        row.created_at instanceof Date ? row.created_at : new Date(row.created_at);
      return {
        id: row.id,
        name: row.name,
        categoryId: row.category_id,
        verified: true,
        createdAt: { timestamp: Math.floor(createdAt.getTime() / 1000) },
      };
    }

    // 3. Raw scraped business (unverified fallback)
    const scraped = await findScrapedBusinessById(client, id);
    if (scraped) {
      return {
        id: scraped.id,
        name: scraped.name,
        categoryId: scraped.category || "other",
        verified: false,
        createdAt: { timestamp: Math.floor(scraped.createdAt.getTime() / 1000) },
      };
    }

    return null;
  } finally {
    client.release();
  }
}

/**
 * Shape of a business as returned by the public search resolver
 * (mirrors the GraphQL `Business` type).
 */
export interface SearchBusiness {
  id: string;
  name: string;
  category: string;
  rating: number;
  reviewCount: number;
  location: string;
  isVerified: boolean;
  imageUrl: string;
  description: string;
  tags: string[];
}

/**
 * Map a real directory item to the search business shape
 */
export function toSearchBusiness(item: DirectoryBusiness): SearchBusiness {
  return {
    id: item.id,
    name: item.name,
    category: item.category,
    rating: item.rating ?? 0,
    reviewCount: item.reviewCount ?? 0,
    location: item.location || "",
    isVerified: item.isVerified,
    imageUrl: "",
    description: item.description ?? "",
    tags: [],
  };
}

/**
 * Calculate relevance score for a business based on query match
 * Higher scores for matches in more prominent fields (name > description > category/location > tags)
 */
function calculateRelevanceScore(business: SearchBusiness, query: string): number {
  if (!query) return 0;

  const normalizedQuery = query.toLowerCase();
  let score = 0;

  // Name matches get highest weight (10 points per occurrence)
  const nameLower = business.name.toLowerCase();
  const nameOccurrences = (nameLower.match(new RegExp(normalizedQuery, 'g')) || []).length;
  score += nameOccurrences * 10;

  // Description matches get medium weight (5 points per occurrence)
  if (business.description) {
    const descLower = business.description.toLowerCase();
    const descOccurrences = (descLower.match(new RegExp(normalizedQuery, 'g')) || []).length;
    score += descOccurrences * 5;
  }

  // Category matches get medium weight (5 points)
  if (business.category.toLowerCase().includes(normalizedQuery)) {
    score += 5;
  }

  // Location matches get medium weight (5 points)
  if (business.location.toLowerCase().includes(normalizedQuery)) {
    score += 5;
  }

  // Tag matches get lower weight (3 points per tag)
  if (business.tags) {
    for (const tag of business.tags) {
      if (tag.toLowerCase().includes(normalizedQuery)) {
        score += 3;
      }
    }
  }

  return score;
}

/**
 * Convert business record to GraphQL Business type
 */
function businessToGraphqlBusiness(business: Business) {
  return {
    id: business.id,
    name: business.name,
    categoryId: business.categoryId,
    verified: business.verificationStatus === 'verified',
    createdAt: {
      timestamp: Math.floor(business.createdAt.getTime() / 1000),
    },
  };
}

/**
 * Update business mutation resolver - verifies caller is the owner
 */
export async function updateBusiness(
  _parent: unknown,
  args: { id: string; name: string },
  context: { headers: { authorization?: string } }
): Promise<{
  success: boolean;
  business?: unknown;
  error?: string;
}> {
  const { id, name } = args;
  const authHeader = context.headers.authorization;

  // Extract JWT token from Authorization header
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return {
      success: false,
      error: "Authorization required",
    };
  }

  const token = authHeader.substring(7);

  // Verify token and extract user ID
  let payload: JwtPayload;
  try {
    payload = verifyToken(token);
  } catch (error) {
    return {
      success: false,
      error: "Invalid or expired token",
    };
  }

  const userId = payload.userId;

  // Get database client and verify ownership - only the business owner can update
  const pool = getPool();
  const client = await pool.connect();
  try {
    const updatedBusiness = await updateNameById(client, id, name, userId);

    if (!updatedBusiness) {
      return {
        success: false,
        error: "Business not found or you are not the owner",
      };
    }

    return {
      success: true,
      business: businessToGraphqlBusiness(updatedBusiness),
    };
  } finally {
    client.release();
  }
}

/**
 * Search businesses resolver with pagination, relevance ranking, and caching.
 * Backed by the real public directory data (approved pending businesses +
 * canonical businesses) — the same source /api/directory serves.
 */
export async function searchBusinesses(
  _parent: unknown,
  args: { query: string; page?: number; pageSize?: number }
): Promise<{
  businesses: SearchBusiness[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  facets: { category: string; count: number }[];
}> {
  const { query, page = 1, pageSize = 10 } = args;

  // Check cache first
  const cached = await getCachedResponse("searchBusinesses", { query, page, pageSize });
  if (cached) {
    return cached as {
      businesses: SearchBusiness[];
      total: number;
      page: number;
      pageSize: number;
      totalPages: number;
      facets: { category: string; count: number }[];
    };
  }

  const normalizedQuery = (query ?? "").toLowerCase().trim();

  const pool = getPool();
  const client = await pool.connect();

  try {
    // Real directory data: approved pending businesses + canonical businesses
    const items = await fetchDirectoryItems(client);
    const all = items.map(toSearchBusiness);

    // Empty query: return all businesses (directory order)
    // Non-empty query: rank by relevance, drop zero-score rows
    const ranked = !normalizedQuery
      ? all
      : all
          .map((business) => ({
            business,
            score: calculateRelevanceScore(business, normalizedQuery),
          }))
          .filter((item) => item.score > 0)
          .sort((a, b) => b.score - a.score)
          .map((item) => item.business);

    const categoryCounts: Record<string, number> = {};
    for (const business of ranked) {
      categoryCounts[business.category] = (categoryCounts[business.category] || 0) + 1;
    }
    const facets = Object.entries(categoryCounts)
      .map(([category, count]) => ({ category, count }))
      .sort((a, b) => b.count - a.count);

    const total = ranked.length;
    const totalPages = Math.ceil(total / pageSize) || 0;
    const startIndex = (page - 1) * pageSize;
    const endIndex = startIndex + pageSize;
    const paginatedBusinesses = ranked.slice(startIndex, endIndex);

    const result = {
      businesses: paginatedBusinesses,
      total,
      page,
      pageSize,
      totalPages,
      facets,
    };

    await cacheResponse("searchBusinesses", { query, page, pageSize }, result);
    return result;
  } finally {
    client.release();
  }
}

/**
 * Get the current user ID from context (set by auth middleware)
 */
function getCurrentUserId(context: unknown): string | null {
  const ctx = context as { user?: { id: string } };
  return ctx?.user?.id ?? null;
}

/**
 * Create business mutation resolver
 */
export async function createBusinessResolver(
  _parent: unknown,
  args: { input: { name: string; description?: string; categoryId: string } },
  context: unknown
): Promise<{
  success: boolean;
  business?: unknown;
  error?: string;
}> {
  const { input } = args;
  const userId = getCurrentUserId(context);

  // Validate required fields
  if (!input.name || input.name.trim() === "") {
    return {
      success: false,
      error: "Name is required",
    };
  }

  if (!input.categoryId || input.categoryId.trim() === "") {
    return {
      success: false,
      error: "Category ID is required",
    };
  }

  // Check if user is authenticated
  if (!userId) {
    return {
      success: false,
      error: "Authentication required",
    };
  }

  const client = await getPool().connect();
  try {
    const business = await createBusinessInDb(
      client,
      userId,
      input.name.trim(),
      input.description?.trim(),
      input.categoryId.trim()
    );

    return {
      success: true,
      business: businessToGraphqlBusiness(business),
    };
  } catch (error) {
    console.error("Error creating business:", error);
    return {
      success: false,
      error: "Failed to create business",
    };
  } finally {
    client.release();
  }
}

/**
 * Expose the create-business mutation resolver under its GraphQL field name so
 * specs and direct consumers can `import { createBusiness } from "./resolvers"`.
 */
export const createBusiness = createBusinessResolver;

/**
 * Internal function to create a business in the database
 */
async function createBusinessInDb(
  client: import("pg").PoolClient,
  ownerId: string,
  name: string,
  description: string | undefined,
  categoryId: string
): Promise<Business> {
  const tableName = "businesses";
  const result = await client.query<Business>(
    `INSERT INTO ${tableName} (owner_id, name, description, category_id, verification_status)
     VALUES ($1, $2, $3, $4, 'unverified')
     RETURNING *`,
    [ownerId, name, description || null, categoryId]
  );
  return result.rows[0];
}

/**
 * Resolvers object
 */
export const resolvers = {
  Query: {
    health,
    business,
    searchBusinesses,
  },
  Mutation: {
    register,
    createBusiness: createBusinessResolver,
    submitVerification,
    updateBusiness,
  },
};
