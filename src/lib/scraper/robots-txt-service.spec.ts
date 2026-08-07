/**
 * Robots.txt Service Tests
 */

import {
  parseRobotsTxt,
  isPathAllowed,
  pathMatches,
  extractDomain,
  getRobotsTxtUrl,
} from './robots-txt-service';

describe('parseRobotsTxt', () => {
  it('should parse basic robots.txt content', () => {
    const content = `
User-agent: *
Disallow: /admin
Disallow: /private
Allow: /public
`;

    const result = parseRobotsTxt(content, 'example.com');

    expect(result.domain).toBe('example.com');
    expect(result.rules).toHaveLength(3);
    expect(result.rules[0]).toEqual({
      path: '/admin',
      allowed: false,
      userAgent: '*',
    });
    expect(result.rules[1]).toEqual({
      path: '/private',
      allowed: false,
      userAgent: '*',
    });
    expect(result.rules[2]).toEqual({
      path: '/public',
      allowed: true,
      userAgent: '*',
    });
  });

  it('should handle multiple user agents', () => {
    const content = `
User-agent: Googlebot
Disallow: /secret

User-agent: *
Disallow: /admin
`;

    const result = parseRobotsTxt(content, 'example.com');

    expect(result.rules).toHaveLength(2);
    expect(result.rules[0].userAgent).toBe('Googlebot');
    expect(result.rules[1].userAgent).toBe('*');
  });

  it('should ignore comments and empty lines', () => {
    const content = `
# This is a comment
User-agent: *

# Another comment
Disallow: /private

Sitemap: https://example.com/sitemap.xml
`;

    const result = parseRobotsTxt(content, 'example.com');

    expect(result.rules).toHaveLength(1);
    expect(result.rules[0].path).toBe('/private');
  });

  it('should handle empty content', () => {
    const result = parseRobotsTxt('', 'example.com');

    expect(result.rules).toHaveLength(0);
    expect(result.domain).toBe('example.com');
  });

  it('should handle malformed lines gracefully', () => {
    const content = `
User-agent: *
InvalidLineWithoutColon
Disallow: /admin
`;

    const result = parseRobotsTxt(content, 'example.com');

    expect(result.rules).toHaveLength(1);
    expect(result.rules[0].path).toBe('/admin');
  });
});

describe('isPathAllowed', () => {
  let robotsData: ReturnType<typeof parseRobotsTxt>;

  beforeEach(() => {
    const content = `
User-agent: *
Disallow: /admin
Disallow: /private
Allow: /public
`;
    robotsData = parseRobotsTxt(content, 'example.com');
  });

  it('should allow paths not covered by rules', () => {
    expect(isPathAllowed(robotsData, '/home')).toBe(true);
    expect(isPathAllowed(robotsData, '/search')).toBe(true);
  });

  it('should disallow disallowed paths', () => {
    expect(isPathAllowed(robotsData, '/admin')).toBe(false);
    expect(isPathAllowed(robotsData, '/private')).toBe(false);
  });

  it('should allow explicitly allowed paths', () => {
    expect(isPathAllowed(robotsData, '/public')).toBe(true);
  });

  it('should match path prefixes', () => {
    expect(isPathAllowed(robotsData, '/admin/users')).toBe(false);
    expect(isPathAllowed(robotsData, '/private/data')).toBe(false);
  });

  it('should prefer more specific rules', () => {
    const content = `
User-agent: *
Disallow: /api
Allow: /api/public
`;
    const data = parseRobotsTxt(content, 'example.com');

    expect(isPathAllowed(data, '/api')).toBe(false);
    expect(isPathAllowed(data, '/api/public')).toBe(true);
  });

  it('should handle user-agent specific rules', () => {
    const content = `
User-agent: Googlebot
Disallow: /secret

User-agent: *
Disallow: /admin
`;
    const data = parseRobotsTxt(content, 'example.com');

    // Googlebot can access /admin
    expect(isPathAllowed(data, '/admin', 'Googlebot')).toBe(true);
    // Other user agents cannot
    expect(isPathAllowed(data, '/admin', 'MyBot')).toBe(false);
    // Googlebot cannot access /secret
    expect(isPathAllowed(data, '/secret', 'Googlebot')).toBe(false);
  });

  it('should default to allowed when no rules match', () => {
    const content = `
User-agent: Googlebot
Disallow: /secret
`;
    const data = parseRobotsTxt(content, 'example.com');

    // MyBot has no rules, so everything is allowed
    expect(isPathAllowed(data, '/anything', 'MyBot')).toBe(true);
  });
});

describe('pathMatches', () => {
  it('should match exact paths', () => {
    expect(pathMatches('/admin', '/admin')).toBe(true);
    expect(pathMatches('/admin', '/home')).toBe(false);
  });

  it('should match path prefixes', () => {
    expect(pathMatches('/admin', '/admin/users')).toBe(true);
    expect(pathMatches('/api', '/api/v1/users')).toBe(true);
  });

  it('should handle wildcard patterns', () => {
    expect(pathMatches('/admin/*', '/admin/users')).toBe(true);
    expect(pathMatches('/admin/*', '/admin')).toBe(true);
    expect(pathMatches('/admin/*', '/administrator')).toBe(false);
  });

  it('should handle root path', () => {
    expect(pathMatches('/', '/admin')).toBe(true);
    expect(pathMatches('/', '/')).toBe(true);
  });

  it('should handle empty pattern', () => {
    expect(pathMatches('', '/admin')).toBe(true);
  });
});

describe('extractDomain', () => {
  it('should extract hostname from URL', () => {
    expect(extractDomain('https://example.com/path')).toBe('example.com');
    expect(extractDomain('http://google.com/search')).toBe('google.com');
  });

  it('should handle URLs with ports', () => {
    expect(extractDomain('https://example.com:8080/path')).toBe('example.com');
  });

  it('should return empty string for invalid URL', () => {
    expect(extractDomain('not-a-url')).toBe('');
  });
});

describe('getRobotsTxtUrl', () => {
  it('should build robots.txt URL from base URL', () => {
    expect(getRobotsTxtUrl('https://example.com')).toBe('https://example.com/robots.txt');
    expect(getRobotsTxtUrl('https://example.com/path')).toBe('https://example.com/robots.txt');
  });

  it('should preserve protocol', () => {
    expect(getRobotsTxtUrl('http://example.com')).toBe('http://example.com/robots.txt');
    expect(getRobotsTxtUrl('https://example.com')).toBe('https://example.com/robots.txt');
  });

  it('should return empty string for invalid URL', () => {
    expect(getRobotsTxtUrl('not-a-url')).toBe('');
  });
});
