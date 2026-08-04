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

export const TEST_PREFIX = "BWS-TEST";
export const TEST_EMAIL_DOMAIN = "bws-test@domain.com";

export interface TestBusiness {
  id?: string;
  name: string;
  formattedName: string;
  description?: string;
  address?: string;
}

export interface TestBusinessWithImages extends TestBusiness {
  category?: string;
  imageCount?: number;
}

export type UserRole = "customer" | "business_owner" | "admin";

export interface TestUser {
  id?: string;
  email?: string;
  firstName: string;
  lastName: string;
  formattedEmail: string;
  role: UserRole;
  associatedBusinessId?: string; // For business owners: links to a TestBusiness
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
 * Generates sample test business data with IDs
 */
export function generateTestBusinesses(count: number = 5): TestBusiness[] {
  const businessTemplates = [
    { name: "Black Beauty Salon", address: "123 Main St, Atlanta, GA", category: "health-wellness" },
    { name: "Community Grocery Store", address: "456 Oak Ave, Atlanta, GA", category: "food-dining" },
    { name: "Tech Solutions LLC", address: "789 Tech Blvd, Atlanta, GA", category: "professional-services" },
    { name: "Family Restaurant", address: "321 Food Lane, Atlanta, GA", category: "food-dining" },
    { name: "Fitness Center", address: "555 Health Way, Atlanta, GA", category: "health-wellness" },
    { name: "Bookstore & Cafe", address: "777 Book St, Atlanta, GA", category: "retail-fashion" },
    { name: "Auto Repair Shop", address: "999 Garage Rd, Atlanta, GA", category: "automotive" },
    { name: "Hair Studio", address: "111 Style Ave, Atlanta, GA", category: "health-wellness" },
  ];

  return Array.from({ length: count }, (_, i) => {
    const template = businessTemplates[i % businessTemplates.length];
    const suffix = count > businessTemplates.length ? ` (${i + 1})` : "";
    const name = `${template.name}${suffix}`;

    return {
      id: `biz-${i + 1}`,
      name,
      formattedName: formatBusinessName(name),
      description: `Test business - ${name}`,
      address: template.address,
      category: template.category,
    };
  });
}

/**
 * Generates test businesses with image metadata for seeding
 * Returns businesses with category and image count for image generation
 */
export function generateBusinessesWithImages(count: number = 5): TestBusinessWithImages[] {
  const businesses = generateTestBusinesses(count);
  return businesses.map((biz) => ({
    ...biz,
    category: biz.category || "other",
    imageCount: Math.floor(Math.random() * 3) + 2, // 2-4 images
  }));
}

/**
 * Generates sample test user data with role assignments
 * Default distribution: customers, business_owners, admin per AC requirements
 */
export function generateTestUsers(count: number = 5, businesses?: TestBusiness[]): TestUser[] {
  // Default role distribution: 2 customers, 2 business owners, 1 admin
  const roleDistribution: UserRole[] = ["customer", "customer", "business_owner", "business_owner", "admin"];

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
    const role = roleDistribution[i % roleDistribution.length];

    const user: TestUser = {
      firstName: template.first,
      lastName: template.last,
      formattedEmail: formatUserEmail(fullName),
      role,
    };

    // Associate business owners with businesses
    if (role === "business_owner" && businesses && businesses.length > 0) {
      const businessIndex = i % businesses.length;
      user.associatedBusinessId = businesses[businessIndex].id;
    }

    return user;
  });
}

/**
 * Generates complete test seed data with role associations
 * Business owners are automatically associated with seeded businesses
 */
export function generateTestSeedData(
  businessCount: number = 5,
  userCount: number = 5
): TestSeedData {
  const businesses = generateTestBusinesses(businessCount);
  const users = generateTestUsers(userCount, businesses);
  return {
    businesses,
    users,
  };
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
