/**
 * Yelp Search API Route Tests
 *
 * Tests for the Yelp search endpoint.
 */

import { NextRequest } from "next/server";
import { GET } from "./route";

// Mock the scraper
jest.mock("@/services/yelp-scraper", () => ({
  createYelpScraper: jest.fn(),
}));

const { createYelpScraper } = require("@/services/yelp-scraper");

describe("GET /api/scraper/yelp/search", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns 400 when query is missing", async () => {
    const request = new NextRequest("http://localhost/api/scraper/yelp/search?location=New+York");

    const response = await GET(request);

    expect(response.status).toBe(400);
    const json = await response.json();
    expect(json.success).toBe(false);
    expect(json.error).toBe("Missing required field: query");
  });

  it("returns 400 when location is missing", async () => {
    const request = new NextRequest("http://localhost/api/scraper/yelp/search?query=restaurants");

    const response = await GET(request);

    expect(response.status).toBe(400);
    const json = await response.json();
    expect(json.success).toBe(false);
    expect(json.error).toBe("Missing required field: location");
  });

  it("returns 400 when both query and location are missing", async () => {
    const request = new NextRequest("http://localhost/api/scraper/yelp/search");

    const response = await GET(request);

    expect(response.status).toBe(400);
    const json = await response.json();
    expect(json.success).toBe(false);
    expect(json.error).toBe("Missing required field: query");
  });

  it("returns 400 when maxPages is out of range", async () => {
    const request = new NextRequest("http://localhost/api/scraper/yelp/search?query=restaurants&location=New+York&maxPages=100");

    const response = await GET(request);

    expect(response.status).toBe(400);
    const json = await response.json();
    expect(json.success).toBe(false);
    expect(json.error).toBe("Invalid maxPages parameter");
  });

  it("returns 400 when delayBetweenPagesMs is out of range", async () => {
    const request = new NextRequest("http://localhost/api/scraper/yelp/search?query=restaurants&location=New+York&delayBetweenPagesMs=20000");

    const response = await GET(request);

    expect(response.status).toBe(400);
    const json = await response.json();
    expect(json.success).toBe(false);
    expect(json.error).toBe("Invalid delayBetweenPagesMs parameter");
  });

  it("returns search results on successful scrape", async () => {
    const mockScraper = {
      scrape: jest.fn().mockResolvedValue({
        businesses: [
          {
            name: "Test Restaurant",
            address: "123 Main St, New York, NY",
            rating: 4.5,
            reviewCount: 150,
            source: "yelp" as const,
          },
        ],
        pagination: {
          currentPage: 1,
          totalPages: 1,
          resultsPerPage: 10,
          totalResults: 1,
          hasNextPage: false,
        },
        source: "yelp" as const,
        query: "restaurants",
        location: "New York",
        timestamp: new Date("2024-01-01T00:00:00Z"),
      }),
      close: jest.fn().mockResolvedValue(undefined),
    };

    (createYelpScraper as jest.Mock).mockReturnValue(mockScraper);

    const request = new NextRequest("http://localhost/api/scraper/yelp/search?query=restaurants&location=New+York");

    const response = await GET(request);

    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.success).toBe(true);
    expect(json.data.source).toBe("yelp");
    expect(json.data.query).toBe("restaurants");
    expect(json.data.location).toBe("New York");
    expect(json.data.businesses.length).toBe(1);
    expect(json.data.businesses[0].name).toBe("Test Restaurant");
    expect(json.data.pagination.totalResults).toBe(1);
  });

  it("uses default pagination parameters when not provided", async () => {
    const mockScraper = {
      scrape: jest.fn().mockResolvedValue({
        businesses: [],
        pagination: {
          currentPage: 1,
          totalPages: 1,
          resultsPerPage: 10,
          totalResults: 0,
          hasNextPage: false,
        },
        source: "yelp" as const,
        query: "restaurants",
        location: "New York",
        timestamp: new Date(),
      }),
      close: jest.fn().mockResolvedValue(undefined),
    };

    (createYelpScraper as jest.Mock).mockReturnValue(mockScraper);

    const request = new NextRequest("http://localhost/api/scraper/yelp/search?query=restaurants&location=New+York");

    await GET(request);

    expect(createYelpScraper).toHaveBeenCalledWith({
      maxPages: 10,
      delayBetweenPagesMs: 1000,
    });
  });

  it("uses custom pagination parameters when provided", async () => {
    const mockScraper = {
      scrape: jest.fn().mockResolvedValue({
        businesses: [],
        pagination: {
          currentPage: 1,
          totalPages: 1,
          resultsPerPage: 10,
          totalResults: 0,
          hasNextPage: false,
        },
        source: "yelp" as const,
        query: "restaurants",
        location: "New York",
        timestamp: new Date(),
      }),
      close: jest.fn().mockResolvedValue(undefined),
    };

    (createYelpScraper as jest.Mock).mockReturnValue(mockScraper);

    const request = new NextRequest("http://localhost/api/scraper/yelp/search?query=restaurants&location=New+York&maxPages=5&delayBetweenPagesMs=2000");

    await GET(request);

    expect(createYelpScraper).toHaveBeenCalledWith({
      maxPages: 5,
      delayBetweenPagesMs: 2000,
    });
  });

  it("returns 500 on scraper error", async () => {
    const mockScraper = {
      scrape: jest.fn().mockRejectedValue(new Error("Network timeout")),
      close: jest.fn().mockResolvedValue(undefined),
    };

    (createYelpScraper as jest.Mock).mockReturnValue(mockScraper);

    const request = new NextRequest("http://localhost/api/scraper/yelp/search?query=restaurants&location=New+York");

    const response = await GET(request);

    expect(response.status).toBe(500);
    const json = await response.json();
    expect(json.success).toBe(false);
    expect(json.error).toBe("Internal server error");
  });

  it("ensures scraper is closed even when scrape fails", async () => {
    const mockScraper = {
      scrape: jest.fn().mockRejectedValue(new Error("Network timeout")),
      close: jest.fn().mockResolvedValue(undefined),
    };

    (createYelpScraper as jest.Mock).mockReturnValue(mockScraper);

    const request = new NextRequest("http://localhost/api/scraper/yelp/search?query=restaurants&location=New+York");

    await GET(request);

    expect(mockScraper.close).toHaveBeenCalled();
  });

  it("returns multiple businesses in results", async () => {
    const mockBusinesses = [
      { name: "Restaurant A", address: "123 Main St", rating: 4.5, reviewCount: 100, source: "yelp" as const },
      { name: "Restaurant B", address: "456 Oak Ave", rating: 4.0, reviewCount: 75, source: "yelp" as const },
      { name: "Restaurant C", address: "789 Pine Rd", rating: 3.5, reviewCount: 50, source: "yelp" as const },
    ];

    const mockScraper = {
      scrape: jest.fn().mockResolvedValue({
        businesses: mockBusinesses,
        pagination: {
          currentPage: 1,
          totalPages: 1,
          resultsPerPage: 10,
          totalResults: 3,
          hasNextPage: false,
        },
        source: "yelp" as const,
        query: "restaurants",
        location: "New York",
        timestamp: new Date("2024-01-01T00:00:00Z"),
      }),
      close: jest.fn().mockResolvedValue(undefined),
    };

    (createYelpScraper as jest.Mock).mockReturnValue(mockScraper);

    const request = new NextRequest("http://localhost/api/scraper/yelp/search?query=restaurants&location=New+York");

    const response = await GET(request);

    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.data.businesses.length).toBe(3);
    expect(json.data.pagination.totalResults).toBe(3);
  });
});
