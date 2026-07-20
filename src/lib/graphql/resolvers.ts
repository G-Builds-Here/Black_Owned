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
} from "../auth/auth-service";
import {
  validatePassword,
  isValidEmail,
  User,
} from "../../types/user";
import { storeRefreshToken } from "../valkey/valkey-client";
import { getPool } from "../db/user-repository";
import { Business } from "../../types/business";

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
 * Search businesses resolver with pagination
 */
export function searchBusinesses(
  _parent: unknown,
  args: { query: string; page?: number; pageSize?: number }
): {
  businesses: unknown[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
} {
  const { query, page = 1, pageSize = 10 } = args;
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

  return {
    businesses: paginatedBusinesses,
    total,
    page,
    pageSize,
    totalPages,
  };
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
} {
  return {
    id: business.id,
    name: business.name,
    categoryId: business.categoryId,
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
    searchBusinesses,
  },
  Mutation: {
    register,
    createBusiness,
  },
};
