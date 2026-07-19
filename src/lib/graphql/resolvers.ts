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
 * Convert business record to GraphQL Business type
 */
function businessToGraphqlBusiness(business: BusinessRecord) {
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
    business: businessToGraphqlBusiness(updatedBusiness),
  };
}

/**
 * Search businesses resolver with pagination and caching
 */
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

  // Filter businesses by search query (name, description, tags, category, location)
  const filtered = MOCK_BUSINESSES.filter((business) => {
    if (!normalizedQuery) return true;

    const nameMatch = business.name.toLowerCase().includes(normalizedQuery);
    const descMatch = business.description?.toLowerCase().includes(normalizedQuery);
    const categoryMatch = business.category.toLowerCase().includes(normalizedQuery);
    const tagMatch = business.tags?.some((tag) =>
      tag.toLowerCase().includes(normalizedQuery)
    );
    const locationMatch = business.location.toLowerCase().includes(normalizedQuery);

    return nameMatch || descMatch || categoryMatch || tagMatch || locationMatch;
  });

  const total = filtered.length;
  const totalPages = Math.ceil(total / pageSize);
  const startIndex = (page - 1) * pageSize;
  const endIndex = startIndex + pageSize;
  const paginatedBusinesses = filtered.slice(startIndex, endIndex);

  const result = {
    businesses: paginatedBusinesses,
    total,
    page,
    pageSize,
    totalPages,
  };

  // Cache the response
  await cacheResponse("searchBusinesses", { query, page, pageSize }, result);

  return result;
}

/**
 * Resolvers object
 */
export const resolvers = {
  Query: {
    health,
    searchBusinesses,
  },
  Mutation: {
    register,
    submitVerification,
    updateBusiness,
  },
};
