/**
 * Playwright Mock for Scraper Integration Tests
 *
 * This mock provides simulated browser behavior for testing scraper logic
 * without requiring a real browser runtime.
 */

const mockPage = {
  goto: jest.fn().mockResolvedValue({}),
  waitForSelector: jest.fn().mockResolvedValue({}),
  waitForLoadState: jest.fn().mockResolvedValue({}),
  evaluate: jest.fn().mockImplementation((fn) => {
    // Return mock business data based on scraper type
    const fnStr = fn.toString();

    // Facebook scraper mock - includes category and source
    if (fnStr.includes('data-pagelet="PageUnits"')) {
      return [
        {
          name: "Facebook Business Page",
          address: "456 Facebook Ave, Los Angeles, CA",
          category: "Local Business",
          phone: "(555) 123-4567",
          website: "https://example.com",
          source: "facebook",
          sourceId: "facebook-page-123",
        },
      ];
    }

    // Google Maps / Yelp scraper mock
    if (fnStr.includes("resultCardButton") || fnStr.includes("section-result") ||
        fnStr.includes("business-name") || fnStr.includes("css-1c4t2b3")) {
      return [
        {
          name: "Test Business",
          address: "123 Main St, Los Angeles, CA",
          rating: 4.5,
          reviewCount: 150,
        },
      ];
    }

    // Default mock
    return [
      {
        name: "Test Business",
        address: "123 Main St, Los Angeles, CA",
        rating: 4.5,
        reviewCount: 150,
      },
    ];
  }),
  click: jest.fn().mockResolvedValue({}),
  close: jest.fn().mockResolvedValue({}),
};

const mockContext = {
  newPage: jest.fn().mockResolvedValue(mockPage),
  close: jest.fn().mockResolvedValue({}),
};

const mockBrowser = {
  newContext: jest.fn().mockResolvedValue(mockContext),
  close: jest.fn().mockResolvedValue({}),
};

const chromium = {
  launch: jest.fn().mockResolvedValue(mockBrowser),
};

const playwright = {
  chromium,
};

export default playwright;
export { chromium };
