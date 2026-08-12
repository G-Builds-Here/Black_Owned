/**
 * Business Scraper Service
 *
 * Extracts business name and address from raw listing data.
 */

import {
  BusinessScraper,
  RawBusinessListing,
  ExtractedBusinessData,
  ExtractionResult,
  ScraperSource,
} from "../types/business-listing";

/**
 * Address parsing result
 */
interface ParsedAddress {
  street: string;
  city: string;
  state: string;
  zipCode: string;
  countryCode: string;
}

/**
 * Extracts business name from raw listing data
 * Handles various name formats and cleans up extraneous information
 */
function extractName(rawName: string): string {
  if (!rawName || typeof rawName !== "string") {
    return "";
  }

  // Trim whitespace
  let name = rawName.trim();

  // Remove common suffixes that are not part of the business name
  // Only remove "Map data from..." patterns, not descriptive suffixes
  name = name.replace(/\(Map data from.*\)/i, "").trim();
  name = name.replace(/\s-\s\(.*\)/, "").trim();

  // Remove extra whitespace
  name = name.replace(/\s+/g, " ").trim();

  return name;
}

/**
 * Parses a full address string into structured components
 */
function parseAddress(fullAddress: string): ParsedAddress {
  const result: ParsedAddress = {
    street: "",
    city: "",
    state: "",
    zipCode: "",
    countryCode: "US",
  };

  if (!fullAddress || typeof fullAddress !== "string") {
    return result;
  }

  const address = fullAddress.trim();

  // Try to extract country code first
  const countryMatch = address.match(/\b(US|USA|United States|CA|UK|GB)\b/i);
  if (countryMatch) {
    result.countryCode = countryMatch[1].toUpperCase();
  }

  // Remove country from address for further parsing
  let coreAddress = address.replace(/\b(US|USA|United States|CA|UK|GB)\b/i, "").trim();

  // Try to extract ZIP code (US format: 12345 or 12345-6789)
  const zipMatch = coreAddress.match(/\b(\d{5}(?:-\d{4})?)\b/);
  if (zipMatch) {
    result.zipCode = zipMatch[1];
    coreAddress = coreAddress.replace(zipMatch[0], "").trim();
  }

  // Try to extract state (2-letter abbreviation before optional comma or end)
  const stateMatch = coreAddress.match(/,\s*([A-Z]{2})\s*,?\s*$/);
  if (stateMatch) {
    result.state = stateMatch[1];
    coreAddress = coreAddress.replace(stateMatch[0], "").trim();
  }

  // Split remaining address by comma to get city and street
  const parts = coreAddress.split(",").map((p) => p.trim());

  if (parts.length >= 2) {
    result.street = parts[0];
    result.city = parts[1].replace(/\s*\b(Ave|Street|St|Road|Rd|Drive|Dr|Blvd|Boulevard)\.?\s*$/i, "").trim();
  } else if (parts.length === 1) {
    // Single part - try to parse as "City, State" or just street
    const cityStateMatch = parts[0].match(/^(.+?),\s*([A-Z]{2})$/);
    if (cityStateMatch) {
      result.city = cityStateMatch[1].trim();
      result.state = cityStateMatch[2];
    } else {
      result.street = parts[0];
    }
  }

  return result;
}

/**
 * Google Maps scraper implementation
 */
class GoogleMapsScraper implements BusinessScraper {
  source: ScraperSource = "google-maps";

  extract(listing: RawBusinessListing): ExtractionResult {
    try {
      const name = extractName(listing.rawName);
      const addressParts = parseAddress(listing.rawAddress);

      if (!name) {
        return {
          success: false,
          error: "Could not extract business name",
        };
      }

      return {
        success: true,
        data: {
          name,
          address: {
            ...addressParts,
            fullAddress: listing.rawAddress.trim(),
          },
          source: this.source,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }
}

/**
 * Yelp scraper implementation
 */
class YelpScraper implements BusinessScraper {
  source: ScraperSource = "yelp";

  extract(listing: RawBusinessListing): ExtractionResult {
    try {
      const name = extractName(listing.rawName);
      const addressParts = parseAddress(listing.rawAddress);

      if (!name) {
        return {
          success: false,
          error: "Could not extract business name",
        };
      }

      return {
        success: true,
        data: {
          name,
          address: {
            ...addressParts,
            fullAddress: listing.rawAddress.trim(),
          },
          source: this.source,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }
}

/**
 * Facebook scraper implementation
 */
class FacebookScraper implements BusinessScraper {
  source: ScraperSource = "facebook";

  extract(listing: RawBusinessListing): ExtractionResult {
    try {
      const name = extractName(listing.rawName);
      const addressParts = parseAddress(listing.rawAddress);

      if (!name) {
        return {
          success: false,
          error: "Could not extract business name",
        };
      }

      return {
        success: true,
        data: {
          name,
          address: {
            ...addressParts,
            fullAddress: listing.rawAddress.trim(),
          },
          source: this.source,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }
}

/**
 * Scraper factory - returns the appropriate scraper for the source
 */
export function getScraper(source: ScraperSource): BusinessScraper {
  switch (source) {
    case "google-maps":
      return new GoogleMapsScraper();
    case "yelp":
      return new YelpScraper();
    case "facebook":
      return new FacebookScraper();
    default:
      throw new Error(`Unsupported scraper source: ${source}`);
  }
}

/**
 * Extracts business data from a raw listing
 * Convenience function that gets the appropriate scraper and runs extraction
 */
export function extractBusinessData(listing: RawBusinessListing): ExtractionResult {
  const scraper = getScraper(listing.source);
  return scraper.extract(listing);
}
