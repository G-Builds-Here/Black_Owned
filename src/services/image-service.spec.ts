/**
 * Tests for Image Service
 *
 * Verifies that images are generated according to AC3 requirements:
 * - 2-4 images per business
 * - Descriptive alt text matching business category
 * - Proper foreign key association with business ID
 * - MinIO URL format
 */

import {
  generateImagesForBusiness,
  generateImagesForBusinesses,
  validateBusinessImageData,
  validateAllBusinessImageData,
} from "./image-service";
import { IMAGE_CATEGORY_CONFIGS } from "../types/image";

describe("Image Service", () => {
  const testBusinessId = "bws-test-business-001";
  const testBusinessName = "BWS-TEST: Soul Food Kitchen";
  const testCategory = "restaurants";

  describe("generateImagesForBusiness", () => {
    it("generates 2-4 images per business", () => {
      const result = generateImagesForBusiness(
        testBusinessId,
        testBusinessName,
        testCategory
      );

      expect(result.images.length).toBeGreaterThanOrEqual(2);
      expect(result.images.length).toBeLessThanOrEqual(4);
    });

    it("associates all images with the correct business ID", () => {
      const result = generateImagesForBusiness(
        testBusinessId,
        testBusinessName,
        testCategory
      );

      result.images.forEach((image) => {
        expect(image.businessId).toBe(testBusinessId);
      });
    });

    it("generates unique image IDs for each image", () => {
      const result = generateImagesForBusiness(
        testBusinessId,
        testBusinessName,
        testCategory
      );

      const ids = result.images.map((img) => img.id);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(result.images.length);
    });

    it("generates MinIO-compatible URLs", () => {
      const result = generateImagesForBusiness(
        testBusinessId,
        testBusinessName,
        testCategory
      );

      result.images.forEach((image) => {
        expect(image.imageUrl).toMatch(/^https:\/\/minio\.bws\.local\/bucket\//);
        expect(image.imageUrl).toContain(testBusinessId);
      });
    });

    it("generates descriptive alt text for each image", () => {
      const result = generateImagesForBusiness(
        testBusinessId,
        testBusinessName,
        testCategory
      );

      result.images.forEach((image) => {
        expect(image.altText).toBeDefined();
        expect(image.altText.length).toBeGreaterThanOrEqual(10);
        expect(typeof image.altText).toBe("string");
      });
    });

    it("alt text matches the business category", () => {
      const result = generateImagesForBusiness(
        testBusinessId,
        testBusinessName,
        testCategory
      );

      const config = IMAGE_CATEGORY_CONFIGS[testCategory];
      result.images.forEach((image) => {
        expect(image.category).toBe(testCategory);
        // Alt text should be from the category-specific templates
        expect(config.altTextTemplates).toContain(image.altText);
      });
    });

    it("includes upload date for each image", () => {
      const result = generateImagesForBusiness(
        testBusinessId,
        testBusinessName,
        testCategory
      );

      result.images.forEach((image) => {
        expect(image.uploadDate).toBeInstanceOf(Date);
      });
    });

    it("returns correct business metadata", () => {
      const result = generateImagesForBusiness(
        testBusinessId,
        testBusinessName,
        testCategory
      );

      expect(result.businessId).toBe(testBusinessId);
      expect(result.businessName).toBe(testBusinessName);
      expect(result.category).toBe(testCategory);
    });
  });

  describe("generateImagesForBusinesses", () => {
    const testBusinesses = [
      { id: "biz-001", name: "BWS-TEST: Salon One", category: "beauty" },
      { id: "biz-002", name: "BWS-TEST: Restaurant Two", category: "restaurants" },
      { id: "biz-003", name: "BWS-TEST: Gym Three", category: "fitness" },
    ];

    it("generates images for all provided businesses", () => {
      const results = generateImagesForBusinesses(testBusinesses);

      expect(results).toHaveLength(testBusinesses.length);
    });

    it("maintains correct business ID association for each", () => {
      const results = generateImagesForBusinesses(testBusinesses);

      results.forEach((result, index) => {
        expect(result.businessId).toBe(testBusinesses[index].id);
        result.images.forEach((image) => {
          expect(image.businessId).toBe(testBusinesses[index].id);
        });
      });
    });

    it("generates appropriate images for different categories", () => {
      const results = generateImagesForBusinesses(testBusinesses);

      results.forEach((result) => {
        expect(result.images.length).toBeGreaterThanOrEqual(2);
        expect(result.images.length).toBeLessThanOrEqual(4);
      });
    });
  });

  describe("validateBusinessImageData", () => {
    it("returns valid for properly structured image data", () => {
      const validData = generateImagesForBusiness(
        testBusinessId,
        testBusinessName,
        testCategory
      );

      const validation = validateBusinessImageData(validData);
      expect(validation.valid).toBe(true);
      expect(validation.errors).toHaveLength(0);
    });

    it("detects invalid image count (too few)", () => {
      const invalidData = generateImagesForBusiness(
        testBusinessId,
        testBusinessName,
        testCategory
      );
      // Manually set invalid count
      (invalidData.images as any) = [invalidData.images[0]];

      const validation = validateBusinessImageData(invalidData);
      expect(validation.valid).toBe(false);
      expect(validation.errors.some((e) => e.includes("Invalid image count"))).toBe(true);
    });

    it("detects missing image ID", () => {
      const invalidData = generateImagesForBusiness(
        testBusinessId,
        testBusinessName,
        testCategory
      );
      (invalidData.images[0] as any).id = undefined;

      const validation = validateBusinessImageData(invalidData);
      expect(validation.valid).toBe(false);
      expect(validation.errors.some((e) => e.includes("Missing image ID"))).toBe(true);
    });

    it("detects missing alt text", () => {
      const invalidData = generateImagesForBusiness(
        testBusinessId,
        testBusinessName,
        testCategory
      );
      (invalidData.images[0] as any).altText = "";

      const validation = validateBusinessImageData(invalidData);
      expect(validation.valid).toBe(false);
      expect(validation.errors.some((e) => e.includes("Missing alt text"))).toBe(true);
    });

    it("detects alt text that is too short", () => {
      const invalidData = generateImagesForBusiness(
        testBusinessId,
        testBusinessName,
        testCategory
      );
      (invalidData.images[0] as any).altText = "short";

      const validation = validateBusinessImageData(invalidData);
      expect(validation.valid).toBe(false);
      expect(validation.errors.some((e) => e.includes("Alt text too short"))).toBe(true);
    });

    it("detects business ID mismatch", () => {
      const invalidData = generateImagesForBusiness(
        testBusinessId,
        testBusinessName,
        testCategory
      );
      (invalidData.images[0] as any).businessId = "wrong-business-id";

      const validation = validateBusinessImageData(invalidData);
      expect(validation.valid).toBe(false);
      expect(validation.errors.some((e) => e.includes("businessId mismatch"))).toBe(true);
    });
  });

  describe("validateAllBusinessImageData", () => {
    const validBusinessData = [
      generateImagesForBusiness("biz-001", "BWS-TEST: Biz 1", "beauty"),
      generateImagesForBusiness("biz-002", "BWS-TEST: Biz 2", "restaurants"),
      generateImagesForBusiness("biz-003", "BWS-TEST: Biz 3", "fitness"),
    ];

    it("returns allValid: true when all businesses have valid image data", () => {
      const validation = validateAllBusinessImageData(validBusinessData);
      expect(validation.allValid).toBe(true);
      expect(validation.results.every((r) => r.valid)).toBe(true);
    });

    it("returns detailed results for each business", () => {
      const validation = validateAllBusinessImageData(validBusinessData);

      expect(validation.results).toHaveLength(validBusinessData.length);
      validation.results.forEach((result, index) => {
        expect(result.businessId).toBe(validBusinessData[index].businessId);
        expect(result.businessName).toBe(validBusinessData[index].businessName);
      });
    });

    it("detects invalid data in mixed valid/invalid set", () => {
      const mixedData = [
        ...validBusinessData,
        (() => {
          const invalid = generateImagesForBusiness(
            "biz-004",
            "BWS-TEST: Biz 4",
            "retail"
          );
          (invalid.images[0] as any).altText = "";
          return invalid;
        })(),
      ];

      const validation = validateAllBusinessImageData(mixedData);
      expect(validation.allValid).toBe(false);
      expect(
        validation.results.some((r) => !r.valid && r.businessId === "biz-004")
      ).toBe(true);
    });
  });

  describe("Category coverage", () => {
    const categories = Object.keys(IMAGE_CATEGORY_CONFIGS);

    it("supports all 10 business categories", () => {
      expect(categories).toHaveLength(10);
    });

    it("each category has 2-4 image capacity", () => {
      categories.forEach((category) => {
        const config = IMAGE_CATEGORY_CONFIGS[category];
        expect(config.imageCountMin).toBeGreaterThanOrEqual(2);
        expect(config.imageCountMax).toBeLessThanOrEqual(4);
      });
    });

    it("each category has descriptive alt text templates", () => {
      categories.forEach((category) => {
        const config = IMAGE_CATEGORY_CONFIGS[category];
        expect(config.altTextTemplates).toBeDefined();
        expect(config.altTextTemplates.length).toBeGreaterThanOrEqual(2);

        config.altTextTemplates.forEach((template) => {
          expect(template.length).toBeGreaterThanOrEqual(10);
        });
      });
    });

    it("generates valid images for each category", () => {
      categories.forEach((category) => {
        const result = generateImagesForBusiness(
          "test-id",
          `BWS-TEST: Test ${category}`,
          category
        );

        const validation = validateBusinessImageData(result);
        expect(validation.valid).toBe(true);
      });
    });
  });
});
