/**
 * QA Test - LOC-0063-AC4: Extract business metadata
 *
 * Validates that the scrapers correctly capture:
 * - Business category
 * - Rating (if available)
 * - Review count (if available)
 */

import { GoogleMapsScraper, createGoogleMapsScraper } from "../services/google-maps-scraper";
import { FacebookScraper } from "../services/facebook-scraper";
import { ScrapedBusiness } from "../types/google-maps-scraper";

// Mock Playwright
const mockPage = {
  goto: jest.fn(),
  waitForSelector: jest.fn(),
  evaluate: jest.fn(),
  close: jest.fn(),
  $: jest.fn(),
  waitForLoadState: jest.fn(),
};

const mockContext = {
  newPage: jest.fn().mockReturnValue(mockPage),
  close: jest.fn(),
};

const mockBrowser = {
  newContext: jest.fn().mockReturnValue(mockContext),
  close: jest.fn(),
};

jest.mock("playwright", () => ({
  chromium: {
    launch: jest.fn().mockResolvedValue(mockBrowser),
  },
}));

describe("LOC-0063-AC4: Extract business metadata", () => {
  let scraper: GoogleMapsScraper;

  beforeEach(() => {
    jest.clearAllMocks();
    scraper = createGoogleMapsScraper();
  });

  afterEach(async () => {
    await scraper.close();
  });

  describe("Business category extraction", () => {
    it("captures business category from Google Maps search results", async () => {
      // Arrange
      const mockBusinesses: ScrapedBusiness[] = [
        {
          name: "Joe's Pizza",
          address: "123 Main St",
          category: "Italian Restaurant",
          source: "google-maps",
          rating: 4.5,
          reviewCount: 120,
        },
      ];

      mockPage.goto.mockResolvedValue(undefined);
      mockPage.waitForSelector.mockResolvedValue(undefined);
      mockPage.evaluate.mockResolvedValue(mockBusinesses);
      mockPage.$.mockResolvedValue(null);
      mockPage.close.mockResolvedValue(undefined);

      // Act
      const result = await scraper.scrape("pizza", "Seattle");

      // Assert
      expect(result.businesses.length).toBe(1);
      expect(result.businesses[0].category).toBe("Italian Restaurant");
    });

    it("captures multiple business categories", async () => {
      // Arrange
      const mockBusinesses: ScrapedBusiness[] = [
        {
          name: "Downtown Coffee Co.",
          address: "100 Pike St",
          category: "Coffee Shop",
          source: "google-maps",
        },
        {
          name: "Waterfront Seafood Grill",
          address: "200 Alaskan Way",
          category: "Seafood Restaurant",
          source: "google-maps",
        },
        {
          name: "Cap Hill Books",
          address: "300 Broadway E",
          category: "Book Store",
          source: "google-maps",
        },
      ];

      mockPage.goto.mockResolvedValue(undefined);
      mockPage.waitForSelector.mockResolvedValue(undefined);
      mockPage.evaluate.mockResolvedValue(mockBusinesses);
      mockPage.$.mockResolvedValue(null);
      mockPage.close.mockResolvedValue(undefined);

      // Act
      const result = await scraper.scrape("businesses", "Seattle");

      // Assert
      expect(result.businesses.length).toBe(3);
      expect(result.businesses.map((b) => b.category)).toEqual(
        expect.arrayContaining(["Coffee Shop", "Seafood Restaurant", "Book Store"])
      );
    });

    it("handles businesses without category (optional field)", async () => {
      // Arrange
      const mockBusinesses: ScrapedBusiness[] = [
        {
          name: "Unknown Business",
          address: "999 Unknown St",
          source: "google-maps",
        },
      ];

      mockPage.goto.mockResolvedValue(undefined);
      mockPage.waitForSelector.mockResolvedValue(undefined);
      mockPage.evaluate.mockResolvedValue(mockBusinesses);
      mockPage.$.mockResolvedValue(null);
      mockPage.close.mockResolvedValue(undefined);

      // Act
      const result = await scraper.scrape("test", "Seattle");

      // Assert
      expect(result.businesses[0].category).toBeUndefined();
    });
  });

  describe("Rating extraction", () => {
    it("captures business rating from Google Maps search results", async () => {
      // Arrange
      const expectedRating = 4.5;
      const mockBusinesses: ScrapedBusiness[] = [
        {
          name: "Test Business",
          address: "123 Test St",
          category: "Test Category",
          rating: expectedRating,
          reviewCount: 100,
          source: "google-maps",
        },
      ];

      mockPage.goto.mockResolvedValue(undefined);
      mockPage.waitForSelector.mockResolvedValue(undefined);
      mockPage.evaluate.mockResolvedValue(mockBusinesses);
      mockPage.$.mockResolvedValue(null);
      mockPage.close.mockResolvedValue(undefined);

      // Act
      const result = await scraper.scrape("test", "Seattle");

      // Assert
      expect(result.businesses[0].rating).toBe(expectedRating);
    });

    it("captures ratings with decimal values", async () => {
      // Arrange
      const mockBusinesses: ScrapedBusiness[] = [
        {
          name: "Business A",
          address: "100 Street A",
          category: "Category A",
          rating: 3.5,
          source: "google-maps",
        },
        {
          name: "Business B",
          address: "200 Street B",
          category: "Category B",
          rating: 4.8,
          source: "google-maps",
        },
        {
          name: "Business C",
          address: "300 Street C",
          category: "Category C",
          rating: 5.0,
          source: "google-maps",
        },
      ];

      mockPage.goto.mockResolvedValue(undefined);
      mockPage.waitForSelector.mockResolvedValue(undefined);
      mockPage.evaluate.mockResolvedValue(mockBusinesses);
      mockPage.$.mockResolvedValue(null);
      mockPage.close.mockResolvedValue(undefined);

      // Act
      const result = await scraper.scrape("businesses", "Seattle");

      // Assert
      expect(result.businesses[0].rating).toBe(3.5);
      expect(result.businesses[1].rating).toBe(4.8);
      expect(result.businesses[2].rating).toBe(5.0);
    });

    it("handles businesses without rating (optional field)", async () => {
      // Arrange
      const mockBusinesses: ScrapedBusiness[] = [
        {
          name: "New Business",
          address: "100 New St",
          category: "New Category",
          source: "google-maps",
        },
      ];

      mockPage.goto.mockResolvedValue(undefined);
      mockPage.waitForSelector.mockResolvedValue(undefined);
      mockPage.evaluate.mockResolvedValue(mockBusinesses);
      mockPage.$.mockResolvedValue(null);
      mockPage.close.mockResolvedValue(undefined);

      // Act
      const result = await scraper.scrape("test", "Seattle");

      // Assert
      expect(result.businesses[0].rating).toBeUndefined();
    });
  });

  describe("Review count extraction", () => {
    it("captures business review count from Google Maps search results", async () => {
      // Arrange
      const expectedReviewCount = 150;
      const mockBusinesses: ScrapedBusiness[] = [
        {
          name: "Test Business",
          address: "123 Test St",
          category: "Test Category",
          rating: 4.0,
          reviewCount: expectedReviewCount,
          source: "google-maps",
        },
      ];

      mockPage.goto.mockResolvedValue(undefined);
      mockPage.waitForSelector.mockResolvedValue(undefined);
      mockPage.evaluate.mockResolvedValue(mockBusinesses);
      mockPage.$.mockResolvedValue(null);
      mockPage.close.mockResolvedValue(undefined);

      // Act
      const result = await scraper.scrape("test", "Seattle");

      // Assert
      expect(result.businesses[0].reviewCount).toBe(expectedReviewCount);
    });

    it("captures various review count values", async () => {
      // Arrange
      const mockBusinesses: ScrapedBusiness[] = [
        {
          name: "Business A",
          address: "100 Street A",
          category: "Category A",
          rating: 4.0,
          reviewCount: 25,
          source: "google-maps",
        },
        {
          name: "Business B",
          address: "200 Street B",
          category: "Category B",
          rating: 4.5,
          reviewCount: 500,
          source: "google-maps",
        },
        {
          name: "Business C",
          address: "300 Street C",
          category: "Category C",
          rating: 3.5,
          reviewCount: 1250,
          source: "google-maps",
        },
      ];

      mockPage.goto.mockResolvedValue(undefined);
      mockPage.waitForSelector.mockResolvedValue(undefined);
      mockPage.evaluate.mockResolvedValue(mockBusinesses);
      mockPage.$.mockResolvedValue(null);
      mockPage.close.mockResolvedValue(undefined);

      // Act
      const result = await scraper.scrape("businesses", "Seattle");

      // Assert
      expect(result.businesses[0].reviewCount).toBe(25);
      expect(result.businesses[1].reviewCount).toBe(500);
      expect(result.businesses[2].reviewCount).toBe(1250);
    });

    it("handles businesses without review count (optional field)", async () => {
      // Arrange
      const mockBusinesses: ScrapedBusiness[] = [
        {
          name: "New Business",
          address: "100 New St",
          category: "New Category",
          source: "google-maps",
        },
      ];

      mockPage.goto.mockResolvedValue(undefined);
      mockPage.waitForSelector.mockResolvedValue(undefined);
      mockPage.evaluate.mockResolvedValue(mockBusinesses);
      mockPage.$.mockResolvedValue(null);
      mockPage.close.mockResolvedValue(undefined);

      // Act
      const result = await scraper.scrape("test", "Seattle");

      // Assert
      expect(result.businesses[0].reviewCount).toBeUndefined();
    });
  });

  describe("Combined metadata validation", () => {
    it("captures all metadata fields together (category, rating, review count)", async () => {
      // Arrange
      const mockBusinesses: ScrapedBusiness[] = [
        {
          name: "Pike Place Market",
          address: "85 Pike St, Seattle, WA 98101",
          category: "Public Market",
          rating: 4.7,
          reviewCount: 15420,
          source: "google-maps",
        },
        {
          name: "Space Needle",
          address: "400 Broad St, Seattle, WA 98109",
          category: "Tourist Attraction",
          rating: 4.6,
          reviewCount: 28350,
          source: "google-maps",
        },
      ];

      mockPage.goto.mockResolvedValue(undefined);
      mockPage.waitForSelector.mockResolvedValue(undefined);
      mockPage.evaluate.mockResolvedValue(mockBusinesses);
      mockPage.$.mockResolvedValue(null);
      mockPage.close.mockResolvedValue(undefined);

      // Act
      const result = await scraper.scrape("landmarks", "Seattle");

      // Assert
      const pikePlace = result.businesses.find((b) => b.name === "Pike Place Market");
      const spaceNeedle = result.businesses.find((b) => b.name === "Space Needle");

      expect(pikePlace).toBeDefined();
      expect(pikePlace?.category).toBe("Public Market");
      expect(pikePlace?.rating).toBe(4.7);
      expect(pikePlace?.reviewCount).toBe(15420);

      expect(spaceNeedle).toBeDefined();
      expect(spaceNeedle?.category).toBe("Tourist Attraction");
      expect(spaceNeedle?.rating).toBe(4.6);
      expect(spaceNeedle?.reviewCount).toBe(28350);
    });

    it("handles mixed metadata availability across businesses", async () => {
      // Arrange
      const mockBusinesses: ScrapedBusiness[] = [
        {
          name: "Full Metadata Business",
          address: "100 Full St",
          category: "Full Category",
          rating: 4.5,
          reviewCount: 100,
          source: "google-maps",
        },
        {
          name: "Category Only Business",
          address: "200 Category St",
          category: "Category Only",
          source: "google-maps",
        },
        {
          name: "Rating Only Business",
          address: "300 Rating St",
          rating: 3.5,
          source: "google-maps",
        },
        {
          name: "No Metadata Business",
          address: "400 None St",
          source: "google-maps",
        },
      ];

      mockPage.goto.mockResolvedValue(undefined);
      mockPage.waitForSelector.mockResolvedValue(undefined);
      mockPage.evaluate.mockResolvedValue(mockBusinesses);
      mockPage.$.mockResolvedValue(null);
      mockPage.close.mockResolvedValue(undefined);

      // Act
      const result = await scraper.scrape("businesses", "Seattle");

      // Assert
      expect(result.businesses[0].category).toBe("Full Category");
      expect(result.businesses[0].rating).toBe(4.5);
      expect(result.businesses[0].reviewCount).toBe(100);

      expect(result.businesses[1].category).toBe("Category Only");
      expect(result.businesses[1].rating).toBeUndefined();
      expect(result.businesses[1].reviewCount).toBeUndefined();

      expect(result.businesses[2].category).toBeUndefined();
      expect(result.businesses[2].rating).toBe(3.5);
      expect(result.businesses[2].reviewCount).toBeUndefined();

      expect(result.businesses[3].category).toBeUndefined();
      expect(result.businesses[3].rating).toBeUndefined();
      expect(result.businesses[3].reviewCount).toBeUndefined();
    });
  });
});
