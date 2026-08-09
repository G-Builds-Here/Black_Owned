/**
 * Robots.txt Service
 *
 * Fetches and parses robots.txt files to determine which paths
 * are allowed or disallowed for scraping.
 */

import Robots from "robots-parser";
import type { Robots as RobotsType } from "robots-parser";

// Cache for robots.txt results (in-memory, per-session)
const robotsCache = new Map<string, { robots: RobotsType; fetchedAt: number }>();
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

export interface RobotsCheckResult {
  allowed: boolean;
  reason?: string;
}

/**
 * Extract the base URL (scheme + host) from a full URL
 */
export function getBaseUrl(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.protocol}//${parsed.host}`;
  } catch {
    return "";
  }
}

/**
 * Fetch and parse robots.txt for a given base URL
 */
export async function fetchRobotsTxt(baseUrl: string): Promise<RobotsType | null> {
  if (!baseUrl) {
    return null;
  }

  // Check cache first
  const cached = robotsCache.get(baseUrl);
  if (cached) {
    const age = Date.now() - cached.fetchedAt;
    if (age < CACHE_TTL_MS) {
      return cached.robots;
    }
    // Cache expired, remove it
    robotsCache.delete(baseUrl);
  }

  try {
    const robotsUrl = `${baseUrl}/robots.txt`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    const response = await fetch(robotsUrl, {
      method: "GET",
      headers: {
        "User-Agent": "BlackOwnedScraper/1.0",
      },
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      // robots.txt not found or error - default to allowing all
      const robots = Robots(baseUrl, "");
      robotsCache.set(baseUrl, { robots, fetchedAt: Date.now() });
      return robots;
    }

    const robotsTxt = await response.text();
    const robots = Robots(baseUrl, robotsTxt);
    robotsCache.set(baseUrl, { robots, fetchedAt: Date.now() });

    return robots;
  } catch (error) {
    console.warn(`Failed to fetch robots.txt from ${baseUrl}:`, error);
    // On error, default to allowing all
    const robots = Robots(baseUrl, "");
    robotsCache.set(baseUrl, { robots, fetchedAt: Date.now() });
    return robots;
  }
}

/**
 * Check if a URL path is allowed to be scraped
 */
export function isPathAllowed(robots: RobotsType | null, path: string, userAgent = "*"): boolean {
  if (!robots) {
    return true; // No robots.txt means allow all
  }

  // robots-parser expects full URLs, not just paths
  // Use a dummy base URL to construct a valid URL for the check
  const fullUrl = `https://example.com${path}`;
  const allowed = robots.isAllowed(fullUrl, userAgent);
  // isAllowed returns true/false/undefined - undefined means no rule matched, so allow by default
  return allowed !== false;
}

/**
 * Check if a URL is allowed to be scraped, fetching robots.txt if needed
 */
export async function checkUrlAllowed(
  url: string,
  userAgent = "*"
): Promise<RobotsCheckResult> {
  const baseUrl = getBaseUrl(url);
  if (!baseUrl) {
    return { allowed: false, reason: "Invalid URL" };
  }

  const robots = await fetchRobotsTxt(baseUrl);
  const path = new URL(url).pathname;
  const allowed = isPathAllowed(robots, path, userAgent);

  if (!allowed) {
    return {
      allowed: false,
      reason: `Path ${path} is disallowed by robots.txt`,
    };
  }

  return { allowed: true };
}

/**
 * Clear the robots.txt cache (useful for testing)
 */
export function clearRobotsCache(): void {
  robotsCache.clear();
}
