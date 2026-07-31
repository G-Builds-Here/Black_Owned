/**
 * Image Service
 *
 * Generates image data for businesses according to AC3 requirements:
 * - Each business gets 2-4 images
 * - Images have descriptive alt text matching the business category
 * - Images are associated with the correct business ID via foreign key
 * - Images are simulated as uploaded to MinIO (URL generation)
 */

import {
  Image,
  BusinessImageData,
  IMAGE_CATEGORY_CONFIGS,
} from "../types/image";

export type { BusinessImageData, Image };

/**
 * Generates a UUID v4 string for image IDs
 */
function generateUuid(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Generates a random integer between min and max (inclusive)
 */
function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * Selects a random element from an array
 */
function randomChoice<T>(arr: T[]): T {
  return arr[randomInt(0, arr.length - 1)];
}

/**
 * Selects multiple unique random elements from an array
 */
function randomChoices<T>(arr: T[], count: number): T[] {
  const shuffled = [...arr].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
}

/**
 * Generates a MinIO-compatible URL for an image
 * Format: https://minio.bws.local/bucket/{businessId}/{imageId}.jpg
 */
function generateMinIOUrl(businessId: string, imageIndex: number): string {
  return `https://minio.bws.local/bucket/${businessId}/image-${imageIndex}.jpg`;
}

/**
 * Generates images for a single business
 * Ensures: 2-4 images per business, category-appropriate alt text
 */
export function generateImagesForBusiness(
  businessId: string,
  businessName: string,
  category: string
): BusinessImageData {
  const config = IMAGE_CATEGORY_CONFIGS[category];

  if (!config) {
    throw new Error(`Unknown category: ${category}`);
  }

  const imageCount = randomInt(config.imageCountMin, config.imageCountMax);
  const altTextTemplates = randomChoices(config.altTextTemplates, imageCount);

  const images: Image[] = altTextTemplates.map((altText, index) => {
    const imageId = generateUuid();
    const imageUrl = generateMinIOUrl(businessId, index + 1);

    return {
      id: imageId,
      businessId,
      imageUrl,
      altText,
      uploadDate: new Date(),
      category,
    };
  });

  return {
    businessId,
    businessName,
    category,
    images,
  };
}

/**
 * Generates images for multiple businesses
 */
export function generateImagesForBusinesses(
  businessData: Array<{ id: string; name: string; category: string }>
): BusinessImageData[] {
  return businessData.map((business) =>
    generateImagesForBusiness(business.id, business.name, business.category)
  );
}

/**
 * Validates that image data meets AC3 requirements
 */
export function validateBusinessImageData(
  businessImageData: BusinessImageData
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  // Check image count is within range (2-4)
  if (businessImageData.images.length < 2 || businessImageData.images.length > 4) {
    errors.push(
      `Invalid image count: ${businessImageData.images.length} (must be 2-4)`
    );
  }

  // Check all images have required fields
  for (const image of businessImageData.images) {
    if (!image.id) {
      errors.push("Missing image ID");
    }
    if (image.businessId !== businessImageData.businessId) {
      errors.push(
        `Image businessId mismatch: ${image.businessId} vs ${businessImageData.businessId}`
      );
    }
    if (!image.imageUrl) {
      errors.push("Missing image URL");
    }
    if (!image.altText || image.altText.length === 0) {
      errors.push("Missing alt text for image");
    }
    if (!image.category) {
      errors.push("Missing category for image");
    }
  }

  // Check alt text is descriptive (minimum length)
  for (const image of businessImageData.images) {
    if (image.altText && image.altText.length < 10) {
      errors.push(
        `Alt text too short: "${image.altText}" (must be at least 10 characters)`
      );
    }
  }

  // Check images are associated with correct business via foreign key
  const foreignKeyMatches = businessImageData.images.every(
    (img) => img.businessId === businessImageData.businessId
  );
  if (!foreignKeyMatches) {
    errors.push("Not all images are associated with the correct business ID");
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Validates all business image data
 */
export function validateAllBusinessImageData(
  businessImageDataList: BusinessImageData[]
): {
  allValid: boolean;
  results: { businessId: string; businessName: string; valid: boolean; errors: string[] }[];
} {
  const results = businessImageDataList.map((businessImageData) => {
    const validation = validateBusinessImageData(businessImageData);
    return {
      businessId: businessImageData.businessId,
      businessName: businessImageData.businessName,
      valid: validation.valid,
      errors: validation.errors,
    };
  });

  const allValid = results.every((r) => r.valid);

  return { allValid, results };
}
