/**
 * Test Data Seeder
 *
 * Provides utilities for seeding test data with consistent BWS-TEST markers
 * to enable easy identification, querying, and cleanup of test data.
 *
 * Naming Conventions:
 * - Business names: "BWS-TEST: <Business Name>"
 * - User emails: "bws-test@domain.com" pattern
 */

import { BusinessImageData, generateImagesForBusiness } from "../services/image-service";

export const TEST_PREFIX = "BWS-TEST";
export const TEST_EMAIL_DOMAIN = "bws-test@domain.com";

export interface TestBusiness {
  id?: string;
  name: string;
  formattedName: string;
  description?: string;
  category?: string;
}

export interface TestBusinessWithImages extends TestBusiness {
  images: BusinessImageData;
}

export interface TestUser {
  id?: string;
  email?: string;
  firstName: string;
  lastName: string;
  formattedEmail: string;
}

export interface TestSeedData {
  businesses: TestBusiness[];
  users: TestUser[];
}

/**
 * Formats a business name with the BWS-TEST prefix
 */
export function formatBusinessName(name: string): string {
  return `${TEST_PREFIX}: ${name}`;
}

/**
 * Formats a user email with the bws-test domain pattern
 */
export function formatUserEmail(baseName: string): string {
  const slug = baseName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return `${slug}@${TEST_EMAIL_DOMAIN}`;
}

/**
 * Checks if a business name is test data
 */
export function isTestBusiness(name: string): boolean {
  return name.startsWith(`${TEST_PREFIX}:`);
}

/**
 * Checks if an email is test data
 */
export function isTestEmail(email: string): boolean {
  return email.endsWith(`@${TEST_EMAIL_DOMAIN}`);
}

/**
 * Category definitions for business seeding (10 categories, 3 businesses each = 30 total)
 */
export const BUSINESS_CATEGORIES = [
  "restaurants",
  "retail",
  "professional services",
  "health/wellness",
  "beauty",
  "home services",
  "entertainment",
  "fitness",
  "education",
  "automotive",
];

/**
 * Business name templates organized by category
 */
export const BUSINESS_TEMPLATES_BY_CATEGORY: Record<string, string[]> = {
  restaurants: [
    "Soul Food Kitchen",
    "Barbecue House",
    "Gourmet Bistro",
  ],
  retail: [
    "Community Market",
    "Urban Boutique",
    "Neighborhood Store",
  ],
  "professional services": [
    "Business Consulting Group",
    "Financial Advisors LLC",
    "Legal Associates",
  ],
  "health/wellness": [
    "Wellness Center",
    "Holistic Health Clinic",
    "Community Pharmacy",
  ],
  beauty: [
    "Glamour Salon",
    "Natural Beauty Spa",
    "Elite Hair Studio",
  ],
  "home services": [
    "Quality Plumbing Co",
    "Expert Electrical Services",
    "Reliable HVAC Solutions",
  ],
  entertainment: [
    "City Cinema",
    "Music Lounge",
    "Event Productions",
  ],
  fitness: [
    "Power Gym",
    "Yoga Studio",
    "CrossFit Community",
  ],
  education: [
    "Learning Academy",
    "Tutoring Center",
    "Skill Development Institute",
  ],
  automotive: [
    "Auto Care Center",
    "Quick Oil Change",
    "Premium Tire Shop",
  ],
};

/**
 * Generates sample test business data with category assignment
 */
export function generateTestBusinesses(count: number = 5): TestBusiness[] {
  const businesses: TestBusiness[] = [];

  for (let i = 0; i < count; i++) {
    const categoryIndex = i % BUSINESS_CATEGORIES.length;
    const category = BUSINESS_CATEGORIES[categoryIndex];
    const templates = BUSINESS_TEMPLATES_BY_CATEGORY[category];
    const templateIndex = Math.floor(i / BUSINESS_CATEGORIES.length) % templates.length;
    const template = templates[templateIndex];
    const suffix = templateIndex >= templates.length ? ` ${templateIndex + 1}` : "";
    const name = `${template}${suffix}`;

    businesses.push({
      name,
      formattedName: formatBusinessName(name),
      description: `Test business in ${category} category - ${name}`,
      category,
    });
  }

  return businesses;
}

/**
 * Generates sample test user data
 */
export function generateTestUsers(count: number = 5): TestUser[] {
  const userTemplates = [
    { first: "John", last: "Doe" },
    { first: "Jane", last: "Smith" },
    { first: "Michael", last: "Johnson" },
    { first: "Sarah", last: "Williams" },
    { first: "David", last: "Brown" },
  ];

  return Array.from({ length: count }, (_, i) => {
    const template = userTemplates[i % userTemplates.length];
    const suffix = count > userTemplates.length ? `${i + 1}` : "";
    const fullName = `${template.first}${suffix} ${template.last}`;

    return {
      firstName: template.first,
      lastName: template.last,
      formattedEmail: formatUserEmail(fullName),
    };
  });
}

/**
 * Generates complete test seed data
 */
export function generateTestSeedData(
  businessCount: number = 5,
  userCount: number = 5
): TestSeedData {
  return {
    businesses: generateTestBusinesses(businessCount),
    users: generateTestUsers(userCount),
  };
}

/**
 * Generates 30 businesses with images for AC3
 * Each business gets 2-4 images with category-appropriate alt text
 */
export function generateBusinessesWithImages(
  businessCount: number = 30
): TestBusinessWithImages[] {
  const businesses = generateTestBusinesses(businessCount);
  const results: TestBusinessWithImages[] = [];

  businesses.forEach((business, index) => {
    const businessId = `bws-test-biz-${String(index + 1).padStart(3, "0")}`;
    const category = business.category || "restaurants";

    const images = generateImagesForBusiness(
      businessId,
      business.formattedName,
      category
    );

    results.push({
      ...business,
      id: businessId,
      images,
    });
  });

  return results;
}

/**
 * SQL queries for test data cleanup
 */
export const TEST_DATA_QUERIES = {
  // Find all test businesses
  findTestBusinesses: `
    SELECT * FROM businesses
    WHERE name LIKE 'BWS-TEST:%'
    ORDER BY created_at DESC;
  `,

  // Delete all test businesses
  deleteTestBusinesses: `
    DELETE FROM businesses
    WHERE name LIKE 'BWS-TEST:%';
  `,

  // Count test businesses
  countTestBusinesses: `
    SELECT COUNT(*) as test_count
    FROM businesses
    WHERE name LIKE 'BWS-TEST:%';
  `,

  // Find all test users
  findTestUsers: `
    SELECT * FROM users
    WHERE email LIKE '%@bws-test@domain.com'
    ORDER BY created_at DESC;
  `,

  // Delete all test users
  deleteTestUsers: `
    DELETE FROM users
    WHERE email LIKE '%@bws-test@domain.com';
  `,

  // Count test users
  countTestUsers: `
    SELECT COUNT(*) as test_count
    FROM users
    WHERE email LIKE '%@bws-test@domain.com';
  `,

  // Find all test data across tables
  findAllTestData: `
    SELECT 'businesses' as table_name, COUNT(*) as count
    FROM businesses WHERE name LIKE 'BWS-TEST:%'
    UNION ALL
    SELECT 'users' as table_name, COUNT(*) as count
    FROM users WHERE email LIKE '%@bws-test@domain.com';
  `,
};
