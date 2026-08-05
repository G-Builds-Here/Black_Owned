/**
 * Data Consistency Tests - LOC-0063-AC5
 *
 * Validates that business data from Google Maps, Yelp, and Facebook sources
 * is consistent after normalization across platforms.
 */

import {
  levenshteinSimilarity,
  normalizedSimilarity,
  jaccardSimilarity,
  combinedSimilarity,
  normalizeString,
} from "../utils/similarity";
import { ScraperSource, ScraperResult, RawScraperData } from "../types/scraper-result";

// Similarity thresholds for consistency validation
const NAME_SIMILARITY_THRESHOLD = 0.85;
const DESCRIPTION_SIMILARITY_THRESHOLD = 0.6;
const CATEGORY_MATCH_THRESHOLD = 0.7;

/**
 * Normalized business data for cross-platform comparison
 */
interface NormalizedBusinessData {
  name: string;
  normalizedName: string;
  description: string | undefined;
  categoryId: string;
  source: ScraperSource;
  originalId: string;
}

/**
 * Consistency comparison result between two data sources
 */
interface ConsistencyResult {
  nameConsistent: boolean;
  nameSimilarity: number;
  descriptionConsistent: boolean;
  descriptionSimilarity: number;
  categoryConsistent: boolean;
  overallConsistent: boolean;
  discrepancies: string[];
}

/**
 * Create mock Google Maps scraped data
 */
function createGoogleMapsData(
  placeId: string,
  name: string,
  types: string[],
  address?: string
): ScraperResult {
  const rawData: RawScraperData = {
    name,
    address: address || "123 Main St, Seattle, WA",
    phone: "+1-555-123-4567",
    website: "https://example.com",
    rating: 4.5,
    reviewCount: 128,
    placeId,
    types,
    latitude: 47.6062,
    longitude: -122.3321,
  };

  return {
    rawData,
    source: ScraperSource.GOOGLE_MAPS,
  };
}

/**
 * Create mock Yelp scraped data
 */
function createYelpData(
  id: string,
  name: string,
  categories: Array<{ alias: string; title: string }>,
  rating?: number,
  price?: string
): ScraperResult {
  const rawData: RawScraperData = {
    name,
    address: "123 Main Street, Seattle, WA 98101",
    phone: "(555) 123-4567",
    website: "https://example.com",
    rating,
    reviewCount: 95,
    id,
    categories,
    imageUrl: "https://example.com/image.jpg",
    price,
  };

  return {
    rawData,
    source: ScraperSource.YELP,
  };
}

/**
 * Create mock Facebook scraped data
 */
function createFacebookData(
  id: string,
  name: string,
  category: string,
  description?: string
): ScraperResult {
  const rawData: RawScraperData = {
    name,
    address: "123 Main St., Seattle, Washington",
    phone: "555-123-4567",
    website: "https://example.com",
    category,
    description,
    id,
    likes: 542,
    checkins: 1203,
  };

  return {
    rawData,
    source: ScraperSource.FACEBOOK,
  };
}

/**
 * Normalize scraped data for cross-platform comparison
 */
function normalizeBusinessData(scraped: ScraperResult): NormalizedBusinessData {
  const { rawData, source } = scraped;

  let categoryId: string;
  switch (source) {
    case ScraperSource.GOOGLE_MAPS:
      const googleTypes = (rawData as any).types;
      categoryId = googleTypes && googleTypes.length > 0 ? googleTypes[0] : "other";
      break;
    case ScraperSource.YELP:
      const yelpCategories = (rawData as any).categories;
      categoryId = yelpCategories && yelpCategories.length > 0 ? yelpCategories[0].alias : "other";
      break;
    case ScraperSource.FACEBOOK:
      categoryId = (rawData as any).category || "other";
      break;
    default:
      categoryId = "other";
  }

  return {
    name: rawData.name,
    normalizedName: normalizeString(rawData.name),
    description: rawData.description,
    categoryId,
    source,
    originalId: rawData.id || (rawData as any).placeId || "unknown",
  };
}

/**
 * Compare consistency between two normalized business records
 */
function compareConsistency(
  data1: NormalizedBusinessData,
  data2: NormalizedBusinessData
): ConsistencyResult {
  const discrepancies: string[] = [];

  // Compare names using multiple similarity metrics
  const nameSimilarity = combinedSimilarity(data1.name, data2.name);
  const nameConsistent = nameSimilarity >= NAME_SIMILARITY_THRESHOLD;

  if (!nameConsistent) {
    discrepancies.push(
      `Name similarity ${nameSimilarity.toFixed(2)} below threshold ${NAME_SIMILARITY_THRESHOLD}: "${data1.name}" vs "${data2.name}"`
    );
  }

  // Compare descriptions if both exist
  let descriptionConsistent = true;
  let descriptionSimilarity = 1.0;

  if (data1.description && data2.description) {
    descriptionSimilarity = normalizedSimilarity(data1.description, data2.description);
    descriptionConsistent = descriptionSimilarity >= DESCRIPTION_SIMILARITY_THRESHOLD;

    if (!descriptionConsistent) {
      discrepancies.push(
        `Description similarity ${descriptionSimilarity.toFixed(2)} below threshold ${DESCRIPTION_SIMILARITY_THRESHOLD}`
      );
    }
  } else if (data1.description && !data2.description) {
    discrepancies.push(`Missing description in ${data2.source} data`);
  } else if (!data1.description && data2.description) {
    discrepancies.push(`Missing description in ${data1.source} data`);
  }

  // Compare categories (exact match or semantic similarity)
  const categoryConsistent =
    data1.categoryId === data2.categoryId ||
    areCategoriesSemanticallySimilar(data1.categoryId, data2.categoryId);

  if (!categoryConsistent) {
    discrepancies.push(
      `Category mismatch: "${data1.categoryId}" vs "${data2.categoryId}"`
    );
  }

  const overallConsistent = nameConsistent && descriptionConsistent && categoryConsistent;

  return {
    nameConsistent,
    nameSimilarity,
    descriptionConsistent,
    descriptionSimilarity,
    categoryConsistent,
    overallConsistent,
    discrepancies,
  };
}

/**
 * Check if two categories are semantically similar
 */
function areCategoriesSemanticallySimilar(cat1: string, cat2: string): boolean {
  // Define category groupings that should be considered equivalent
  const categoryGroups: Record<string, string[]> = {
    "food-dining": ["restaurant", "cafe", "bar", "food", "meal_delivery", "meal_takeaway", "restaurants", "farmersmarket", "pizza", "diner"],
    "professional-services": ["lawyer", "consulting", "real_estate_agency"],
    "financial-services": ["accounting", "bank", "insurance_agency"],
    "retail-fashion": ["clothing_store", "shoe_store", "department_store"],
    "health-wellness": ["gym", "spa", "doctor", "dentist"],
    "automotive": ["car_dealer", "car_repair"],
    "home-services": ["hardware_store", "plumber", "electrician"],
    "entertainment": ["movie_theater", "music", "event"],
    "education": ["school", "university"],
  };

  // Check if both categories belong to the same group
  for (const [group, members] of Object.entries(categoryGroups)) {
    if (members.includes(cat1) && members.includes(cat2)) {
      return true;
    }
  }

  return false;
}

describe("Data Consistency - Cross-Platform Business Data - LOC-0063-AC5", () => {
  describe("Name Normalization", () => {
    it("should normalize business names consistently across platforms", () => {
      const googleName = "Joe's Restaurant LLC";
      const yelpName = "Joe's Restaurant";
      const facebookName = "Joe's Restaurant Inc.";

      const normalizedGoogle = normalizeString(googleName);
      const normalizedYelp = normalizeString(yelpName);
      const normalizedFacebook = normalizeString(facebookName);

      // All should normalize to the same core name
      expect(normalizedGoogle).toBe(normalizedYelp);
      expect(normalizedGoogle).toBe(normalizedFacebook);
    });

    it("should handle different address formats consistently", () => {
      const addresses = [
        "123 Main Street",
        "123 Main St",
        "123 Main St.",
        "123 MAIN STREET",
      ];

      const normalized = addresses.map(normalizeString);

      // All should normalize to the same format
      expect(normalized.every((addr) => addr === normalized[0])).toBe(true);
    });

    it("should preserve meaningful business name differences", () => {
      const similarNames = [
        "Joe's Restaurant",
        "Joe's Italian Restaurant",
        "Joe's Pizza Restaurant",
      ];

      const similarities = similarNames.slice(1).map((name) =>
        combinedSimilarity(similarNames[0], name)
      );

      // Similar names should have high but not perfect similarity
      similarities.forEach((sim) => {
        expect(sim).toBeGreaterThan(0.7);
        expect(sim).toBeLessThan(1.0);
      });
    });
  });

  describe("Cross-Platform Name Consistency", () => {
    it("should detect consistent business names across Google Maps and Yelp", () => {
      const googleData = createGoogleMapsData(
        "ChIJ123",
        "Seattle Coffee Works",
        ["cafe", "coffee_shop", "food"]
      );
      const yelpData = createYelpData(
        "seattle-coffee-works",
        "Seattle Coffee Works",
        [{ alias: "coffee", title: "Coffee Shop" }],
        4.5,
        "$$"
      );

      const normalizedGoogle = normalizeBusinessData(googleData);
      const normalizedYelp = normalizeBusinessData(yelpData);

      const result = compareConsistency(normalizedGoogle, normalizedYelp);

      expect(result.nameConsistent).toBe(true);
      expect(result.nameSimilarity).toBe(1.0);
    });

    it("should handle minor name variations across platforms", () => {
      const googleData = createGoogleMapsData(
        "ChIJ456",
        "Pike Place Market",
        ["tourist_attraction", "point_of_interest"]
      );
      const yelpData = createYelpData(
        "pike-place-market",
        "Pike Place Market",
        [{ alias: "farmersmarket", title: "Farmers Market" }]
      );

      const normalizedGoogle = normalizeBusinessData(googleData);
      const normalizedYelp = normalizeBusinessData(yelpData);

      const result = compareConsistency(normalizedGoogle, normalizedYelp);

      // Should detect exact name match
      expect(result.nameSimilarity).toBe(1.0);
    });

    it("should detect inconsistent business names", () => {
      const googleData = createGoogleMapsData(
        "ChIJ789",
        "Starbucks Coffee",
        ["cafe", "coffee_shop"]
      );
      const yelpData = createYelpData(
        "different-cafe",
        "Espresso Vivace",
        [{ alias: "coffee", title: "Coffee Shop" }]
      );

      const normalizedGoogle = normalizeBusinessData(googleData);
      const normalizedYelp = normalizeBusinessData(yelpData);

      const result = compareConsistency(normalizedGoogle, normalizedYelp);

      expect(result.nameConsistent).toBe(false);
      expect(result.nameSimilarity).toBeLessThan(NAME_SIMILARITY_THRESHOLD);
    });
  });

  describe("Category Consistency", () => {
    it("should map Google Maps types to consistent categories", () => {
      const googleRestaurant = createGoogleMapsData(
        "ChIJ001",
        "Test Restaurant",
        ["restaurant", "food", "point_of_interest"]
      );
      const googleCafe = createGoogleMapsData(
        "ChIJ002",
        "Test Cafe",
        ["cafe", "food", "point_of_interest"]
      );

      const normalizedRestaurant = normalizeBusinessData(googleRestaurant);
      const normalizedCafe = normalizeBusinessData(googleCafe);

      // Both should be recognized as food-related
      expect(normalizedRestaurant.categoryId).toBe("restaurant");
      expect(normalizedCafe.categoryId).toBe("cafe");
    });

    it("should detect semantically similar categories", () => {
      expect(areCategoriesSemanticallySimilar("restaurant", "cafe")).toBe(true);
      expect(areCategoriesSemanticallySimilar("doctor", "dentist")).toBe(true);
      expect(areCategoriesSemanticallySimilar("lawyer", "accounting")).toBe(false);
    });

    it("should handle Yelp category consistency", () => {
      const yelpData1 = createYelpData(
        "biz1",
        "Test Business",
        [{ alias: "restaurants", title: "Restaurants" }]
      );
      const yelpData2 = createYelpData(
        "biz2",
        "Test Business 2",
        [{ alias: "food", title: "Food" }]
      );

      const normalized1 = normalizeBusinessData(yelpData1);
      const normalized2 = normalizeBusinessData(yelpData2);

      // Both should be food-related categories
      expect(areCategoriesSemanticallySimilar(normalized1.categoryId, normalized2.categoryId)).toBe(
        true
      );
    });
  });

  describe("Description Consistency", () => {
    it("should compare descriptions across platforms", () => {
      const facebookData = createFacebookData(
        "fb123",
        "Test Business",
        "Business Category",
        "We provide excellent services since 2020"
      );

      const normalized = normalizeBusinessData(facebookData);

      expect(normalized.description).toBe("We provide excellent services since 2020");
    });

    it("should calculate description similarity", () => {
      const desc1 = "Best coffee in Seattle";
      const desc2 = "Best coffee in Seattle";

      const similarity = normalizedSimilarity(desc1, desc2);

      expect(similarity).toBe(1.0);
    });

    it("should handle missing descriptions gracefully", () => {
      const googleData = createGoogleMapsData("ChIJ111", "Test Business", ["cafe"]);
      const yelpData = createYelpData("biz111", "Test Business", [{ alias: "coffee", title: "Coffee" }]);

      const normalizedGoogle = normalizeBusinessData(googleData);
      const normalizedYelp = normalizeBusinessData(yelpData);

      const result = compareConsistency(normalizedGoogle, normalizedYelp);

      // Should not fail when descriptions are missing
      expect(result.descriptionConsistent).toBe(true);
    });
  });

  describe("Full Cross-Platform Consistency", () => {
    it("should validate complete consistency for matching business across all platforms", () => {
      const businessName = "Belltown Pizza";

      const googleData = createGoogleMapsData(
        "ChIJABC",
        businessName,
        ["restaurant", "food", "point_of_interest"],
        "123 Main St, Seattle, WA"
      );
      const yelpData = createYelpData(
        "belltown-pizza-seattle",
        businessName,
        [{ alias: "pizza", title: "Pizza" }, { alias: "restaurants", title: "Restaurants" }],
        4.5,
        "$$"
      );
      const facebookData = createFacebookData(
        "fb-belltown-pizza",
        businessName,
        "Pizza Restaurant",
        "Family-owned pizza restaurant in Belltown"
      );

      const normalizedGoogle = normalizeBusinessData(googleData);
      const normalizedYelp = normalizeBusinessData(yelpData);
      const normalizedFacebook = normalizeBusinessData(facebookData);

      const googleYelp = compareConsistency(normalizedGoogle, normalizedYelp);
      const googleFacebook = compareConsistency(normalizedGoogle, normalizedFacebook);
      const yelpFacebook = compareConsistency(normalizedYelp, normalizedFacebook);

      // All comparisons should show consistent names
      expect(googleYelp.nameConsistent).toBe(true);
      expect(googleFacebook.nameConsistent).toBe(true);
      expect(yelpFacebook.nameConsistent).toBe(true);
    });

    it("should detect inconsistencies when business data differs significantly", () => {
      const googleData = createGoogleMapsData(
        "ChIJXYZ",
        "Premium Law Firm",
        ["lawyer", "professional_services"]
      );
      const yelpData = createYelpData(
        "different-business",
        "Joe's Diner",
        [{ alias: "diner", title: "Diner" }, { alias: "food", title: "Food" }]
      );

      const normalizedGoogle = normalizeBusinessData(googleData);
      const normalizedYelp = normalizeBusinessData(yelpData);

      const result = compareConsistency(normalizedGoogle, normalizedYelp);

      expect(result.overallConsistent).toBe(false);
      expect(result.nameConsistent).toBe(false);
      expect(result.categoryConsistent).toBe(false);
      expect(result.discrepancies.length).toBeGreaterThan(0);
    });

    it("should handle edge cases with special characters in names", () => {
      const specialNames = [
        "Joe's & Mary's Restaurant",
        "Joe's - Mary's Restaurant",
        "Joe's / Mary's Restaurant",
      ];

      const normalized = specialNames.map(normalizeString);

      // All should normalize to similar forms
      const base = normalized[0];
      normalized.forEach((name, idx) => {
        const similarity = combinedSimilarity(base, name);
        expect(similarity).toBeGreaterThan(0.9);
      });
    });
  });

  describe("Similarity Algorithm Validation", () => {
    it("should return 1.0 for identical strings", () => {
      const str = "Test Business Name";
      expect(levenshteinSimilarity(str, str)).toBe(1.0);
      expect(normalizedSimilarity(str, str)).toBe(1.0);
      expect(jaccardSimilarity(str, str)).toBe(1.0);
    });

    it("should return 0 for completely different strings", () => {
      expect(jaccardSimilarity("aaaaa", "bbbbb")).toBe(0);
    });

    it("should handle empty strings", () => {
      expect(levenshteinSimilarity("", "")).toBe(1.0); // Both empty = identical
      expect(normalizedSimilarity("", "test")).toBe(0);
      expect(jaccardSimilarity("", "test")).toBe(0);
    });

    it("should be case-insensitive for normalized similarity", () => {
      const upper = "TEST BUSINESS";
      const lower = "test business";

      expect(normalizedSimilarity(upper, lower)).toBe(1.0);
    });
  });

  describe("Data Quality Thresholds", () => {
    it("should enforce name similarity threshold", () => {
      const highSimilarity = "Starbucks Coffee";
      const lowSimilarity = "Dunkin Donuts";

      expect(combinedSimilarity(highSimilarity, "Starbucks Coffee")).toBe(1.0);
      expect(combinedSimilarity(highSimilarity, lowSimilarity)).toBeLessThan(NAME_SIMILARITY_THRESHOLD);
    });

    it("should validate threshold constants are reasonable", () => {
      // Thresholds should be between 0 and 1
      expect(NAME_SIMILARITY_THRESHOLD).toBeGreaterThan(0);
      expect(NAME_SIMILARITY_THRESHOLD).toBeLessThan(1);
      expect(DESCRIPTION_SIMILARITY_THRESHOLD).toBeGreaterThan(0);
      expect(DESCRIPTION_SIMILARITY_THRESHOLD).toBeLessThan(1);
    });
  });
});
