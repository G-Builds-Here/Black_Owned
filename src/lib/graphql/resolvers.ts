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
 * Search businesses resolver with pagination, relevance ranking, and category facets
 */
export function searchBusinesses(
  _parent: unknown,
  args: { query: string; page?: number; pageSize?: number }
): {
  businesses: typeof MOCK_BUSINESSES[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  facets: { category: string; count: number }[];
} {
  const { query, page = 1, pageSize = 10 } = args;
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

  return {
    businesses: paginatedBusinesses,
    total,
    page,
    pageSize,
    totalPages,
    facets,
  };
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
  },
};
