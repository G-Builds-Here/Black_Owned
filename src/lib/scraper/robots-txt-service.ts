/**
 * Robots.txt Service
 *
 * Fetches and parses robots.txt files to determine which paths
 * are allowed or disallowed for scraping.
 */

export interface RobotsTxtRule {
  path: string;
  allowed: boolean;
  userAgent: string;
}

export interface RobotsTxtData {
  domain: string;
  rules: RobotsTxtRule[];
  fetchedAt: Date;
  rawContent: string;
}

/**
 * Parses a robots.txt content string into structured rules
 */
export function parseRobotsTxt(content: string, domain: string): RobotsTxtData {
  const rules: RobotsTxtRule[] = [];
  const lines = content.split('\n');
  let currentAgent = '*';

  for (const line of lines) {
    const trimmed = line.trim();

    // Skip empty lines and comments
    if (trimmed === '' || trimmed.startsWith('#')) {
      continue;
    }

    const colonIndex = trimmed.indexOf(':');
    if (colonIndex === -1) {
      continue;
    }

    const directive = trimmed.substring(0, colonIndex).toLowerCase().trim();
    const value = trimmed.substring(colonIndex + 1).trim();

    switch (directive) {
      case 'user-agent':
        currentAgent = value;
        break;

      case 'disallow':
        if (value) {
          rules.push({
            path: value,
            allowed: false,
            userAgent: currentAgent,
          });
        }
        break;

      case 'allow':
        if (value) {
          rules.push({
            path: value,
            allowed: true,
            userAgent: currentAgent,
          });
        }
        break;

      case 'sitemap':
        // Sitemap directive is informational, not a access rule
        break;

      default:
        // Unknown directive, ignore
        break;
    }
  }

  return {
    domain,
    rules,
    fetchedAt: new Date(),
    rawContent: content,
  };
}

/**
 * Checks if a path is allowed based on robots.txt rules
 *
 * Rules are evaluated in order:
 * - More specific rules (longer paths) take precedence
 * - Allow rules override disallow rules at the same specificity
 * - User-agent specific rules take precedence over '*' rules
 */
export function isPathAllowed(robotsData: RobotsTxtData, path: string, userAgent: string = '*'): boolean {
  // First, try to find rules specific to this user agent
  const specificRules = robotsData.rules.filter(
    (rule) => rule.userAgent === userAgent
  );

  // If there are specific rules for this user agent, use only those
  let applicableRules = specificRules;

  // If no specific rules, fall back to '*' rules
  if (applicableRules.length === 0) {
    applicableRules = robotsData.rules.filter(
      (rule) => rule.userAgent === '*'
    );
  }

  if (applicableRules.length === 0) {
    // No rules apply, default is allowed
    return true;
  }

  // Find the most specific matching rule
  let bestMatch: RobotsTxtRule | null = null;
  let bestMatchLength = 0;

  for (const rule of applicableRules) {
    if (pathMatches(rule.path, path)) {
      if (rule.path.length > bestMatchLength) {
        bestMatch = rule;
        bestMatchLength = rule.path.length;
      }
    }
  }

  // If no rule matches, default is allowed
  if (bestMatch === null) {
    return true;
  }

  return bestMatch.allowed;
}

/**
 * Checks if a path matches a robots.txt pattern
 *
 * Supports:
 * - Exact match: /admin matches /admin
 * - Prefix match: /admin matches /admin/users
 * - Wildcard: /admin/* matches /admin, /admin/users, /admin/settings, etc.
 */
export function pathMatches(pattern: string, path: string): boolean {
  if (!pattern || pattern === '/') {
    // Empty pattern or root matches everything
    return true;
  }

  // Handle wildcard patterns: /admin/* should match /admin, /admin/users, etc.
  if (pattern.endsWith('*')) {
    const prefix = pattern.slice(0, -1); // Remove the * -> /admin/
    // Match if path equals the prefix (without trailing slash) or starts with prefix
    // e.g., /admin/* matches /admin and /admin/users
    const basePattern = prefix.endsWith('/') ? prefix.slice(0, -1) : prefix;
    return path === basePattern || path.startsWith(prefix);
  }

  // Check if path starts with the pattern (prefix matching)
  return path.startsWith(pattern);
}

/**
 * Extracts the domain from a URL
 */
export function extractDomain(url: string): string {
  try {
    const urlObj = new URL(url);
    return urlObj.hostname;
  } catch {
    return '';
  }
}

/**
 * Builds the robots.txt URL for a given domain or base URL
 */
export function getRobotsTxtUrl(baseUrl: string): string {
  try {
    const urlObj = new URL(baseUrl);
    return `${urlObj.protocol}//${urlObj.hostname}/robots.txt`;
  } catch {
    return '';
  }
}
