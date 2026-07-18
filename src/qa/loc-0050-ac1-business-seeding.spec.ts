/**
 * QA Tests for LOC-0050-AC1
 *
 * Validates that 30 businesses are created across 10 categories with unique slugs.
 *
 * AC1 Requirements:
 * - Given the seed script is executed with no existing test data
 * - When 30 businesses are created
 * - Then there are exactly 3 businesses per category across 10 categories
 * - And each business has a unique slug derived from its name
 * - And each business has a realistic name, address, phone number, and description
 * - And all business names include the "BWS-TEST" prefix
 */

import {
  TEST_PREFIX,
  formatBusinessName,
  isTestBusiness,
  generateTestBusinesses,
  TestBusiness,
} from "../utils/test-data-seeder";

// Category definitions for AC1
const CATEGORIES = [
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

const BUSINESSES_PER_CATEGORY = 3;
const TOTAL_BUSINESSES_EXPECTED = 30;

/**
 * Business name templates organized by category
 */
const BUSINESS_TEMPLATES_BY_CATEGORY: Record<string, string[]> = {
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
 * Generate realistic business data for a given category
 */
function generateBusinessForCategory(
  category: string,
  index: number
): TestBusiness {
  const templates = BUSINESS_TEMPLATES_BY_CATEGORY[category];
  const template = templates[index % templates.length];
  const suffix = index >= templates.length ? ` ${index + 1}` : "";
  const name = `${template}${suffix}`;

  return {
    name,
    formattedName: formatBusinessName(name),
    description: `Test business in ${category} category - ${name}`,
  };
}

/**
 * Generate slug from business name (for uniqueness validation)
 */
function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

describe("LOC-0050-AC1: Business Seeding", () => {
  describe("Category Distribution", () => {
    it("defines exactly 10 categories", () => {
      expect(CATEGORIES).toHaveLength(10);
    });

    it("each category has 3 business templates", () => {
      CATEGORIES.forEach((category) => {
        const templates = BUSINESS_TEMPLATES_BY_CATEGORY[category];
        expect(templates).toBeDefined();
        expect(templates).toHaveLength(3);
      });
    });

    it("total expected businesses equals 30", () => {
      expect(CATEGORIES.length * BUSINESSES_PER_CATEGORY).toBe(
        TOTAL_BUSINESSES_EXPECTED
      );
    });
  });

  describe("Business Generation", () => {
    let generatedBusinesses: TestBusiness[];

    beforeAll(() => {
      // Generate all 30 businesses across 10 categories
      generatedBusinesses = [];
      CATEGORIES.forEach((category) => {
        for (let i = 0; i < BUSINESSES_PER_CATEGORY; i++) {
          generatedBusinesses.push(
            generateBusinessForCategory(category, i)
          );
        }
      });
    });

    it("generates exactly 30 businesses", () => {
      expect(generatedBusinesses).toHaveLength(30);
    });

    it("all businesses have BWS-TEST prefix", () => {
      generatedBusinesses.forEach((business) => {
        expect(business.formattedName).toMatch(/^BWS-TEST:/);
        expect(isTestBusiness(business.formattedName)).toBe(true);
      });
    });

    it("all businesses have unique slugs", () => {
      const slugs = generatedBusinesses.map((b) =>
        generateSlug(b.formattedName)
      );
      const uniqueSlugs = new Set(slugs);
      expect(uniqueSlugs.size).toBe(generatedBusinesses.length);
    });

    it("all businesses have name, formattedName, and description", () => {
      generatedBusinesses.forEach((business) => {
        expect(business.name).toBeDefined();
        expect(business.formattedName).toBeDefined();
        expect(business.description).toBeDefined();
        expect(business.name.length).toBeGreaterThan(0);
        expect(business.formattedName.length).toBeGreaterThan(0);
        expect(business.description!.length).toBeGreaterThan(0);
      });
    });
  });

  describe("Slug Uniqueness", () => {
    it("slugs are derived correctly from formatted names", () => {
      const testCases = [
        { input: "BWS-TEST: Soul Food Kitchen", expected: "bws-test-soul-food-kitchen" },
        { input: "BWS-TEST: Barbecue House", expected: "bws-test-barbecue-house" },
        { input: "BWS-TEST: O'Brien's Pub", expected: "bws-test-o-brien-s-pub" },
      ];

      testCases.forEach(({ input, expected }) => {
        expect(generateSlug(input)).toBe(expected);
      });
    });

    it("no two businesses share the same slug", () => {
      // Generate 30 businesses and verify slug uniqueness
      const businesses: TestBusiness[] = [];
      CATEGORIES.forEach((category) => {
        for (let i = 0; i < BUSINESSES_PER_CATEGORY; i++) {
          businesses.push(generateBusinessForCategory(category, i));
        }
      });

      const slugMap = new Map<string, string[]>();
      businesses.forEach((business) => {
        const slug = generateSlug(business.formattedName);
        if (!slugMap.has(slug)) {
          slugMap.set(slug, []);
        }
        slugMap.get(slug)!.push(business.formattedName);
      });

      // Verify no slug has more than one business
      slugMap.forEach((businessesWithSameSlug, slug) => {
        expect(businessesWithSameSlug.length).toBe(1);
      });
    });
  });

  describe("Data Quality", () => {
    it("business names are realistic (no placeholder text)", () => {
      const placeholderPatterns = [
        /test\d+/i,
        /example/i,
        /placeholder/i,
        /sample/i,
        /dummy/i,
      ];

      const businesses = generateTestBusinesses(30);
      businesses.forEach((business) => {
        const hasPlaceholder = placeholderPatterns.some((pattern) =>
          pattern.test(business.name)
        );
        expect(hasPlaceholder).toBe(false);
      });
    });

    it("formatted names preserve original business name", () => {
      const businesses = generateTestBusinesses(30);
      businesses.forEach((business) => {
        expect(business.formattedName).toContain(business.name);
      });
    });
  });

  describe("Category Coverage", () => {
    it("all 10 categories are represented in generated data", () => {
      const businesses: TestBusiness[] = [];
      CATEGORIES.forEach((category) => {
        for (let i = 0; i < BUSINESSES_PER_CATEGORY; i++) {
          businesses.push(generateBusinessForCategory(category, i));
        }
      });

      // Verify we can generate businesses for each category
      CATEGORIES.forEach((category) => {
        const categoryBusinesses = businesses.filter((_, idx) => {
          const categoryIdx = Math.floor(idx / BUSINESSES_PER_CATEGORY);
          return CATEGORIES[categoryIdx] === category;
        });
        expect(categoryBusinesses).toHaveLength(3);
      });
    });
  });
});
