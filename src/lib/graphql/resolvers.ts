/**
 * GraphQL Resolvers
 */

import {
  findByEmail,
  create,
  initializeUserSchema,
} from "../db/user-repository";
import {
  hashPassword,
  verifyPassword,
  generateTokenPair,
  verifyToken,
} from "../auth/auth-service";
import { JwtPayload } from "../../types/user";
import {
  validatePassword,
  isValidEmail,
  User,
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
import type { Business } from "../../types/business";

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
 * Login mutation resolver
 */
export async function login(
  _parent: unknown,
  args: { email: string; password: string }
): Promise<{
  success: boolean;
  user?: unknown;
  tokens?: { accessToken: string; refreshToken: string };
  error?: string;
}> {
  const { email, password } = args;

  // Validate email format
  if (!isValidEmail(email)) {
    return {
      success: false,
      error: "Invalid email format",
    };
  }

  // Normalize email to lowercase
  const normalizedEmail = email.toLowerCase();

  // Find user by email
  const user = await findByEmail(normalizedEmail);
  if (!user) {
    return {
      success: false,
      error: "Invalid credentials",
    };
  }

  // Verify password
  const passwordValid = await verifyPassword(password, user.passwordHash);
  if (!passwordValid) {
    return {
      success: false,
      error: "Invalid credentials",
    };
  }

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
 * Convert business record to GraphQL Business type
 */
function businessToGraphqlBusiness(business: Business) {
  return {
    id: business.id,
    name: business.name,
    categoryId: business.categoryId,
    verified: business.verificationStatus === "verified",
    createdAt: {
      timestamp: Math.floor(business.createdAt.getTime() / 1000),
    },
    description: business.description || null,
    location: business.location || null,
    rating: business.rating || 0,
    reviewCount: business.reviewCount || 0,
    imageUrl: business.imageUrl || null,
    tags: business.tags || [],
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

  // Get database client
  const { getPool } = await import("../db/user-repository");
  const client = await getPool().connect();

  try {
    // Verify ownership - only the business owner can update
    const updatedBusiness = await updateNameById(client, id, name);

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
 * Search businesses resolver with pagination, relevance ranking, and caching
 */
export async function searchBusinesses(
  _parent: unknown,
  args: { query: string; page?: number; pageSize?: number }
): Promise<{
  businesses: unknown[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  facets: { category: string; count: number }[];
}> {
  const { query = "", page = 1, pageSize = 10 } = args;

  // Check cache first
  const cached = await getCachedResponse("searchBusinesses", { query, page, pageSize });
  if (cached) {
    return cached as {
      businesses: unknown[];
      total: number;
      page: number;
      pageSize: number;
      totalPages: number;
      facets: { category: string; count: number }[];
    };
  }

  const { getPool } = await import("../db/user-repository");
  const client = await getPool().connect();

  try {
    const tableName = "businesses";

    // Get total count
    const countResult = await client.query(`SELECT COUNT(*) FROM ${tableName}`);
    const total = parseInt(countResult.rows[0].count, 10);
    const totalPages = Math.ceil(total / pageSize);
    const offset = (page - 1) * pageSize;

    // Fetch businesses with pagination
    const result = await client.query(
      `SELECT * FROM ${tableName} ORDER BY created_at DESC LIMIT $1 OFFSET $2`,
      [pageSize, offset]
    );

    const businesses = result.rows.map((row) => ({
      id: row.id,
      name: row.name,
      categoryId: row.category_id,
      verified: row.verification_status === "verified",
      createdAt: {
        timestamp: Math.floor(new Date(row.created_at).getTime() / 1000),
      },
      description: row.description || null,
      location: row.location || null,
      rating: row.rating ? parseFloat(row.rating) : 0,
      reviewCount: row.review_count || 0,
      imageUrl: row.image_url || null,
      tags: row.tags || [],
    }));

    // Calculate facets
    const categoryCounts: Record<string, number> = {};
    for (const business of businesses) {
      categoryCounts[business.categoryId] = (categoryCounts[business.categoryId] || 0) + 1;
    }
    const facets = Object.entries(categoryCounts)
      .map(([category, count]) => ({ category, count }))
      .sort((a, b) => b.count - a.count);

    return {
      businesses,
      total,
      page,
      pageSize,
      totalPages,
      facets,
    };
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
export async function createBusiness(
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

  const { getPool } = await import("../db/user-repository");
  const client = await getPool().connect();
  try {
    const business = await createBusinessInDbInternal(
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
 * Internal function to create a business in the database
 */
async function createBusinessInDbInternal(
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
 * Get single business by ID
 */
export async function getBusiness(_parent: unknown, args: { id: string }) {
  const { getPool } = await import("../db/user-repository");
  const client = await getPool().connect();

  try {
    const { findBusinessById } = await import("../db/business-repository");
    const business = await findBusinessById(client, args.id);

    if (!business) {
      return null;
    }

    return businessToGraphqlBusiness(business);
  } finally {
    client.release();
  }
}

/**
 * Resolvers object
 */
export const resolvers = {
  Query: {
    health,
    business: getBusiness,
    searchBusinesses,
  },
  Mutation: {
    login,
    register,
    createBusiness,
    submitVerification,
    updateBusiness,
  },
};
