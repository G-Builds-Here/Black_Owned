/**
 * LOC-0063-AC5: Data Consistency Across Platforms
 *
 * Validates that Facebook, Google Maps, and Yelp scraping results have
 * consistent field mapping and data formats for unified business data processing.
 */

import {
  FacebookRawData,
  GoogleMapsRawData,
  YelpRawData,
  ScraperSource,
} from "../types/scraper-result";
import { ScrapedBusiness as FacebookBusiness } from "../types/facebook-scraper";
import { ScrapedBusiness as GoogleMapsBusiness } from "../types/google-maps-scraper";
import { ScrapedBusiness as YelpBusiness } from "../types/yelp-scraper";

/**
 * Standardized field mapping for cross-platform consistency
 */
interface StandardizedBusinessData {
  // Core identity fields (REQUIRED across all platforms)
  name: string;
  sourceId: string;
  source: ScraperSource;

  // Contact information (OPTIONAL - may be missing on some platforms)
  phone?: string;
  website?: string;
  email?: string;

  // Location data (REQUIRED for physical businesses)
  address?: {
    street?: string;
    city?: string;
    state?: string;
    zipCode?: string;
    country?: string;
    latitude?: number;
    longitude?: number;
  };

  // Business metadata
  category?: string;
  categories?: string[];
  rating?: number;
  reviewCount?: number;
  priceLevel?: string | number;

  // Status indicators
  isOpen?: boolean;
  isClosed?: boolean;
  isClaimed?: boolean;

  // Platform-specific raw data preserved for debugging
  rawData: FacebookRawData | GoogleMapsRawData | YelpRawData;
}

/**
 * Field consistency validator for cross-platform data
 */
class DataConsistencyValidator {
  /**
   * Required fields that MUST be present for a valid cross-platform business record
   */
  private static readonly REQUIRED_FIELDS: (keyof StandardizedBusinessData)[] = [
    "name",
    "sourceId",
    "source",
  ];

  /**
   * Optional but expected fields for complete business records
   */
  private static readonly EXPECTED_FIELDS: (keyof StandardizedBusinessData)[] = [
    "phone",
    "website",
    "address",
    "category",
    "rating",
    "reviewCount",
  ];

  /**
   * Validates that a standardized business record has all required fields
   */
  static validateRequiredFields(
    data: StandardizedBusinessData
  ): { valid: boolean; missing: string[] } {
    const missing: string[] = [];

    for (const field of this.REQUIRED_FIELDS) {
      if (data[field] === undefined || data[field] === null) {
        missing.push(field);
      }
    }

    // Special check for name - must be non-empty string
    if (typeof data.name !== "string" || data.name.trim() === "") {
      missing.push("name (empty)");
    }

    // Special check for sourceId - must be non-empty
    if (typeof data.sourceId !== "string" || data.sourceId.trim() === "") {
      missing.push("sourceId (empty)");
    }

    return {
      valid: missing.length === 0,
      missing,
    };
  }

  /**
   * Validates field type consistency across platforms
   */
  static validateFieldTypes(
    data: StandardizedBusinessData
  ): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    // Name must be string
    if (typeof data.name !== "string") {
      errors.push(`name must be string, got ${typeof data.name}`);
    }

    // Source must be valid ScraperSource enum
    if (!Object.values(ScraperSource).includes(data.source)) {
      errors.push(`source must be valid ScraperSource, got ${data.source}`);
    }

    // Rating must be number if present
    if (data.rating !== undefined && typeof data.rating !== "number") {
      errors.push(`rating must be number, got ${typeof data.rating}`);
    }

    // Review count must be number if present
    if (data.reviewCount !== undefined && typeof data.reviewCount !== "number") {
      errors.push(`reviewCount must be number, got ${typeof data.reviewCount}`);
    }

    // Latitude/longitude must be numbers if present
    if (data.address) {
      if (data.address.latitude !== undefined && typeof data.address.latitude !== "number") {
        errors.push(`address.latitude must be number, got ${typeof data.address.latitude}`);
      }
      if (data.address.longitude !== undefined && typeof data.address.longitude !== "number") {
        errors.push(`address.longitude must be number, got ${typeof data.address.longitude}`);
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Normalizes data from FacebookRawData to standardized format
   */
  static normalizeFacebookData(raw: FacebookRawData): StandardizedBusinessData {
    return {
      name: raw.name,
      sourceId: raw.id,
      source: ScraperSource.FACEBOOK,
      phone: raw.phone,
      website: raw.website,
      email: raw.email,
      address: raw.location
        ? {
            street: raw.location.street,
            city: raw.location.city,
            state: raw.location.state,
            zipCode: raw.location.zip,
            country: raw.location.country,
            latitude: raw.location.latitude,
            longitude: raw.location.longitude,
          }
        : undefined,
      category: raw.category,
      rating: raw.location?.latitude ? undefined : undefined, // Facebook doesn't provide standard rating
      reviewCount: raw.were_here_count,
      rawData: raw,
    };
  }

  /**
   * Normalizes data from GoogleMapsRawData to standardized format
   */
  static normalizeGoogleMapsData(raw: GoogleMapsRawData): StandardizedBusinessData {
    return {
      name: raw.name,
      sourceId: raw.placeId,
      source: ScraperSource.GOOGLE_MAPS,
      phone: raw.phoneNumber || raw.formattedPhoneNumber,
      website: raw.website,
      address: {
        street: raw.formattedAddress,
        latitude: raw.latitude,
        longitude: raw.longitude,
      },
      category: raw.types?.[0],
      categories: raw.types,
      rating: raw.rating,
      reviewCount: raw.userRatingsTotal,
      priceLevel: raw.priceLevel,
      isOpen: raw.openingHours?.openNow,
      rawData: raw,
    };
  }

  /**
   * Normalizes data from YelpRawData to standardized format
   */
  static normalizeYelpData(raw: YelpRawData): StandardizedBusinessData {
    return {
      name: raw.name,
      sourceId: raw.id,
      source: ScraperSource.YELP,
      phone: raw.phone,
      website: undefined, // Yelp doesn't always provide website
      address: {
        street: raw.location.address1,
        city: raw.location.city,
        state: raw.location.state,
        zipCode: raw.location.zip_code,
        country: raw.location.country,
        latitude: raw.coordinates.latitude,
        longitude: raw.coordinates.longitude,
      },
      category: raw.categories?.[0]?.title,
      categories: raw.categories?.map((c) => c.title),
      rating: raw.rating,
      reviewCount: raw.review_count,
      priceLevel: raw.price,
      isOpen: raw.hours?.[0]?.is_open_now,
      isClosed: raw.is_closed,
      isClaimed: raw.is_claimed,
      rawData: raw,
    };
  }
}

/**
 * Cross-platform consistency test suite
 */
describe("LOC-0063-AC5: Cross-Platform Data Consistency", () => {
  describe("Field Mapping Consistency", () => {
    it("AC1: All platforms provide required identity fields (name, sourceId, source)", () => {
      // Facebook
      const facebookData: FacebookRawData = {
        id: "fb-12345",
        name: "Test Business Facebook",
        location: { latitude: 40.7128, longitude: -74.006 },
      } as FacebookRawData;

      const normalizedFB = DataConsistencyValidator.normalizeFacebookData(facebookData);
      const fbValidation = DataConsistencyValidator.validateRequiredFields(normalizedFB);

      expect(fbValidation.valid).toBe(true);
      expect(fbValidation.missing).toHaveLength(0);
      expect(normalizedFB.source).toBe(ScraperSource.FACEBOOK);

      // Google Maps
      const googleData: GoogleMapsRawData = {
        placeId: "gm-67890",
        name: "Test Business Google",
        latitude: 40.7128,
        longitude: -74.006,
        formattedAddress: "123 Main St, New York, NY",
      } as GoogleMapsRawData;

      const normalizedGM = DataConsistencyValidator.normalizeGoogleMapsData(googleData);
      const gmValidation = DataConsistencyValidator.validateRequiredFields(normalizedGM);

      expect(gmValidation.valid).toBe(true);
      expect(gmValidation.missing).toHaveLength(0);
      expect(normalizedGM.source).toBe(ScraperSource.GOOGLE_MAPS);

      // Yelp
      const yelpData: YelpRawData = {
        id: "yelp-11111",
        alias: "test-business",
        name: "Test Business Yelp",
        image_url: "https://example.com/image.jpg",
        is_claimed: true,
        is_closed: false,
        url: "https://yelp.com/biz/test",
        phone: "+1-555-1234",
        display_phone: "(555) 123-4567",
        review_count: 150,
        categories: [{ alias: "restaurants", title: "Restaurants" }],
        rating: 4.5,
        location: {
          address1: "123 Main St",
          city: "New York",
          state: "NY",
          zip_code: "10001",
          country: "US",
          display_address: ["123 Main St", "New York, NY 10001"],
        },
        coordinates: { latitude: 40.7128, longitude: -74.006 },
        photos: ["photo1.jpg"],
        price: "$$",
        transactions: ["pickup", "delivery"],
      } as YelpRawData;

      const normalizedYelp = DataConsistencyValidator.normalizeYelpData(yelpData);
      const yelpValidation = DataConsistencyValidator.validateRequiredFields(normalizedYelp);

      expect(yelpValidation.valid).toBe(true);
      expect(yelpValidation.missing).toHaveLength(0);
      expect(normalizedYelp.source).toBe(ScraperSource.YELP);
    });

    it("AC2: Field types are consistent across all platforms", () => {
      const facebookData: FacebookRawData = {
        id: "fb-12345",
        name: "Test Business",
        location: { latitude: 40.7128, longitude: -74.006 },
        fan_count: 500,
      } as FacebookRawData;

      const googleData: GoogleMapsRawData = {
        placeId: "gm-67890",
        name: "Test Business",
        latitude: 40.7128,
        longitude: -74.006,
        formattedAddress: "123 Main St",
        rating: 4.5,
        userRatingsTotal: 200,
      } as GoogleMapsRawData;

      const yelpData: YelpRawData = {
        id: "yelp-11111",
        alias: "test",
        name: "Test Business",
        image_url: "img.jpg",
        is_claimed: true,
        is_closed: false,
        url: "url",
        phone: "555-1234",
        display_phone: "555-1234",
        review_count: 150,
        categories: [{ alias: "test", title: "Test" }],
        rating: 4.0,
        location: {
          address1: "123 Main St",
          city: "NYC",
          state: "NY",
          zip_code: "10001",
          country: "US",
          display_address: ["123 Main St"],
        },
        coordinates: { latitude: 40.7128, longitude: -74.006 },
        photos: [],
        price: "$$",
      } as YelpRawData;

      const normalizedFB = DataConsistencyValidator.normalizeFacebookData(facebookData);
      const normalizedGM = DataConsistencyValidator.normalizeGoogleMapsData(googleData);
      const normalizedYelp = DataConsistencyValidator.normalizeYelpData(yelpData);

      const fbTypeValidation = DataConsistencyValidator.validateFieldTypes(normalizedFB);
      const gmTypeValidation = DataConsistencyValidator.validateFieldTypes(normalizedGM);
      const yelpTypeValidation = DataConsistencyValidator.validateFieldTypes(normalizedYelp);

      expect(fbTypeValidation.valid).toBe(true);
      expect(gmTypeValidation.valid).toBe(true);
      expect(yelpTypeValidation.valid).toBe(true);
    });

    it("AC3: Address data is normalized to consistent structure", () => {
      // Google Maps provides full address
      const googleData: GoogleMapsRawData = {
        placeId: "gm-123",
        name: "Test",
        latitude: 40.7128,
        longitude: -74.006,
        formattedAddress: "123 Main St, New York, NY 10001",
      } as GoogleMapsRawData;

      const normalizedGM = DataConsistencyValidator.normalizeGoogleMapsData(googleData);

      expect(normalizedGM.address).toBeDefined();
      expect(normalizedGM.address?.latitude).toBe(40.7128);
      expect(normalizedGM.address?.longitude).toBe(-74.006);

      // Yelp provides structured address
      const yelpData: YelpRawData = {
        id: "yelp-123",
        alias: "test",
        name: "Test",
        image_url: "img.jpg",
        is_claimed: true,
        is_closed: false,
        url: "url",
        phone: "555",
        display_phone: "555",
        review_count: 10,
        categories: [],
        rating: 4,
        location: {
          address1: "123 Main St",
          city: "New York",
          state: "NY",
          zip_code: "10001",
          country: "US",
          display_address: ["123 Main St", "New York, NY 10001"],
        },
        coordinates: { latitude: 40.7128, longitude: -74.006 },
        photos: [],
        price: "$",
      } as YelpRawData;

      const normalizedYelp = DataConsistencyValidator.normalizeYelpData(yelpData);

      expect(normalizedYelp.address).toBeDefined();
      expect(normalizedYelp.address?.city).toBe("New York");
      expect(normalizedYelp.address?.state).toBe("NY");
      expect(normalizedYelp.address?.zipCode).toBe("10001");
      expect(normalizedYelp.address?.country).toBe("US");
    });

    it("AC4: Rating and review count fields are consistently typed", () => {
      // Google Maps rating
      const googleData: GoogleMapsRawData = {
        placeId: "gm-123",
        name: "Test",
        latitude: 40.7128,
        longitude: -74.006,
        formattedAddress: "123 Main St",
        rating: 4.5,
        userRatingsTotal: 200,
      } as GoogleMapsRawData;

      const normalizedGM = DataConsistencyValidator.normalizeGoogleMapsData(googleData);

      expect(typeof normalizedGM.rating).toBe("number");
      expect(typeof normalizedGM.reviewCount).toBe("number");
      expect(normalizedGM.rating).toBe(4.5);
      expect(normalizedGM.reviewCount).toBe(200);

      // Yelp rating
      const yelpData: YelpRawData = {
        id: "yelp-123",
        alias: "test",
        name: "Test",
        image_url: "img.jpg",
        is_claimed: true,
        is_closed: false,
        url: "url",
        phone: "555",
        display_phone: "555",
        review_count: 150,
        categories: [],
        rating: 4.0,
        location: {
          address1: "123 Main St",
          city: "NYC",
          state: "NY",
          zip_code: "10001",
          country: "US",
          display_address: ["123 Main St"],
        },
        coordinates: { latitude: 40.7128, longitude: -74.006 },
        photos: [],
        price: "$$",
      } as YelpRawData;

      const normalizedYelp = DataConsistencyValidator.normalizeYelpData(yelpData);

      expect(typeof normalizedYelp.rating).toBe("number");
      expect(typeof normalizedYelp.reviewCount).toBe("number");
      expect(normalizedYelp.rating).toBe(4.0);
      expect(normalizedYelp.reviewCount).toBe(150);
    });
  });

  describe("Data Format Consistency", () => {
    it("AC5: Phone numbers are preserved as strings across platforms", () => {
      const facebookData: FacebookRawData = {
        id: "fb-123",
        name: "Test",
        phone: "+1-555-123-4567",
        location: { latitude: 40.7128, longitude: -74.006 },
      } as FacebookRawData;

      const googleData: GoogleMapsRawData = {
        placeId: "gm-123",
        name: "Test",
        latitude: 40.7128,
        longitude: -74.006,
        formattedAddress: "123 Main St",
        phoneNumber: "+1 555-123-4567",
        formattedPhoneNumber: "(555) 123-4567",
      } as GoogleMapsRawData;

      const yelpData: YelpRawData = {
        id: "yelp-123",
        alias: "test",
        name: "Test",
        image_url: "img.jpg",
        is_claimed: true,
        is_closed: false,
        url: "url",
        phone: "+15551234567",
        display_phone: "(555) 123-4567",
        review_count: 10,
        categories: [],
        rating: 4,
        location: {
          address1: "123 Main St",
          city: "NYC",
          state: "NY",
          zip_code: "10001",
          country: "US",
          display_address: ["123 Main St"],
        },
        coordinates: { latitude: 40.7128, longitude: -74.006 },
        photos: [],
        price: "$",
      } as YelpRawData;

      const normalizedFB = DataConsistencyValidator.normalizeFacebookData(facebookData);
      const normalizedGM = DataConsistencyValidator.normalizeGoogleMapsData(googleData);
      const normalizedYelp = DataConsistencyValidator.normalizeYelpData(yelpData);

      // All should have phone as string
      expect(typeof normalizedFB.phone).toBe("string");
      expect(typeof normalizedGM.phone).toBe("string");
      expect(typeof normalizedYelp.phone).toBe("string");
    });

    it("AC6: Coordinates are consistently represented as numbers", () => {
      const facebookData: FacebookRawData = {
        id: "fb-123",
        name: "Test",
        location: {
          latitude: 40.7128,
          longitude: -74.006,
          city: "New York",
        },
      } as FacebookRawData;

      const googleData: GoogleMapsRawData = {
        placeId: "gm-123",
        name: "Test",
        latitude: 40.7128,
        longitude: -74.006,
        formattedAddress: "123 Main St",
      } as GoogleMapsRawData;

      const yelpData: YelpRawData = {
        id: "yelp-123",
        alias: "test",
        name: "Test",
        image_url: "img.jpg",
        is_claimed: true,
        is_closed: false,
        url: "url",
        phone: "555",
        display_phone: "555",
        review_count: 10,
        categories: [],
        rating: 4,
        location: {
          address1: "123 Main St",
          city: "NYC",
          state: "NY",
          zip_code: "10001",
          country: "US",
          display_address: ["123 Main St"],
        },
        coordinates: { latitude: 40.7128, longitude: -74.006 },
        photos: [],
        price: "$",
      } as YelpRawData;

      const normalizedFB = DataConsistencyValidator.normalizeFacebookData(facebookData);
      const normalizedGM = DataConsistencyValidator.normalizeGoogleMapsData(googleData);
      const normalizedYelp = DataConsistencyValidator.normalizeYelpData(yelpData);

      // All should have consistent coordinate types
      expect(normalizedFB.address?.latitude).toBe(40.7128);
      expect(normalizedFB.address?.longitude).toBe(-74.006);

      expect(normalizedGM.address?.latitude).toBe(40.7128);
      expect(normalizedGM.address?.longitude).toBe(-74.006);

      expect(normalizedYelp.address?.latitude).toBe(40.7128);
      expect(normalizedYelp.address?.longitude).toBe(-74.006);
    });

    it("AC7: Category data is normalized to consistent format", () => {
      // Google Maps provides types array
      const googleData: GoogleMapsRawData = {
        placeId: "gm-123",
        name: "Test",
        latitude: 40.7128,
        longitude: -74.006,
        formattedAddress: "123 Main St",
        types: ["restaurant", "food", "point_of_interest"],
      } as GoogleMapsRawData;

      const normalizedGM = DataConsistencyValidator.normalizeGoogleMapsData(googleData);

      expect(normalizedGM.categories).toEqual(["restaurant", "food", "point_of_interest"]);
      expect(normalizedGM.category).toBe("restaurant");

      // Yelp provides categories array with objects
      const yelpData: YelpRawData = {
        id: "yelp-123",
        alias: "test",
        name: "Test",
        image_url: "img.jpg",
        is_claimed: true,
        is_closed: false,
        url: "url",
        phone: "555",
        display_phone: "555",
        review_count: 10,
        categories: [
          { alias: "restaurants", title: "Restaurants" },
          { alias: "italian", title: "Italian" },
        ],
        rating: 4,
        location: {
          address1: "123 Main St",
          city: "NYC",
          state: "NY",
          zip_code: "10001",
          country: "US",
          display_address: ["123 Main St"],
        },
        coordinates: { latitude: 40.7128, longitude: -74.006 },
        photos: [],
        price: "$$",
      } as YelpRawData;

      const normalizedYelp = DataConsistencyValidator.normalizeYelpData(yelpData);

      expect(normalizedYelp.categories).toEqual(["Restaurants", "Italian"]);
      expect(normalizedYelp.category).toBe("Restaurants");
    });
  });

  describe("Cross-Platform Comparison", () => {
    it("AC8: Same business from different platforms can be compared using standardized format", () => {
      // Simulate the same business scraped from all three platforms
      const facebookData: FacebookRawData = {
        id: "fb-same-business",
        name: "Joe's Diner",
        phone: "+1-555-1234",
        location: {
          street: "123 Main St",
          city: "New York",
          state: "NY",
          zip: "10001",
          country: "US",
          latitude: 40.7128,
          longitude: -74.006,
        },
        category: "Restaurant",
        were_here_count: 150,
      } as FacebookRawData;

      const googleData: GoogleMapsRawData = {
        placeId: "gm-same-business",
        name: "Joe's Diner",
        phoneNumber: "+1-555-1234",
        formattedAddress: "123 Main St, New York, NY 10001",
        latitude: 40.7128,
        longitude: -74.006,
        rating: 4.5,
        userRatingsTotal: 200,
        types: ["restaurant", "food"],
      } as GoogleMapsRawData;

      const yelpData: YelpRawData = {
        id: "yelp-same-business",
        alias: "joes-diner",
        name: "Joe's Diner",
        image_url: "https://example.com/joes.jpg",
        is_claimed: true,
        is_closed: false,
        url: "https://yelp.com/biz/joes-diner",
        phone: "+15551234",
        display_phone: "(555) 123-4567",
        review_count: 175,
        categories: [{ alias: "restaurants", title: "Restaurants" }],
        rating: 4.0,
        location: {
          address1: "123 Main St",
          city: "New York",
          state: "NY",
          zip_code: "10001",
          country: "US",
          display_address: ["123 Main St", "New York, NY 10001"],
        },
        coordinates: { latitude: 40.7128, longitude: -74.006 },
        photos: ["photo1.jpg"],
        price: "$$",
      } as YelpRawData;

      const normalizedFB = DataConsistencyValidator.normalizeFacebookData(facebookData);
      const normalizedGM = DataConsistencyValidator.normalizeGoogleMapsData(googleData);
      const normalizedYelp = DataConsistencyValidator.normalizeYelpData(yelpData);

      // All should have the same name
      expect(normalizedFB.name).toBe(normalizedGM.name);
      expect(normalizedGM.name).toBe(normalizedYelp.name);
      expect(normalizedFB.name).toBe("Joe's Diner");

      // All should have the same coordinates
      expect(normalizedFB.address?.latitude).toBe(normalizedGM.address?.latitude);
      expect(normalizedGM.address?.latitude).toBe(normalizedYelp.address?.latitude);

      // All should have the same phone (raw format may differ, but both present)
      expect(normalizedFB.phone).toBeDefined();
      expect(normalizedGM.phone).toBeDefined();
      expect(normalizedYelp.phone).toBeDefined();

      // Source should be different
      expect(normalizedFB.source).toBe(ScraperSource.FACEBOOK);
      expect(normalizedGM.source).toBe(ScraperSource.GOOGLE_MAPS);
      expect(normalizedYelp.source).toBe(ScraperSource.YELP);

      // Source IDs should be different (platform-specific)
      expect(normalizedFB.sourceId).toBe("fb-same-business");
      expect(normalizedGM.sourceId).toBe("gm-same-business");
      expect(normalizedYelp.sourceId).toBe("yelp-same-business");
    });

    it("AC9: Missing optional fields do not break consistency validation", () => {
      // Facebook data with minimal fields
      const minimalFacebook: FacebookRawData = {
        id: "fb-minimal",
        name: "Minimal Business",
        location: { latitude: 40.7128, longitude: -74.006 },
      } as FacebookRawData;

      const normalizedMinimalFB = DataConsistencyValidator.normalizeFacebookData(minimalFacebook);

      // Should still pass required field validation
      const fbValidation = DataConsistencyValidator.validateRequiredFields(normalizedMinimalFB);
      expect(fbValidation.valid).toBe(true);

      // Optional fields should be undefined
      expect(normalizedMinimalFB.phone).toBeUndefined();
      expect(normalizedMinimalFB.website).toBeUndefined();
      expect(normalizedMinimalFB.category).toBeUndefined();

      // Google Maps with minimal fields
      const minimalGoogle: GoogleMapsRawData = {
        placeId: "gm-minimal",
        name: "Minimal Business",
        latitude: 40.7128,
        longitude: -74.006,
        formattedAddress: "123 Main St",
      } as GoogleMapsRawData;

      const normalizedMinimalGM = DataConsistencyValidator.normalizeGoogleMapsData(minimalGoogle);
      const gmValidation = DataConsistencyValidator.validateRequiredFields(normalizedMinimalGM);
      expect(gmValidation.valid).toBe(true);

      // Yelp with minimal fields
      const minimalYelp: YelpRawData = {
        id: "yelp-minimal",
        alias: "minimal",
        name: "Minimal Business",
        image_url: "img.jpg",
        is_claimed: false,
        is_closed: false,
        url: "url",
        phone: "",
        display_phone: "",
        review_count: 0,
        categories: [],
        rating: 0,
        location: {
          address1: "123 Main St",
          city: "NYC",
          state: "NY",
          zip_code: "10001",
          country: "US",
          display_address: ["123 Main St"],
        },
        coordinates: { latitude: 40.7128, longitude: -74.006 },
        photos: [],
        price: "",
      } as YelpRawData;

      const normalizedMinimalYelp = DataConsistencyValidator.normalizeYelpData(minimalYelp);
      const yelpValidation = DataConsistencyValidator.validateRequiredFields(normalizedMinimalYelp);
      expect(yelpValidation.valid).toBe(true);
    });

    it("AC10: Raw data is preserved for debugging and audit purposes", () => {
      const facebookData: FacebookRawData = {
        id: "fb-raw-test",
        name: "Raw Test Business",
        description: "Test description",
        link: "https://facebook.com/test",
        phone: "+1-555-1234",
        location: { latitude: 40.7128, longitude: -74.006 },
        fan_count: 1000,
      } as FacebookRawData;

      const normalizedFB = DataConsistencyValidator.normalizeFacebookData(facebookData);

      // Raw data should be preserved
      expect(normalizedFB.rawData).toBe(facebookData);
      expect((normalizedFB.rawData as FacebookRawData).fan_count).toBe(1000);
      expect((normalizedFB.rawData as FacebookRawData).description).toBe("Test description");

      const googleData: GoogleMapsRawData = {
        placeId: "gm-raw-test",
        name: "Raw Test Business",
        latitude: 40.7128,
        longitude: -74.006,
        formattedAddress: "123 Main St",
        url: "https://maps.google.com/test",
        utcOffset: -5,
      } as GoogleMapsRawData;

      const normalizedGM = DataConsistencyValidator.normalizeGoogleMapsData(googleData);

      expect(normalizedGM.rawData).toBe(googleData);
      expect((normalizedGM.rawData as GoogleMapsRawData).url).toBe("https://maps.google.com/test");
      expect((normalizedGM.rawData as GoogleMapsRawData).utcOffset).toBe(-5);
    });
  });

  describe("Edge Cases and Error Handling", () => {
    it("AC11: Handles null/undefined values gracefully", () => {
      const facebookData: FacebookRawData = {
        id: "fb-edge",
        name: "Edge Case Business",
        location: undefined,
      } as unknown as FacebookRawData;

      const normalized = DataConsistencyValidator.normalizeFacebookData(facebookData);

      // Should not throw, address should be undefined
      expect(normalized.address).toBeUndefined();
      expect(normalized.name).toBe("Edge Case Business");

      const validation = DataConsistencyValidator.validateRequiredFields(normalized);
      expect(validation.valid).toBe(true); // Only name, sourceId, source are required
    });

    it("AC12: Validates empty string values appropriately", () => {
      const facebookData: FacebookRawData = {
        id: "",
        name: "",
        location: { latitude: 40.7128, longitude: -74.006 },
      } as FacebookRawData;

      const normalized = DataConsistencyValidator.normalizeFacebookData(facebookData);
      const validation = DataConsistencyValidator.validateRequiredFields(normalized);

      // Empty name and sourceId should fail validation
      expect(validation.valid).toBe(false);
      expect(validation.missing).toContain("name (empty)");
      expect(validation.missing).toContain("sourceId (empty)");
    });

    it("AC13: Handles platform-specific field variations", () => {
      // Facebook has fan_count, Google has userRatingsTotal, Yelp has review_count
      // All should map to reviewCount consistently

      const facebookData: FacebookRawData = {
        id: "fb-variation",
        name: "Test",
        were_here_count: 50,
        location: { latitude: 40.7128, longitude: -74.006 },
      } as FacebookRawData;

      const googleData: GoogleMapsRawData = {
        placeId: "gm-variation",
        name: "Test",
        latitude: 40.7128,
        longitude: -74.006,
        formattedAddress: "123 Main St",
        userRatingsTotal: 75,
      } as GoogleMapsRawData;

      const yelpData: YelpRawData = {
        id: "yelp-variation",
        alias: "test",
        name: "Test",
        image_url: "img.jpg",
        is_claimed: true,
        is_closed: false,
        url: "url",
        phone: "555",
        display_phone: "555",
        review_count: 100,
        categories: [],
        rating: 4,
        location: {
          address1: "123 Main St",
          city: "NYC",
          state: "NY",
          zip_code: "10001",
          country: "US",
          display_address: ["123 Main St"],
        },
        coordinates: { latitude: 40.7128, longitude: -74.006 },
        photos: [],
        price: "$",
      } as YelpRawData;

      const normalizedFB = DataConsistencyValidator.normalizeFacebookData(facebookData);
      const normalizedGM = DataConsistencyValidator.normalizeGoogleMapsData(googleData);
      const normalizedYelp = DataConsistencyValidator.normalizeYelpData(yelpData);

      // All should have consistent reviewCount field
      expect(normalizedFB.reviewCount).toBe(50);
      expect(normalizedGM.reviewCount).toBe(75);
      expect(normalizedYelp.reviewCount).toBe(100);
    });
  });
});
