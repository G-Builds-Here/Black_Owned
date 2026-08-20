/**
 * Scraper Result Types
 *
 * Raw scraped data from various sources before normalization.
 * Each source has its own field structure based on the platform's API.
 */

/**
 * Raw data from Google Maps scraper
 */
export interface GoogleMapsRawData {
  placeId: string;
  name: string;
  formattedAddress: string;
  latitude: number;
  longitude: number;
  phoneNumber?: string;
  website?: string;
  rating?: number;
  userRatingsTotal?: number;
  priceLevel?: number;
  businessStatus?: string;
  openingHours?: {
    openNow: boolean;
    weekdayText: string[];
  };
  types?: string[];
  formattedPhoneNumber?: string;
  internationalPhoneNumber?: string;
  geometry?: {
    location: {
      lat: number;
      lng: number;
    };
    viewport: unknown;
  };
  url?: string;
  utcOffset?: number;
  vicinity?: string;
}

/**
 * Raw data from Yelp scraper
 */
export interface YelpRawData {
  id: string;
  alias: string;
  name: string;
  image_url: string;
  is_claimed: boolean;
  is_closed: boolean;
  url: string;
  phone: string;
  display_phone: string;
  review_count: number;
  categories: Array<{
    alias: string;
    title: string;
  }>;
  rating: number;
  location: {
    address1: string;
    address2?: string;
    address3?: string;
    city: string;
    state: string;
    zip_code: string;
    country: string;
    display_address: string[];
  };
  coordinates: {
    latitude: number;
    longitude: number;
  };
  photos: string[];
  price: string;
  hours?: Array<{
    open: Array<{
      is_overnight: boolean;
      start: string;
      end: string;
      day: number;
    }>;
    hours_type: string;
    is_open_now: boolean;
  }>;
  transactions: string[];
  messaging?: {
    url: string;
    use_case_text: string;
  };
}

/**
 * Raw data from Facebook scraper
 */
export interface FacebookRawData {
  id: string;
  name: string;
  description?: string;
  link?: string;
  phone?: string;
  email?: string;
  website?: string;
  category?: string;
  location?: {
    city?: string;
    country?: string;
    latitude?: number;
    longitude?: number;
    state?: string;
    street?: string;
    zip?: string;
  };
  cover?: {
    cover_id: string;
    offset_y: number;
    source: string;
  };
  about?: string;
  were_here_count?: number;
  checkins?: number;
  talking_about_count?: number;
  fan_count?: number;
  verification_status?: string;
}

/**
 * Source enumeration for scraper origins
 *
 * Values use the hyphenated form ("google-maps") to match the domain
 * convention used by PlaceDetails, the REST routes, and the DB `source`
 * column's canonical values. (Was "google_maps"; the underscore form was the
 * lone outlier and broke the scraper-result `source` contract.)
 */
export enum ScraperSource {
  GOOGLE_MAPS = "google-maps",
  YELP = "yelp",
  FACEBOOK = "facebook",
}

/**
 * Union type for all raw scraper data
 */
export type RawScraperData = GoogleMapsRawData | YelpRawData | FacebookRawData;

/**
 * ScraperResult - Contains raw scraped data before normalization
 *
 * This type wraps the source-specific raw data and tracks its origin.
 * Used as the intermediate representation before data is transformed
 * into the normalized Business type.
 */
export interface RawScraperResult {
  /** The source platform that provided this data */
  source: ScraperSource;
  /** The raw data from the source */
  rawData: RawScraperData;
  /** Timestamp when the data was scraped */
  scrapedAt: Date;
  /** Optional job ID if scraped as part of a batch job */
  jobId?: string;
}

/**
 * Scraped business data - shared across all scrapers (Google Maps, Yelp, Facebook)
 * This is the normalized output format after parsing source-specific responses.
 */
export interface ScrapedBusiness {
  name: string;
  address: string;
  phone?: string;
  website?: string;
  category?: string;
  rating?: number;
  reviewCount?: number;
  source: ScraperSource;
  sourceId?: string;
}

/**
 * Scraper pagination info
 */
export interface ScraperPagination {
  currentPage: number;
  totalPages: number;
  resultsPerPage: number;
  totalResults: number;
  hasNextPage: boolean;
}

/**
 * Scraper result with pagination metadata - returned by scraper classes
 */
export interface ScraperExecutionResult {
  businesses: ScrapedBusiness[];
  pagination: ScraperPagination;
  source: string;
  query: string;
  location: string;
  timestamp: Date;
}

/**
 * Scraper options
 */
export interface ScraperOptions {
  maxPages?: number;
  delayBetweenPagesMs?: number;
  includeDuplicates?: boolean;
}

/**
 * Scraper job state for tracking progress
 */
export interface ScraperJobState {
  query: string;
  location: string;
  currentPage: number;
  totalPages: number;
  businessesCollected: ScrapedBusiness[];
  isComplete: boolean;
  error?: string;
}

/**
 * Alias for ScraperExecutionResult - the return type from scraper classes
 */
export type ScraperResult = ScraperExecutionResult;
