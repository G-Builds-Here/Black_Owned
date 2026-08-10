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
 * Business with associated images for seeding
 */
export interface TestBusinessWithImages extends TestBusiness {
  id: string;
  category: string;
  imageCount: number;
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
    "Black Beauty Salon",
    "Community Grocery Store",
    "Tech Solutions LLC",
    "Family Restaurant",
    "Fitness Center",
    "Bookstore & Cafe",
    "Auto Repair Shop",
    "Hair Studio",
  ];

  return Array.from({ length: count }, (_, i) => {
    const template = businessTemplates[i % businessTemplates.length];
    const suffix = count > businessTemplates.length ? ` (${i + 1})` : "";
    const name = `${template}${suffix}`;

    return {
      id: `biz-${i + 1}`,
      name,
      formattedName: formatBusinessName(name),
      description: `Test business - ${name}`,
    };
  });
}

/**
 * Generates businesses with associated image data for seeding
 * Creates businesses with varied categories and assigns image counts
 */
export function generateBusinessesWithImages(count: number = 20): TestBusinessWithImages[] {
  const categoryList: Array<{ category: string; name: string; description: string }> = [
    { category: "food-dining", name: "Soul Food Kitchen", description: "Traditional Southern cuisine" },
    { category: "food-dining", name: "Community Taco Bar", description: "Authentic Mexican street food" },
    { category: "food-dining", name: "Harlem Soul Cafe", description: "Breakfast and lunch comfort food" },
    { category: "food-dining", name: "Family BBQ Pit", description: "Slow-smoked meats and sides" },
    { category: "food-dining", name: "Sweet Treats Bakery", description: "Fresh baked goods daily" },
    { category: "retail-fashion", name: "Urban Style Boutique", description: "Trendy clothing and accessories" },
    { category: "retail-fashion", name: "Community Thrift Store", description: "Affordable quality goods" },
    { category: "retail-fashion", name: "Classic Barbershop", description: "Traditional cuts and styling" },
    { category: "retail-fashion", name: "Beauty Essentials Shop", description: "Cosmetics and skincare" },
    { category: "professional-services", name: "Black Professionals Consulting", description: "Business strategy services" },
    { category: "professional-services", name: "Community Legal Aid", description: "Accessible legal services" },
    { category: "professional-services", name: "Financial Planning Group", description: "Wealth management and advice" },
    { category: "health-wellness", name: "Wellness First Clinic", description: "Comprehensive healthcare" },
    { category: "health-wellness", name: "Community Fitness Center", description: "Affordable gym and classes" },
    { category: "health-wellness", name: "Family Dental Care", description: "Complete dental services" },
    { category: "automotive", name: "Reliable Auto Repair", description: "Full-service auto maintenance" },
    { category: "home-services", name: "Quality Home Solutions", description: "Plumbing and electrical" },
    { category: "entertainment", name: "Community Arts Center", description: "Cultural events and workshops" },
    { category: "education", name: "Bright Futures Tutoring", description: "Academic support services" },
    { category: "financial-services", name: "Community Credit Union", description: "Member-owned financial services" },
    { category: "food-dining", name: "Gospel Soul Food", description: "Comfort food with a spiritual touch" },
    { category: "food-dining", name: "Caribbean Spice House", description: "Authentic island flavors and jerk specialties" },
    { category: "retail-fashion", name: "Heritage Fashion", description: "Culturally inspired clothing and accessories" },
    { category: "retail-fashion", name: "Community Bookstore", description: "Local literature and educational resources" },
    { category: "professional-services", name: "Community Insurance Agency", description: "Family and business coverage solutions" },
    { category: "health-wellness", name: "Holistic Health Center", description: "Integrative wellness and preventive care" },
    { category: "health-wellness", name: "Community Eye Care", description: "Affordable vision services and eyewear" },
    { category: "automotive", name: "Family Auto Care", description: "Trusted maintenance and repair services" },
    { category: "home-services", name: "Neighborhood HVAC", description: "Heating and cooling solutions" },
    { category: "entertainment", name: "Jazz Lounge & Cafe", description: "Live music and community gathering space" },
  ];

  return Array.from({ length: count }, (_, i) => {
    const template = categoryList[i % categoryList.length];
    const suffix = categoryList.length > count && i >= categoryList.length ? ` ${Math.floor(i / categoryList.length) + 1}` : "";
    const businessName = `${template.name}${suffix}`;

    return {
      id: `biz-${i + 1}`,
      name: formatBusinessName(businessName),
      formattedName: formatBusinessName(businessName),
      description: template.description,
      category: template.category,
      imageCount: 2 + (i % 3), // 2-4 images per business
    };
  });
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
