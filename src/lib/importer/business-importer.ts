/**
 * Business Importer
 *
 * Data import pipeline for scraped business data.
 * Takes scraped data and persists it to the database with proper error handling and batch processing.
 */

import { PoolClient } from "pg";
import { ScraperResult, ScraperSource, RawScraperData, GoogleMapsRawData, YelpRawData, FacebookRawData } from "../../types/scraper-result";
import { Business } from "../../types/business";
import { createBusiness, initializeBusinessSchema } from "../db/business-repository";

/**
 * Import result for a single business record
 */
export interface ImportResult {
  success: boolean;
  businessId?: string;
  error?: string;
  source: ScraperSource;
  originalId: string;
}

/**
 * Batch import result
 */
export interface BatchImportResult {
  total: number;
  succeeded: number;
  failed: number;
  results: ImportResult[];
  errors: Array<{ source: ScraperSource; originalId: string; error: string }>;
}

/**
 * Normalize category from scraper source to internal category ID
 */
function normalizeCategory(rawData: RawScraperData, source: ScraperSource): string {
  switch (source) {
    case ScraperSource.GOOGLE_MAPS:
      const googleTypes = (rawData as GoogleMapsRawData).types;
      if (googleTypes && googleTypes.length > 0) {
        return mapGoogleTypesToCategory(googleTypes);
      }
      return "other";

    case ScraperSource.YELP:
      const yelpData = rawData as YelpRawData;
      if (yelpData.categories && yelpData.categories.length > 0) {
        return yelpData.categories[0].alias;
      }
      return "other";

    case ScraperSource.FACEBOOK:
      const fbCategory = (rawData as FacebookRawData).category;
      if (fbCategory) {
        return mapFacebookCategoryToCategory(fbCategory);
      }
      return "other";

    default:
      return "other";
  }
}

/**
 * Map Google Places types to internal categories
 */
function mapGoogleTypesToCategory(types: string[]): string {
  const categoryMap: Record<string, string> = {
    restaurant: "food-dining",
    cafe: "food-dining",
    bar: "food-dining",
    food: "food-dining",
    "meal_delivery": "food-dining",
    "meal_takeaway": "food-dining",
    lawyer: "professional-services",
    "accounting": "financial-services",
    "bank": "financial-services",
    "insurance_agency": "financial-services",
    "real_estate_agency": "professional-services",
    "clothing_store": "retail-fashion",
    "shoe_store": "retail-fashion",
    "department_store": "retail-fashion",
    "gym": "health-wellness",
    "spa": "health-wellness",
    "doctor": "health-wellness",
    "dentist": "health-wellness",
    "car_dealer": "automotive",
    "car_repair": "automotive",
    "hardware_store": "home-services",
    "plumber": "home-services",
    "electrician": "home-services",
    "movie_theater": "entertainment",
    "school": "education",
    "university": "education",
  };

  for (const type of types) {
    const normalizedType = type.toLowerCase().replace(/_/g, "");
    for (const [key, category] of Object.entries(categoryMap)) {
      if (normalizedType.includes(key.replace(/_/g, ""))) {
        return category;
      }
    }
  }

  return "other";
}

/**
 * Map Facebook categories to internal categories
 */
function mapFacebookCategoryToCategory(category: string): string {
  const categoryLower = category.toLowerCase();

  if (categoryLower.includes("restaurant") || categoryLower.includes("food") || categoryLower.includes("cafe")) {
    return "food-dining";
  }
  if (categoryLower.includes("law") || categoryLower.includes("consulting") || categoryLower.includes("professional")) {
    return "professional-services";
  }
  if (categoryLower.includes("store") || categoryLower.includes("shop") || categoryLower.includes("retail")) {
    return "retail-fashion";
  }
  if (categoryLower.includes("health") || categoryLower.includes("medical") || categoryLower.includes("wellness")) {
    return "health-wellness";
  }
  if (categoryLower.includes("auto") || categoryLower.includes("car")) {
    return "automotive";
  }
  if (categoryLower.includes("home") || categoryLower.includes("construction")) {
    return "home-services";
  }
  if (categoryLower.includes("entertainment") || categoryLower.includes("music") || categoryLower.includes("event")) {
    return "entertainment";
  }
  if (categoryLower.includes("school") || categoryLower.includes("education") || categoryLower.includes("university")) {
    return "education";
  }
  if (categoryLower.includes("bank") || categoryLower.includes("finance") || categoryLower.includes("insurance")) {
    return "financial-services";
  }

  return "other";
}

/**
 * Extract description from raw scraper data
 */
function extractDescription(rawData: RawScraperData, source: ScraperSource): string | undefined {
  switch (source) {
    case ScraperSource.GOOGLE_MAPS:
      // Google Maps doesn't provide a direct description field
      return undefined;

    case ScraperSource.YELP:
      const yelpData = rawData as YelpRawData;
      // Build description from available Yelp data
      const yelpParts: string[] = [];
      if (yelpData.rating) {
        yelpParts.push(`Rated ${yelpData.rating} stars`);
      }
      if (yelpData.price) {
        yelpParts.push(`Price level: ${yelpData.price}`);
      }
      if (yelpData.categories && yelpData.categories.length > 0) {
        yelpParts.push(yelpData.categories.map((c) => c.title).join(", "));
      }
      return yelpParts.length > 0 ? yelpParts.join(". ") : undefined;

    case ScraperSource.FACEBOOK:
      const fbData = rawData as FacebookRawData;
      return fbData.description || fbData.about;

    default:
      return undefined;
  }
}

/**
 * Transform scraped data to internal Business format
 */
function transformToBusiness(scraped: ScraperResult, ownerId: string): Omit<Business, "createdAt" | "updatedAt"> {
  const { rawData, source } = scraped;

  const categoryId = normalizeCategory(rawData, source);
  const description = extractDescription(rawData, source);

  // Generate ID from source data
  let businessId: string;
  switch (source) {
    case ScraperSource.GOOGLE_MAPS:
      businessId = `gmaps-${(rawData as GoogleMapsRawData).placeId}`;
      break;
    case ScraperSource.YELP:
      businessId = `yelp-${(rawData as YelpRawData).id}`;
      break;
    case ScraperSource.FACEBOOK:
      businessId = `fb-${(rawData as FacebookRawData).id}`;
      break;
    default:
      businessId = `unknown-${Date.now()}`;
  }

  return {
    id: businessId,
    ownerId,
    name: rawData.name,
    description,
    categoryId,
    verificationStatus: "unverified",
  };
}

/**
 * Import a single scraped business record
 */
async function importSingleBusiness(
  client: PoolClient,
  scraped: ScraperResult,
  ownerId: string
): Promise<ImportResult> {
  try {
    const businessData = transformToBusiness(scraped, ownerId);

    // Check if business already exists
    const existing = await client.query(
      "SELECT id FROM businesses WHERE id = $1",
      [businessData.id]
    );

    if (existing.rows.length > 0) {
      return {
        success: false,
        error: `Business with ID ${businessData.id} already exists`,
        source: scraped.source,
        originalId: businessData.id,
      };
    }

    const business = await createBusiness(
      client,
      businessData.ownerId,
      businessData.name,
      businessData.description,
      businessData.categoryId
    );

    return {
      success: true,
      businessId: business.id,
      source: scraped.source,
      originalId: businessData.id,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return {
      success: false,
      error: errorMessage,
      source: scraped.source,
      originalId: scraped.rawData.name || "unknown",
    };
  }
}

/**
 * Import a batch of scraped businesses with transaction support
 */
export async function importBusinessBatch(
  client: PoolClient,
  scrapedResults: ScraperResult[],
  ownerId: string,
  batchSize: number = 50
): Promise<BatchImportResult> {
  const results: ImportResult[] = [];
  const errors: Array<{ source: ScraperSource; originalId: string; error: string }> = [];

  // Process in batches
  for (let i = 0; i < scrapedResults.length; i += batchSize) {
    const batch = scrapedResults.slice(i, i + batchSize);
    const batchResults: ImportResult[] = [];

    for (const scraped of batch) {
      const result = await importSingleBusiness(client, scraped, ownerId);
      batchResults.push(result);

      if (!result.success && result.error) {
        errors.push({
          source: scraped.source,
          originalId: result.originalId,
          error: result.error,
        });
      }
    }

    results.push(...batchResults);
  }

  const succeeded = results.filter((r) => r.success).length;
  const failed = results.filter((r) => !r.success).length;

  return {
    total: results.length,
    succeeded,
    failed,
    results,
    errors,
  };
}

/**
 * Initialize the import pipeline schema
 */
export async function initializeImportSchema(client: PoolClient): Promise<void> {
  await initializeBusinessSchema(client);
}
