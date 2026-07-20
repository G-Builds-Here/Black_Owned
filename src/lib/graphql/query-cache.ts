/**
 * GraphQL Query Response Cache
 *
 * Uses Valkey to cache query results with a 30-second TTL.
 */

import { getValkey } from "../valkey/valkey-client";

/**
 * Cache TTL in seconds (30 seconds)
 */
const CACHE_TTL_SECONDS = 30;

/**
 * Cache key prefix for GraphQL queries
 */
const CACHE_KEY_PREFIX = "graphql:query:";

/**
 * Generate a cache key from a query name and arguments
 * @param queryName - The name of the GraphQL query
 * @param args - The query arguments
 * @returns A deterministic cache key string
 */
export function generateCacheKey(queryName: string, args: Record<string, unknown>): string {
  // Sort args keys for consistent key generation
  const sortedArgs = Object.keys(args)
    .sort()
    .reduce((acc, key) => {
      acc[key] = args[key];
      return acc;
    }, {} as Record<string, unknown>);

  const argsString = JSON.stringify(sortedArgs);
  return `${CACHE_KEY_PREFIX}${queryName}:${argsString}`;
}

/**
 * Check if a query should be cached
 * Currently caches only read queries (not mutations)
 * @param queryName - The name of the GraphQL query
 * @returns True if the query should be cached
 */
export function shouldCacheQuery(queryName: string): boolean {
  // Only cache queries, not mutations
  const cacheableQueries = ["searchBusinesses", "business"];
  return cacheableQueries.includes(queryName);
}

/**
 * Get cached response for a query
 * @param queryName - The name of the GraphQL query
 * @param args - The query arguments
 * @returns The cached response or null if not found/expired
 */
export async function getCachedResponse(
  queryName: string,
  args: Record<string, unknown>
): Promise<unknown | null> {
  if (!shouldCacheQuery(queryName)) {
    return null;
  }

  const cacheKey = generateCacheKey(queryName, args);
  const client = getValkey();

  try {
    const cached = await client.get(cacheKey);
    if (cached) {
      console.log(`Cache HIT for query: ${queryName}`);
      return JSON.parse(cached);
    }
    console.log(`Cache MISS for query: ${queryName}`);
    return null;
  } catch (error) {
    console.error(`Error retrieving cache for ${queryName}:`, error);
    return null;
  }
}

/**
 * Store response in cache
 * @param queryName - The name of the GraphQL query
 * @param args - The query arguments
 * @param response - The response to cache
 */
export async function cacheResponse(
  queryName: string,
  args: Record<string, unknown>,
  response: unknown
): Promise<void> {
  if (!shouldCacheQuery(queryName)) {
    return;
  }

  const cacheKey = generateCacheKey(queryName, args);
  const client = getValkey();

  try {
    const serialized = JSON.stringify(response);
    await client.setex(cacheKey, CACHE_TTL_SECONDS, serialized);
    console.log(`Cached response for ${queryName} with TTL: ${CACHE_TTL_SECONDS}s`);
  } catch (error) {
    console.error(`Error caching response for ${queryName}:`, error);
  }
}

/**
 * Invalidate cache for a specific query
 * @param queryName - The name of the GraphQL query
 * @param args - The query arguments (optional - if not provided, all queries with that name are invalidated)
 */
export async function invalidateCache(
  queryName: string,
  args?: Record<string, unknown>
): Promise<void> {
  const client = getValkey();

  try {
    if (args) {
      // Invalidate specific query
      const cacheKey = generateCacheKey(queryName, args);
      await client.del(cacheKey);
      console.log(`Invalidated cache for: ${queryName}`);
    } else {
      // Invalidate all queries with this name (using pattern matching)
      const pattern = `${CACHE_KEY_PREFIX}${queryName}:*`;
      const keys = await client.keys(pattern);
      if (keys.length > 0) {
        await client.del(...keys);
        console.log(`Invalidated ${keys.length} cache entries for: ${queryName}`);
      }
    }
  } catch (error) {
    console.error(`Error invalidating cache for ${queryName}:`, error);
  }
}

/**
 * Clear all GraphQL query cache
 */
export async function clearAllCache(): Promise<void> {
  const client = getValkey();

  try {
    const pattern = `${CACHE_KEY_PREFIX}*`;
    const keys = await client.keys(pattern);
    if (keys.length > 0) {
      await client.del(...keys);
      console.log(`Cleared ${keys.length} GraphQL cache entries`);
    }
  } catch (error) {
    console.error("Error clearing GraphQL cache:", error);
  }
}
