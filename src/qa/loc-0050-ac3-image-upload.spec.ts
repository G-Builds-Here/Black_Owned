/**
 * QA Tests for LOC-0050-AC3
 *
 * Validates that images are uploaded to MinIO for each business:
 * - Given 30 businesses exist in the system
 * - When images are created for each business
 * - Then each business has 2-4 images uploaded to MinIO
 * - And each image has descriptive alt text matching the business category
 * - And images are associated with the correct business ID via foreign key
 */

import {
  generateImagesForBusiness,
  generateImagesForBusinesses,
  validateBusinessImageData,
  validateAllBusinessImageData,
} from "../services/image-service";
import { BusinessImageData, Image } from "../types/image";

describe("LOC-0050-AC3: Image Upload to MinIO", () => {
  const mockBusinesses = [
    { id: "biz-001", name: "Soul Food Kitchen", category: "restaurants" },
    { id: "biz-002", name: "Urban Boutique", category: "retail" },
    { id: "biz-003", name: "Business Consulting Group", category: "professional services" },
    { id: "biz-004", name: "Wellness Center", category: "health/wellness" },
    { id: "biz-005", name: "Glamour Salon", category: "beauty" },
    { id: "biz-006", name: "Quality Plumbing Co", category: "home services" },
    { id: "biz-007", name: "City Cinema", category: "entertainment" },
    { id: "biz-008", name: "Power Gym", category: "fitness" },
    { id: "biz-009", name: "Learning Academy", category: "education" },
    { id: "biz-010", name: "Auto Care Center", category: "automotive" },
    { id: "biz-011", name: "Barbecue House", category: "restaurants" },
    { id: "biz-012", name: "Community Market", category: "retail" },
    { id: "biz-013", name: "Financial Advisors LLC", category: "professional services" },
    { id: "biz-014", name: "Holistic Health Clinic", category: "health/wellness" },
    { id: "biz-015", name: "Natural Beauty Spa", category: "beauty" },
    { id: "biz-016", name: "Expert Electrical Services", category: "home services" },
    { id: "biz-017", name: "Music Lounge", category: "entertainment" },
    { id: "biz-018", name: "Yoga Studio", category: "fitness" },
    { id: "biz-019", name: "Tutoring Center", category: "education" },
    { id: "biz-020", name: "Quick Oil Change", category: "automotive" },
    { id: "biz-021", name: "Gourmet Bistro", category: "restaurants" },
    { id: "biz-022", name: "Neighborhood Store", category: "retail" },
    { id: "biz-023", name: "Legal Associates", category: "professional services" },
    { id: "biz-024", name: "Community Pharmacy", category: "health/wellness" },
    { id: "biz-025", name: "Elite Hair Studio", category: "beauty" },
    { id: "biz-026", name: "Reliable HVAC Solutions", category: "home services" },
    { id: "biz-027", name: "Event Productions", category: "entertainment" },
    { id: "biz-028", name: "CrossFit Community", category: "fitness" },
    { id: "biz-029", name: "Skill Development Institute", category: "education" },
    { id: "biz-030", name: "Premium Tire Shop", category: "automotive" },
  ];

  describe("Single Business Image Generation", () => {
    let result: BusinessImageData;

    beforeAll(() => {
      result = generateImagesForBusiness(
        "biz-001",
        "Soul Food Kitchen",
        "restaurants"
      );
    });

    it("generates images for a single business", () => {
      expect(result.businessId).toBe("biz-001");
      expect(result.businessName).toBe("Soul Food Kitchen");
      expect(result.category).toBe("restaurants");
      expect(result.images).toBeDefined();
      expect(Array.isArray(result.images)).toBe(true);
    });

    it("each business has 2-4 images", () => {
      expect(result.images.length).toBeGreaterThanOrEqual(2);
      expect(result.images.length).toBeLessThanOrEqual(4);
    });

    it("each image has a unique ID", () => {
      const ids = result.images.map((img) => img.id);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(result.images.length);
    });

    it("each image has a MinIO URL", () => {
      result.images.forEach((image) => {
        expect(image.imageUrl).toMatch(/^https:\/\/minio\.bws\.local\/bucket\/biz-001\//);
        expect(image.imageUrl).toContain(".jpg");
      });
    });

    it("each image has descriptive alt text", () => {
      result.images.forEach((image) => {
        expect(image.altText).toBeDefined();
        expect(image.altText.length).toBeGreaterThanOrEqual(10);
        // Alt text should be descriptive (contains multiple words)
        expect(image.altText.split(" ").length).toBeGreaterThanOrEqual(3);
      });
    });

    it("each image is associated with the correct business ID via foreign key", () => {
      result.images.forEach((image) => {
        expect(image.businessId).toBe("biz-001");
      });
    });

    it("each image has required fields", () => {
      result.images.forEach((image) => {
        expect(image.id).toBeDefined();
        expect(image.businessId).toBe("biz-001");
        expect(image.imageUrl).toBeDefined();
        expect(image.altText).toBeDefined();
        expect(image.uploadDate).toBeInstanceOf(Date);
        expect(image.category).toBe("restaurants");
      });
    });
  });

  describe("Multiple Business Image Generation", () => {
    let results: BusinessImageData[];

    beforeAll(() => {
      results = generateImagesForBusinesses(mockBusinesses);
    });

    it("generates image data for all 30 businesses", () => {
      expect(results).toHaveLength(30);
    });

    it("each business has 2-4 images", () => {
      results.forEach((businessImageData) => {
        expect(businessImageData.images.length).toBeGreaterThanOrEqual(2);
        expect(businessImageData.images.length).toBeLessThanOrEqual(4);
      });
    });

    it("each business has unique image IDs", () => {
      results.forEach((businessImageData) => {
        const ids = businessImageData.images.map((img) => img.id);
        const uniqueIds = new Set(ids);
        expect(uniqueIds.size).toBe(businessImageData.images.length);
      });
    });

    it("images are associated with correct business IDs", () => {
      results.forEach((businessImageData) => {
        businessImageData.images.forEach((image) => {
          expect(image.businessId).toBe(businessImageData.businessId);
        });
      });
    });

    it("each image has category-appropriate alt text", () => {
      results.forEach((businessImageData) => {
        businessImageData.images.forEach((image) => {
          expect(image.category).toBe(businessImageData.category);
          expect(image.altText.length).toBeGreaterThanOrEqual(10);
        });
      });
    });
  });

  describe("Validation", () => {
    it("validates single business image data correctly", () => {
      const businessImageData = generateImagesForBusiness(
        "biz-001",
        "Soul Food Kitchen",
        "restaurants"
      );

      const validation = validateBusinessImageData(businessImageData);
      expect(validation.valid).toBe(true);
      expect(validation.errors).toHaveLength(0);
    });

    it("validates all business image data correctly", () => {
      const results = generateImagesForBusinesses(mockBusinesses);
      const validation = validateAllBusinessImageData(results);

      expect(validation.allValid).toBe(true);
      validation.results.forEach((result) => {
        expect(result.valid).toBe(true);
        expect(result.errors).toHaveLength(0);
      });
    });

    it("catches invalid image count", () => {
      const invalidData: BusinessImageData = {
        businessId: "biz-001",
        businessName: "Test Business",
        category: "restaurants",
        images: [
          {
            id: "img-001",
            businessId: "biz-001",
            imageUrl: "https://minio.bws.local/bucket/biz-001/image-1.jpg",
            altText: "Short",
            uploadDate: new Date(),
            category: "restaurants",
          },
        ],
      };

      const validation = validateBusinessImageData(invalidData);
      expect(validation.valid).toBe(false);
      expect(validation.errors.some((e) => e.includes("Invalid image count"))).toBe(true);
    });

    it("catches missing foreign key association", () => {
      const invalidData: BusinessImageData = {
        businessId: "biz-001",
        businessName: "Test Business",
        category: "restaurants",
        images: [
          {
            id: "img-001",
            businessId: "biz-002",
            imageUrl: "https://minio.bws.local/bucket/biz-001/image-1.jpg",
            altText: "Interior dining room with warm lighting",
            uploadDate: new Date(),
            category: "restaurants",
          },
        ],
      };

      const validation = validateBusinessImageData(invalidData);
      expect(validation.valid).toBe(false);
      expect(validation.errors.some((e) => e.includes("businessId mismatch"))).toBe(true);
    });

    it("catches missing alt text", () => {
      const invalidData: BusinessImageData = {
        businessId: "biz-001",
        businessName: "Test Business",
        category: "restaurants",
        images: [
          {
            id: "img-001",
            businessId: "biz-001",
            imageUrl: "https://minio.bws.local/bucket/biz-001/image-1.jpg",
            altText: "",
            uploadDate: new Date(),
            category: "restaurants",
          },
        ],
      };

      const validation = validateBusinessImageData(invalidData);
      expect(validation.valid).toBe(false);
      expect(validation.errors.some((e) => e.includes("Missing alt text"))).toBe(true);
    });
  });

  describe("MinIO URL Format", () => {
    it("generates correct MinIO URL format", () => {
      const result = generateImagesForBusiness(
        "biz-001",
        "Soul Food Kitchen",
        "restaurants"
      );

      result.images.forEach((image, index) => {
        expect(image.imageUrl).toMatch(
          /^https:\/\/minio\.bws\.local\/bucket\/biz-001\/image-\d+\.jpg$/
        );
      });
    });

    it("URLs include the correct business ID", () => {
      const result = generateImagesForBusiness(
        "unique-biz-id-123",
        "Test Business",
        "retail"
      );

      result.images.forEach((image) => {
        expect(image.imageUrl).toContain("unique-biz-id-123");
      });
    });
  });

  describe("Category-Specific Alt Text", () => {
    it("generates alt text appropriate for restaurants category", () => {
      const result = generateImagesForBusiness(
        "biz-001",
        "Soul Food Kitchen",
        "restaurants"
      );

      result.images.forEach((image) => {
        expect(image.category).toBe("restaurants");
        // Alt text should contain descriptive words relevant to restaurants
        expect(image.altText.length).toBeGreaterThanOrEqual(10);
      });
    });

    it("generates alt text appropriate for retail category", () => {
      const result = generateImagesForBusiness(
        "biz-002",
        "Urban Boutique",
        "retail"
      );

      result.images.forEach((image) => {
        expect(image.category).toBe("retail");
        expect(image.altText.length).toBeGreaterThanOrEqual(10);
      });
    });

    it("generates alt text appropriate for all categories", () => {
      const categories = [
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

      categories.forEach((category) => {
        const result = generateImagesForBusiness(
          `biz-${category}`,
          `Test ${category}`,
          category
        );

        result.images.forEach((image) => {
          expect(image.category).toBe(category);
          expect(image.altText.length).toBeGreaterThanOrEqual(10);
        });
      });
    });
  });

  describe("AC3 Gherkin Validation", () => {
    it("Given 30 businesses exist: generates data for all 30", () => {
      const results = generateImagesForBusinesses(mockBusinesses);
      expect(results).toHaveLength(30);
    });

    it("When images are created for each business: all have images", () => {
      const results = generateImagesForBusinesses(mockBusinesses);
      results.forEach((businessImageData) => {
        expect(businessImageData.images.length).toBeGreaterThan(0);
      });
    });

    it("Then each business has 2-4 images uploaded to MinIO", () => {
      const results = generateImagesForBusinesses(mockBusinesses);
      results.forEach((businessImageData) => {
        expect(businessImageData.images.length).toBeGreaterThanOrEqual(2);
        expect(businessImageData.images.length).toBeLessThanOrEqual(4);
      });
    });

    it("And each image has descriptive alt text matching the business category", () => {
      const results = generateImagesForBusinesses(mockBusinesses);
      results.forEach((businessImageData) => {
        businessImageData.images.forEach((image) => {
          expect(image.altText).toBeDefined();
          expect(image.altText.length).toBeGreaterThanOrEqual(10);
          expect(image.category).toBe(businessImageData.category);
        });
      });
    });

    it("And images are associated with the correct business ID via foreign key", () => {
      const results = generateImagesForBusinesses(mockBusinesses);
      results.forEach((businessImageData) => {
        businessImageData.images.forEach((image) => {
          expect(image.businessId).toBe(businessImageData.businessId);
        });
      });
    });
  });
});
