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
  findScrapedBusinessesByStatus,
  updateScrapedBusinessStatus,
  findScrapedBusinessById,
  rejectScrapedBusiness,
} from "../db/scraped-business-repository";
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
  create as createBusiness,
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
function businessToGraphqlBusiness(business: BusinessRecord) {
  return {
    id: business.id,
    name: business.name,
    categoryId: business.category_id,
    rating: business.rating,
    reviewCount: business.review_count,
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
    business: businessToGraphqlBusiness(updatedBusiness),
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
 * Convert Business entity (from business-repository) to GraphQL Business type
 */
function businessRecordToGraphqlBusiness(business: Business): {
  id: string;
  name: string;
  categoryId: string;
  rating: number | null;
  reviewCount: number;
  verified: boolean;
  createdAt: { timestamp: number };
} {
  return {
    id: business.id,
    name: business.name,
    categoryId: business.categoryId,
    rating: business.rating,
    reviewCount: business.reviewCount,
    verified: business.verificationStatus === "verified",
    createdAt: { timestamp: Math.floor(business.createdAt.getTime() / 1000) },
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
  args: { input: { name: string; description?: string; categoryId: string; rating?: number; reviewCount?: number } },
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
      input.categoryId.trim(),
      input.rating ?? null,
      input.reviewCount ?? 0
    );

    return {
      success: true,
      business: businessRecordToGraphqlBusiness(business),
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
  rating: number | null = null,
  reviewCount: number = 0
): Promise<Business> {
  const tableName = "businesses";
  const result = await client.query<Business>(
    `INSERT INTO ${tableName} (owner_id, name, description, category_id, rating, review_count, verification_status)
     VALUES ($1, $2, $3, $4, $5, $6, 'unverified')
     RETURNING *`,
    [ownerId, name, description || null, categoryId, rating ?? null, reviewCount]
  );
  return result.rows[0];
}

/**
 * Approve business mutation resolver
 */
export async function approveBusiness(
  _parent: unknown,
  args: { businessId: string }
): Promise<{
  success: boolean;
  business?: unknown;
  error?: string;
}> {
  const { businessId } = args;

  // Validate business ID
  if (!businessId || businessId.trim() === "") {
    return {
      success: false,
      error: "Business ID is required",
    };
  }

  const client = await getPool().connect();
  try {
    // Check if business exists
    const business = await findScrapedBusinessById(client, businessId);

    if (!business) {
      return {
        success: false,
        error: "Business not found",
      };
    }

    // Update status to approved
    const updatedBusiness = await updateScrapedBusinessStatus(
      client,
      businessId,
      "approved"
    );

    if (!updatedBusiness) {
      return {
        success: false,
        error: "Failed to update business status",
      };
    }

    return {
      success: true,
      business: {
        id: updatedBusiness.id,
        name: updatedBusiness.name,
        address: updatedBusiness.address,
        source: updatedBusiness.source,
        rating: updatedBusiness.rating ?? null,
        createdAt: {
          timestamp: Math.floor(updatedBusiness.createdAt.getTime() / 1000),
        },
      },
    };
  } catch (error) {
    console.error("Error approving business:", error);
    return {
      success: false,
      error: "Failed to approve business",
    };
  } finally {
    client.release();
  }
}

/**
 * Reject business mutation resolver
 */
export async function rejectBusiness(
  _parent: unknown,
  args: { businessId: string; rejectionReason: string }
): Promise<{
  success: boolean;
  error?: string;
}> {
  const { businessId, rejectionReason } = args;

  // Validate business ID
  if (!businessId || businessId.trim() === "") {
    return {
      success: false,
      error: "Business ID is required",
    };
  }

  // Validate rejection reason
  if (!rejectionReason || rejectionReason.trim() === "") {
    return {
      success: false,
      error: "Rejection reason is required",
    };
  }

  const client = await getPool().connect();
  try {
    // Check if business exists
    const business = await findScrapedBusinessById(client, businessId);

    if (!business) {
      return {
        success: false,
        error: "Business not found",
      };
    }

    // Reject the business with reason
    const updatedBusiness = await rejectScrapedBusiness(client, {
      businessId,
      rejectionReason: rejectionReason.trim(),
    });

    if (!updatedBusiness) {
      return {
        success: false,
        error: "Failed to reject business",
      };
    }

    return {
      success: true,
    };
  } catch (error) {
    console.error("Error rejecting business:", error);
    return {
      success: false,
      error: "Failed to reject business",
    };
  } finally {
    client.release();
  }
}

/**
 * Pending businesses query resolver
 */
export async function pendingBusinesses(): Promise<unknown[]> {
  const client = await getPool().connect();
  try {
    const businesses = await findScrapedBusinessesByStatus(client, "pending_review");
    return businesses.map((b) => ({
      id: b.id,
      name: b.name,
      address: b.address,
      source: b.source,
      rating: b.rating ?? null,
      createdAt: {
        timestamp: Math.floor(b.createdAt.getTime() / 1000),
      },
    }));
  } catch (error) {
    console.error("Error fetching pending businesses:", error);
    return [];
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
    approveBusiness,
    rejectBusiness,
  },
};
