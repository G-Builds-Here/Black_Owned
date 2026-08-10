/**
 * Scraper Result Types
 *
 * Defines data structures for Google Maps, Yelp, and Facebook scraper results.
 */

/**
 * Source platform for scraped business data
 */
export enum ScraperSource {
  GOOGLE_MAPS = "google_maps",
  YELP = "yelp",
  FACEBOOK = "facebook",
}

/**
 * Google Maps opening hours structure
 */
export interface GoogleMapsOpeningHours {
  openNow: boolean;
  weekdayText: string[];
}

/**
 * Google Maps geometry location
 */
export interface GoogleMapsGeometryLocation {
  lat: number;
  lng: number;
}

/**
 * Google Maps geometry structure
 */
export interface GoogleMapsGeometry {
  location: GoogleMapsGeometryLocation;
  viewport?: unknown;
}

/**
 * Google Maps raw data structure
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
  openingHours?: GoogleMapsOpeningHours;
  types: string[];
  formattedPhoneNumber?: string;
  internationalPhoneNumber?: string;
  geometry?: GoogleMapsGeometry;
  url?: string;
  utcOffset?: number;
  vicinity?: string;
}

/**
 * Yelp category structure
 */
export interface YelpCategory {
  alias: string;
  title: string;
}

/**
 * Yelp location structure
 */
export interface YelpLocation {
  address1: string;
  address2?: string;
  address3?: string;
  city: string;
  state: string;
  zip_code: string;
  country: string;
  display_address: string[];
}

/**
 * Yelp coordinates structure
 */
export interface YelpCoordinates {
  latitude: number;
  longitude: number;
}

/**
 * Yelp hours structure
 */
export interface YelpHours {
  open: Array<{
    is_overnight: boolean;
    start: string;
    end: string;
    day: number;
  }>;
  hours_type: string;
  is_open_now: boolean;
}

/**
 * Yelp messaging structure
 */
export interface YelpMessaging {
  url: string;
  use_case_text: string;
}

/**
 * Yelp raw data structure
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
  categories: YelpCategory[];
  rating: number;
  location: YelpLocation;
  coordinates: YelpCoordinates;
  photos?: string[];
  price?: string;
  hours?: YelpHours[];
  transactions?: string[];
  messaging?: YelpMessaging;
}

/**
 * Facebook location structure
 */
export interface FacebookLocation {
  city?: string;
  state?: string;
  country?: string;
  latitude?: number;
  longitude?: number;
  street?: string;
  zip?: string;
}

/**
 * Facebook cover structure
 */
export interface FacebookCover {
  cover_id: string;
  offset_y?: number;
  source: string;
}

/**
 * Facebook raw data structure
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
  location?: FacebookLocation;
  cover?: FacebookCover;
  about?: string;
  were_here_count?: number;
  checkins?: number;
  talking_about_count?: number;
  fan_count?: number;
  verification_status?: string;
}

/**
 * Union type for raw scraper data from any source
 */
export type RawScraperData = GoogleMapsRawData | YelpRawData | FacebookRawData;

/**
 * Result from a Google Maps, Yelp, or Facebook scrape
 */
export interface ScraperResult {
  source: ScraperSource;
  name: string;
  address: string;
  phone?: string;
  website?: string;
  category?: string;
  rating?: number;
  reviewCount?: number;
  location?: {
    lat: number;
    lng: number;
  };
  rawData: RawScraperData;
  scrapedAt: Date;
}

/**
 * Wrap raw scraped data with source metadata
 */
export function wrapScraperResult(
  source: ScraperSource,
  rawData: RawScraperData,
  scrapedAt: Date = new Date()
): ScraperResult {
  let name: string;
  let address: string;

  if (source === ScraperSource.GOOGLE_MAPS) {
    const googleData = rawData as GoogleMapsRawData;
    name = googleData.name;
    address = googleData.formattedAddress;
  } else if (source === ScraperSource.YELP) {
    const yelpData = rawData as YelpRawData;
    name = yelpData.name;
    address = yelpData.location.display_address.join(", ");
  } else {
    const fbData = rawData as FacebookRawData;
    name = fbData.name;
    address = fbData.location?.street || "";
  }

  return {
    source,
    name,
    address,
    rawData,
    scrapedAt,
  };
}

/**
 * Wrap multiple scraped results with source metadata
 */
export function wrapScraperResults(
  results: Array<{ source: ScraperSource; rawData: RawScraperData }>
): ScraperResult[] {
  return results.map(({ source, rawData }) => wrapScraperResult(source, rawData));
}
