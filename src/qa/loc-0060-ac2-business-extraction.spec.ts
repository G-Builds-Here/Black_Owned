/**
 * QA Test — LOC-0060-AC2: Extract business name and address
 *
 * Validates that the Google Maps scraper correctly captures:
 * - Business name
 * - Full address (street, city, state, zip)
 */

import { GoogleMapsScraper, createGoogleMapsScraper } from "../services/google-maps-scraper";
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

describe("LOC-0060-AC2: Extract business name and address", () => {
  let scraper: GoogleMapsScraper;

  beforeEach(() => {
    jest.clearAllMocks();
    scraper = createGoogleMapsScraper();
  });

  afterEach(async () => {
    await scraper.close();
  });

  describe("Business name extraction", () => {
    it("captures business name correctly from search results", async () => {
      // Arrange
      const expectedBusinessName = "Joe's Pizza Palace";
      const mockBusinesses: ScrapedBusiness[] = [
        {
          name: expectedBusinessName,
          address: "123 Main St, Seattle, WA 98101",
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
      expect(result.businesses[0].name).toBe(expectedBusinessName);
      expect(result.businesses[0].name).toContain("Joe's");
      expect(result.businesses[0].name).toContain("Pizza Palace");
    });

    it("captures multiple business names without corruption", async () => {
      // Arrange
      const mockBusinesses: ScrapedBusiness[] = [
        { name: "Downtown Coffee Co.", address: "100 Pike St, Seattle, WA 98101", source: "google-maps" },
        { name: "Waterfront Seafood Grill", address: "200 Alaskan Way, Seattle, WA 98104", source: "google-maps" },
        { name: "Cap Hill Books", address: "300 Broadway E, Seattle, WA 98102", source: "google-maps" },
      ];

      mockPage.goto.mockResolvedValue(undefined);
      mockPage.waitForSelector.mockResolvedValue(undefined);
      mockPage.evaluate.mockResolvedValue(mockBusinesses);
      mockPage.$.mockResolvedValue(null);
      mockPage.close.mockResolvedValue(undefined);

      // Act
      const result = await scraper.scrape("restaurants", "Seattle");

      // Assert
      expect(result.businesses.length).toBe(3);
      expect(result.businesses.map((b) => b.name)).toEqual(
        expect.arrayContaining([
          "Downtown Coffee Co.",
          "Waterfront Seafood Grill",
          "Cap Hill Books",
        ])
      );
    });

    it("handles business names with special characters", async () => {
      // Arrange
      const mockBusinesses: ScrapedBusiness[] = [
        {
          name: "McDonald's & Burger King Plaza",
          address: "500 Commerce St, Seattle, WA 98101",
          source: "google-maps",
        },
        {
          name: "Joe & Jill's Diner (Open 24/7)",
          address: "600 Market St, Seattle, WA 98101",
          source: "google-maps",
        },
      ];

      mockPage.goto.mockResolvedValue(undefined);
      mockPage.waitForSelector.mockResolvedValue(undefined);
      mockPage.evaluate.mockResolvedValue(mockBusinesses);
      mockPage.$.mockResolvedValue(null);
      mockPage.close.mockResolvedValue(undefined);

      // Act
      const result = await scraper.scrape("diners", "Seattle");

      // Assert
      expect(result.businesses[0].name).toBe("McDonald's & Burger King Plaza");
      expect(result.businesses[1].name).toBe("Joe & Jill's Diner (Open 24/7)");
    });
  });

  describe("Full address extraction", () => {
    it("captures complete address with street, city, state, and zip", async () => {
      // Arrange
      const expectedAddress = "1234 Pine Street, Seattle, WA 98101";
      const mockBusinesses: ScrapedBusiness[] = [
        {
          name: "Test Business",
          address: expectedAddress,
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
      const address = result.businesses[0].address;
      expect(address).toBeDefined();
      expect(address).toContain("1234 Pine Street"); // Street
      expect(address).toContain("Seattle"); // City
      expect(address).toContain("WA"); // State
      expect(address).toMatch(/\d{5}/); // Zip code
    });

    it("captures addresses with different street formats", async () => {
      // Arrange
      const mockBusinesses: ScrapedBusiness[] = [
        {
          name: "Business A",
          address: "100 N Main St, Portland, OR 97201",
          source: "google-maps",
        },
        {
          name: "Business B",
          address: "2000 S Broadway Ave, Los Angeles, CA 90007",
          source: "google-maps",
        },
        {
          name: "Business C",
          address: "555 NE 5th Avenue, Portland, OR 97232",
          source: "google-maps",
        },
      ];

      mockPage.goto.mockResolvedValue(undefined);
      mockPage.waitForSelector.mockResolvedValue(undefined);
      mockPage.evaluate.mockResolvedValue(mockBusinesses);
      mockPage.$.mockResolvedValue(null);
      mockPage.close.mockResolvedValue(undefined);

      // Act
      const result = await scraper.scrape("businesses", "Portland");

      // Assert
      expect(result.businesses[0].address).toBe("100 N Main St, Portland, OR 97201");
      expect(result.businesses[1].address).toBe("2000 S Broadway Ave, Los Angeles, CA 90007");
      expect(result.businesses[2].address).toBe("555 NE 5th Avenue, Portland, OR 97232");
    });

    it("captures addresses with suite/apartment numbers", async () => {
      // Arrange
      const mockBusinesses: ScrapedBusiness[] = [
        {
          name: "Suite Office Corp",
          address: "1000 Business Blvd, Suite 500, Seattle, WA 98101",
          source: "google-maps",
        },
        {
          name: "Apt Complex LLC",
          address: "200 Residential Way, Apt 12B, Portland, OR 97201",
          source: "google-maps",
        },
      ];

      mockPage.goto.mockResolvedValue(undefined);
      mockPage.waitForSelector.mockResolvedValue(undefined);
      mockPage.evaluate.mockResolvedValue(mockBusinesses);
      mockPage.$.mockResolvedValue(null);
      mockPage.close.mockResolvedValue(undefined);

      // Act
      const result = await scraper.scrape("offices", "Seattle");

      // Assert
      expect(result.businesses[0].address).toContain("Suite 500");
      expect(result.businesses[1].address).toContain("Apt 12B");
    });

    it("handles addresses where some components may be missing", async () => {
      // Arrange
      const mockBusinesses: ScrapedBusiness[] = [
        {
          name: "Minimal Address Business",
          address: "123 Main St", // No city/state/zip
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
      // Address should still be captured even if incomplete
      expect(result.businesses[0].address).toBe("123 Main St");
    });

    it("captures addresses with different state formats", async () => {
      // Arrange
      const mockBusinesses: ScrapedBusiness[] = [
        {
          name: "East Coast Business",
          address: "100 Wall St, New York, NY 10005",
          source: "google-maps",
        },
        {
          name: "South Business",
          address: "200 Peachtree St, Atlanta, GA 30303",
          source: "google-maps",
        },
        {
          name: "Midwest Business",
          address: "300 Michigan Ave, Chicago, IL 60601",
          source: "google-maps",
        },
      ];

      mockPage.goto.mockResolvedValue(undefined);
      mockPage.waitForSelector.mockResolvedValue(undefined);
      mockPage.evaluate.mockResolvedValue(mockBusinesses);
      mockPage.$.mockResolvedValue(null);
      mockPage.close.mockResolvedValue(undefined);

      // Act
      const result = await scraper.scrape("businesses", "Chicago");

      // Assert
      expect(result.businesses[0].address).toContain("NY");
      expect(result.businesses[1].address).toContain("GA");
      expect(result.businesses[2].address).toContain("IL");
    });
  });

  describe("Combined name and address validation", () => {
    it("preserves both name and address together for each business", async () => {
      // Arrange
      const mockBusinesses: ScrapedBusiness[] = [
        {
          name: "Pike Place Market",
          address: "85 Pike St, Seattle, WA 98101",
          source: "google-maps",
          phone: "206-448-8762",
        },
        {
          name: "Space Needle",
          address: "400 Broad St, Seattle, WA 98109",
          source: "google-maps",
          phone: "206-905-2100",
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
      expect(pikePlace?.address).toBe("85 Pike St, Seattle, WA 98101");

      expect(spaceNeedle).toBeDefined();
      expect(spaceNeedle?.address).toBe("400 Broad St, Seattle, WA 98109");
    });

    it("handles large result sets with varied name/address combinations", async () => {
      // Arrange
      const mockBusinesses: ScrapedBusiness[] = Array.from(
        { length: 15 },
        (_, i) => ({
          name: `Business ${i + 1}`,
          address: `${100 + i} Street, Seattle, WA ${98100 + i}`,
          source: "google-maps",
        })
      );

      mockPage.goto.mockResolvedValue(undefined);
      mockPage.waitForSelector.mockResolvedValue(undefined);
      mockPage.evaluate.mockResolvedValue(mockBusinesses);
      mockPage.$.mockResolvedValue(null);
      mockPage.close.mockResolvedValue(undefined);

      // Act
      const result = await scraper.scrape("businesses", "Seattle");

      // Assert
      expect(result.businesses.length).toBe(15);
      result.businesses.forEach((business, index) => {
        expect(business.name).toBe(`Business ${index + 1}`);
        expect(business.address).toContain("Street");
        expect(business.address).toContain("Seattle");
        expect(business.address).toContain("WA");
      });
    });
  });
});
