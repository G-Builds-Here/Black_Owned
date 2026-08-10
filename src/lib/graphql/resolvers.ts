/**
 * GraphQL Resolvers
 */

import {
  findByEmail,
  create,
  initializeUserSchema,
  getPool,
} from "../db/user-repository";
import {
  hashPassword,
  generateTokenPair,
  verifyToken,
  JwtPayload,
} from "../auth/auth-service";
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
  findById as findBusinessById,
  updateNameById,
  create as createBusinessInRepo,
  findBusinessByPhone,
  updateBusinessWithDuplicateInfo,
  normalizePhoneNumber,
  Business as BusinessRecord,
} from "../db/business-repository";

/**
 * Mock business data for search
 */
const MOCK_BUSINESSES = [
  {
    id: '1',
    name: 'Soul Food Kitchen',
    category: 'Food & Dining',
    rating: 4.8,
    reviewCount: 156,
    location: 'Harlem, NY',
    isVerified: true,
    imageUrl: '',
    description: 'Authentic Southern cuisine with a modern twist. Family-owned since 1985.',
    tags: ['Southern', 'Family-Friendly', 'Takeout'],
  },
  {
    id: '2',
    name: 'Black Diamond Consulting',
    category: 'Professional Services',
    rating: 5.0,
    reviewCount: 42,
    location: 'Atlanta, GA',
    isVerified: true,
    imageUrl: '',
    description: 'Strategic business consulting for Black-owned enterprises and startups.',
    tags: ['Consulting', 'Business Strategy', 'B2B'],
  },
  {
    id: '3',
    name: 'Afro Threads',
    category: 'Retail & Fashion',
    rating: 4.5,
    reviewCount: 89,
    location: 'Los Angeles, CA',
    isVerified: false,
    imageUrl: '',
    description: 'Contemporary fashion inspired by African heritage and modern streetwear.',
    tags: ['Clothing', 'Accessories', 'African-Inspired'],
  },
  {
    id: '4',
    name: 'Heritage Wellness Center',
    category: 'Health & Wellness',
    rating: 4.9,
    reviewCount: 203,
    location: 'Chicago, IL',
    isVerified: true,
    imageUrl: '',
    description: 'Holistic health services including massage, acupuncture, and nutrition counseling.',
    tags: ['Wellness', 'Massage', 'Holistic'],
  },
  {
    id: '5',
    name: 'Golden Era Barbershop',
    category: 'Personal Services',
    rating: 4.7,
    reviewCount: 312,
    location: 'Houston, TX',
    isVerified: true,
    imageUrl: '',
    description: 'Classic barbershop experience with modern styling. Community hub since 1978.',
    tags: ['Barber', 'Grooming', 'Community'],
  },
  {
    id: '6',
    name: 'Rhythm & Blues Records',
    category: 'Entertainment',
    rating: 4.6,
    reviewCount: 78,
    location: 'New Orleans, LA',
    isVerified: false,
    imageUrl: '',
    description: 'Vinyl records, rare finds, and custom audio equipment. Music lovers paradise.',
    tags: ['Music', 'Vinyl', 'Audio'],
  },
];

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
 * Calculate relevance score for a business based on query match
 * Higher scores for matches in more prominent fields (name > description > category/location > tags)
 */
function calculateRelevanceScore(business: typeof MOCK_BUSINESSES[0], query: string): number {
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
function businessRecordToGraphql(business: BusinessRecord) {
  return {
    id: business.id,
    name: business.name,
    categoryId: business.category_id,
    verified: business.verified,
    createdAt: {
      timestamp: Math.floor(business.created_at.getTime() / 1000),
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

  // Verify ownership - only the business owner can update
  const updatedBusiness = await updateNameById(id, name, userId);

  if (!updatedBusiness) {
    return {
      success: false,
      error: "Business not found or you are not the owner",
    };
  }

  return {
    success: true,
    business: businessRecordToGraphql(updatedBusiness),
  };
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
  const { query, page = 1, pageSize = 10 } = args;

  // Check cache first
  const cached = await getCachedResponse("searchBusinesses", { query, page, pageSize });
  if (cached) {
    return cached as {
      businesses: unknown[];
      total: number;
      page: number;
      pageSize: number;
      totalPages: number;
    };
  }

  const normalizedQuery = query.toLowerCase().trim();

  // If query is empty, return all businesses with no ranking
  if (!normalizedQuery) {
    const total = MOCK_BUSINESSES.length;
    const totalPages = Math.ceil(total / pageSize);
    const startIndex = (page - 1) * pageSize;
    const endIndex = startIndex + pageSize;
    const paginatedBusinesses = MOCK_BUSINESSES.slice(startIndex, endIndex);

    // Calculate facets for all businesses
    const categoryCounts: Record<string, number> = {};
    for (const business of MOCK_BUSINESSES) {
      categoryCounts[business.category] = (categoryCounts[business.category] || 0) + 1;
    }
    const facets = Object.entries(categoryCounts)
      .map(([category, count]) => ({ category, count }))
      .sort((a, b) => b.count - a.count);

    return {
      businesses: paginatedBusinesses,
      total,
      page,
      pageSize,
      totalPages,
      facets,
    };
  }

  // Score and filter businesses
  const scoredBusinesses = MOCK_BUSINESSES
    .map((business) => ({
      business,
      score: calculateRelevanceScore(business, normalizedQuery),
    }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score); // Sort by relevance score descending

  // Calculate facets from matched businesses
  const categoryCounts: Record<string, number> = {};
  for (const { business } of scoredBusinesses) {
    categoryCounts[business.category] = (categoryCounts[business.category] || 0) + 1;
  }
  const facets = Object.entries(categoryCounts)
    .map(([category, count]) => ({ category, count }))
    .sort((a, b) => b.count - a.count);

  // Paginate ranked results
  const total = scoredBusinesses.length;
  const totalPages = Math.ceil(total / pageSize);
  const startIndex = (page - 1) * pageSize;
  const endIndex = startIndex + pageSize;
  const paginatedBusinesses = scoredBusinesses
    .slice(startIndex, endIndex)
    .map((item) => item.business);

  const result = {
    businesses: paginatedBusinesses,
    total,
    page,
    pageSize,
    totalPages,
    facets,
  };

  // Cache the response
  await cacheResponse("searchBusinesses", { query, page, pageSize }, result);

  return result;
}

/**
 * Convert Business entity to GraphQL Business type
 */
function businessToGraphqlBusiness(business: Business): {
  id: string;
  name: string;
  categoryId: string;
  verified: boolean;
  createdAt: { timestamp: number };
  phone: string | undefined;
  potentialDuplicateId: string | undefined;
} {
  // Handle both camelCase (Business type) and snake_case (raw DB rows)
  const createdAtDate = business.createdAt || (business as Record<string, unknown>).created_at as Date;
  const categoryId = business.categoryId || (business as Record<string, unknown>).category_id as string;
  return {
    id: business.id,
    name: business.name,
    categoryId: categoryId,
    verified: business.verificationStatus === "verified",
    createdAt: { timestamp: Math.floor(createdAtDate.getTime() / 1000) },
    phone: business.phone,
    potentialDuplicateId: business.potentialDuplicateId,
  };
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
  args: { input: { name: string; description?: string; categoryId: string; phone?: string } },
  context: unknown
): Promise<{
  success: boolean;
  business?: unknown;
  error?: string;
  isPotentialDuplicate?: boolean;
  existingBusinessId?: string;
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
    // Check for duplicate phone number if provided
    let existingBusinessId: string | undefined;
    let isPotentialDuplicate = false;

    if (input.phone && input.phone.trim() !== "") {
      const existingBusiness = await findBusinessByPhone(client, input.phone.trim());
      if (existingBusiness) {
        isPotentialDuplicate = true;
        existingBusinessId = existingBusiness.id;
      }
    }

    const business = await createBusinessInDb(
      client,
      userId,
      input.name.trim(),
      input.description?.trim(),
      input.categoryId.trim(),
      input.phone?.trim(),
      existingBusinessId
    );

    return {
      success: true,
      business: businessToGraphqlBusiness(business),
      isPotentialDuplicate,
      existingBusinessId,
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
async function createBusinessInDb(
  client: import("pg").PoolClient,
  ownerId: string,
  name: string,
  description: string | undefined,
  categoryId: string,
  phone?: string,
  potentialDuplicateId?: string
): Promise<Business> {
  const schema = process.env.POSTGRES_SCHEMA;
  const tableName = schema ? `${schema}.businesses` : "businesses";
  const normalizedPhone = phone ? normalizePhoneNumber(phone) : undefined;
  const result = await client.query<Business>(
    `INSERT INTO ${tableName} (owner_id, name, description, category_id, verification_status, phone, potential_duplicate_id)
     VALUES ($1, $2, $3, $4, 'unverified', $5, $6)
     RETURNING *`,
    [ownerId, name, description || null, categoryId, normalizedPhone || null, potentialDuplicateId || null]
  );
  return result.rows[0];
}

/**
 * Get pending businesses query resolver
 */
export async function pendingBusinesses(): Promise<unknown[]> {
  const client = await getPool().connect();
  try {
    const schema = process.env.POSTGRES_SCHEMA;
    const tableName = schema ? `${schema}.businesses` : "businesses";
    const result = await client.query(
      `SELECT * FROM ${tableName} WHERE verification_status = 'unverified' ORDER BY created_at DESC`
    );
    return result.rows.map(businessToGraphqlBusiness);
  } catch (error) {
    console.error("Error fetching pending businesses:", error);
    return [];
  } finally {
    client.release();
  }
}

/**
 * Bulk approve businesses mutation resolver
 */
export async function approveBusinesses(
  _parent: unknown,
  args: { businessIds: string[] }
): Promise<{
  success: boolean;
  approvedCount: number;
  failedIds: string[];
  error?: string;
}> {
  const { businessIds } = args;

  if (!businessIds || businessIds.length === 0) {
    return {
      success: false,
      approvedCount: 0,
      failedIds: [],
      error: "No business IDs provided",
    };
  }

  const client = await getPool().connect();
  try {
    const schema = process.env.POSTGRES_SCHEMA;
    const tableName = schema ? `${schema}.businesses` : "businesses";

    const approvedIds: string[] = [];
    const failedIds: string[] = [];

    for (const businessId of businessIds) {
      try {
        const result = await client.query(
          `UPDATE ${tableName} SET verification_status = 'verified', updated_at = NOW() WHERE id = $1 RETURNING id`,
          [businessId]
        );

        if (result.rows.length > 0) {
          approvedIds.push(businessId);
        } else {
          failedIds.push(businessId);
        }
      } catch (error) {
        console.error(`Error approving business ${businessId}:`, error);
        failedIds.push(businessId);
      }
    }

    return {
      success: approvedIds.length > 0,
      approvedCount: approvedIds.length,
      failedIds,
    };
  } catch (error) {
    console.error("Bulk approval error:", error);
    return {
      success: false,
      approvedCount: 0,
      failedIds: businessIds,
      error: error instanceof Error ? error.message : "Failed to approve businesses",
    };
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
    searchBusinesses,
    pendingBusinesses,
  },
  Mutation: {
    register,
    createBusiness,
    submitVerification,
    updateBusiness,
    approveBusinesses,
  },
};
