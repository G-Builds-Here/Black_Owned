/**
 * Google Maps Place Details API Route Tests
 *
 * Tests for GET /api/scraper/google-maps/places/[id].
 *
 * NOTE: reconciled to the route's current contract. The old spec targeted a
 * module-level `googleMapsScraper.getPlaceDetails()` singleton; the route now
 * constructs `new GoogleMapsScraper()` and drives a browser context/page
 * (initialize -> context.newPage -> page.evaluate -> close). It also:
 *   - returns `{ success: true, data }` on 200 and `{ success: false, error }`
 *     on 400/500 (the old bare `{ place }` / `{ error }` shapes are gone);
 *   - has no explicit 404 path: a failed fetch surfaces as a 500 carrying the
 *     thrown error's message;
 *   - does not trim a non-blank id before use (only the blank check trims).
 *
 * The scraper class is mocked so no real browser launches. `page.evaluate` is
 * stubbed to return the place data directly (the DOM-extraction callback is
 * not executed).
 */

import { NextRequest } from "next/server";
import { GET } from "./route";

// The page the mocked context hands back. `evaluate` is a shared jest.fn so
// each test can stub the extracted place data (or a rejection) for its case.
const mockEvaluate = jest.fn();
const mockPage = {
  goto: jest.fn(),
  waitForSelector: jest.fn(),
  evaluate: mockEvaluate,
  close: jest.fn(),
};
const mockContext = { newPage: jest.fn() };

jest.mock("@/services/google-maps-scraper", () => ({
  // The route does `new GoogleMapsScraper()`, then accesses the private
  // `initialize()` and `context` members via bracket notation. Provide a
  // constructable mock exposing exactly those.
  GoogleMapsScraper: jest.fn().mockImplementation(function () {
    return {
      initialize: jest.fn().mockResolvedValue(undefined),
      context: mockContext,
      close: jest.fn().mockResolvedValue(undefined),
    };
  }),
}));

const mockPlaceDetails = {
  placeId: "ChIJN1t_tDeuEmsRUsoyG83frY4",
  name: "Test Business",
  address: "123 Test Street, Sydney NSW 2000, Australia",
  phone: "+61 2 1234 5678",
  website: "https://testbusiness.com",
  rating: 4.5,
  reviewCount: 128,
  categories: ["Restaurant"],
  hours: "Open 24 hours",
  priceLevel: "$$",
  status: "open",
  images: ["https://www.google.com/maps/img/1"],
  source: "google-maps",
  scrapedAt: "2026-08-12T10:00:00.000Z",
};

describe("GET /api/scraper/google-maps/places/[id]", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Wire the browser happy path: newPage -> page; goto/evaluate/close resolve.
    mockContext.newPage.mockResolvedValue(mockPage);
    mockPage.goto.mockResolvedValue(undefined);
    mockPage.waitForSelector.mockResolvedValue(undefined);
    mockPage.close.mockResolvedValue(undefined);
  });

  it("returns 400 when place ID is missing", async () => {
    const request = new NextRequest("http://localhost/api/scraper/google-maps/places/");

    const response = await GET(request, { params: { id: "" } });

    expect(response.status).toBe(400);
    const json = await response.json();
    expect(json).toEqual({ success: false, error: "Missing required parameter: id" });
  });

  it("returns 400 when place ID is whitespace only", async () => {
    const request = new NextRequest("http://localhost/api/scraper/google-maps/places/");

    const response = await GET(request, { params: { id: "   " } });

    expect(response.status).toBe(400);
    const json = await response.json();
    expect(json).toEqual({ success: false, error: "Missing required parameter: id" });
  });

  it("returns place details when found", async () => {
    mockEvaluate.mockResolvedValue(mockPlaceDetails);

    const request = new NextRequest("http://localhost/api/scraper/google-maps/places/ChIJN1t_tDeuEmsRUsoyG83frY4");

    const response = await GET(request, { params: { id: "ChIJN1t_tDeuEmsRUsoyG83frY4" } });

    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json).toEqual({ success: true, data: mockPlaceDetails });
  });

  it("returns place details with minimal fields when optional fields are missing", async () => {
    const minimal = {
      placeId: "ChIJN1t_tDeuEmsRUsoyG83frY4",
      name: "Test Business",
      address: "123 Test Street",
      source: "google-maps",
    };
    mockEvaluate.mockResolvedValue(minimal);

    const request = new NextRequest("http://localhost/api/scraper/google-maps/places/ChIJN1t_tDeuEmsRUsoyG83frY4");

    const response = await GET(request, { params: { id: "ChIJN1t_tDeuEmsRUsoyG83frY4" } });

    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json).toEqual({ success: true, data: minimal });
  });

  it("returns 500 with the error message when fetching fails", async () => {
    mockEvaluate.mockRejectedValue(new Error("Browser context not initialized"));

    const request = new NextRequest("http://localhost/api/scraper/google-maps/places/ChIJN1t_tDeuEmsRUsoyG83frY4");

    const response = await GET(request, { params: { id: "ChIJN1t_tDeuEmsRUsoyG83frY4" } });

    expect(response.status).toBe(500);
    const json = await response.json();
    expect(json).toEqual({ success: false, error: "Browser context not initialized" });
  });
});
