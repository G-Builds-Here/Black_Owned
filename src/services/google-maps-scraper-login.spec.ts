/**
 * Google Maps Scraper Login Tests (LOC-0063-AC5)
 *
 * Tests for authentication and login handling when scraping requires credentials.
 */

import {
  GoogleMapsScraper,
  createGoogleMapsScraper,
} from "./google-maps-scraper";
import { ScraperOptions } from "../types/google-maps-scraper";

// Mock Playwright
const mockPage$ = jest.fn().mockResolvedValue(null);

const mockPage = {
  goto: jest.fn(),
  waitForSelector: jest.fn(),
  evaluate: jest.fn(),
  close: jest.fn(),
  $: mockPage$,
  waitForLoadState: jest.fn(),
  click: jest.fn(),
  fill: jest.fn(),
  waitForNavigation: jest.fn(),
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

describe("GoogleMapsScraper - Login Functionality (LOC-0063-AC5)", () => {
  let scraper: GoogleMapsScraper;

  beforeEach(() => {
    jest.clearAllMocks();
    scraper = createGoogleMapsScraper();
  });

  afterEach(async () => {
    await scraper.close();
  });

  describe("constructor with credentials", () => {
    it("creates scraper with credentials configured", () => {
      const options: ScraperOptions = {
        credentials: {
          email: "test@example.com",
          password: "test-password-123",
        },
      };
      const credScraper = createGoogleMapsScraper(options);
      expect(credScraper).toBeInstanceOf(GoogleMapsScraper);
    });

    it("creates scraper without credentials (optional)", () => {
      const options: ScraperOptions = {
        maxPages: 3,
      };
      const noCredScraper = createGoogleMapsScraper(options);
      expect(noCredScraper).toBeInstanceOf(GoogleMapsScraper);
    });
  });

  describe("detectLoginPrompt", () => {
    it("detects login link with href containing 'login'", async () => {
      mockPage.evaluate.mockResolvedValueOnce(true);

      const result = await (scraper as any).detectLoginPrompt(mockPage as any);

      expect(result).toBe(true);
      expect(mockPage.evaluate).toHaveBeenCalled();
    });

    it("detects login link with href containing 'signin'", async () => {
      mockPage.evaluate.mockResolvedValueOnce(true);

      const result = await (scraper as any).detectLoginPrompt(mockPage as any);

      expect(result).toBe(true);
    });

    it("detects login class selector", async () => {
      mockPage.evaluate.mockResolvedValueOnce(true);

      const result = await (scraper as any).detectLoginPrompt(mockPage as any);

      expect(result).toBe(true);
    });

    it("detects sign-in class selector", async () => {
      mockPage.evaluate.mockResolvedValueOnce(true);

      const result = await (scraper as any).detectLoginPrompt(mockPage as any);

      expect(result).toBe(true);
    });

    it("detects auth class selector", async () => {
      mockPage.evaluate.mockResolvedValueOnce(true);

      const result = await (scraper as any).detectLoginPrompt(mockPage as any);

      expect(result).toBe(true);
    });

    it("detects data-testid login selector", async () => {
      mockPage.evaluate.mockResolvedValueOnce(true);

      const result = await (scraper as any).detectLoginPrompt(mockPage as any);

      expect(result).toBe(true);
    });

    it("detects Sign in button", async () => {
      mockPage.evaluate.mockResolvedValueOnce(true);

      const result = await (scraper as any).detectLoginPrompt(mockPage as any);

      expect(result).toBe(true);
    });

    it("detects Log in button", async () => {
      mockPage.evaluate.mockResolvedValueOnce(true);

      const result = await (scraper as any).detectLoginPrompt(mockPage as any);

      expect(result).toBe(true);
    });

    it("detects Sign In button", async () => {
      mockPage.evaluate.mockResolvedValueOnce(true);

      const result = await (scraper as any).detectLoginPrompt(mockPage as any);

      expect(result).toBe(true);
    });

    it("detects Log In button", async () => {
      mockPage.evaluate.mockResolvedValueOnce(true);

      const result = await (scraper as any).detectLoginPrompt(mockPage as any);

      expect(result).toBe(true);
    });

    it("returns false when no login prompt detected", async () => {
      mockPage.evaluate.mockResolvedValueOnce(false);

      const result = await (scraper as any).detectLoginPrompt(mockPage as any);

      expect(result).toBe(false);
    });

    it("returns false on evaluation error", async () => {
      mockPage.evaluate.mockRejectedValueOnce(new Error("Evaluation failed"));

      const result = await (scraper as any).detectLoginPrompt(mockPage as any);

      expect(result).toBe(false);
    });
  });

  describe("performLogin", () => {
    it("returns false when no credentials configured", async () => {
      const noCredScraper = createGoogleMapsScraper({ maxPages: 3 });

      const result = await (noCredScraper as any).performLogin(mockPage as any);

      expect(result).toBe(false);
      expect(mockPage.goto).not.toHaveBeenCalled();
    });

    it("navigates to Google login page", async () => {
      const credScraper = createGoogleMapsScraper({
        credentials: {
          email: "test@example.com",
          password: "password123",
        },
      });

      mockPage.waitForSelector.mockResolvedValueOnce(undefined); // email input
      mockPage.waitForSelector.mockResolvedValueOnce(undefined); // password input
      mockPage.waitForNavigation.mockRejectedValueOnce(
        new Error("Navigation timeout")
      );
      mockPage.evaluate.mockResolvedValueOnce(false); // not on login page anymore

      const result = await (credScraper as any).performLogin(mockPage as any);

      expect(mockPage.goto).toHaveBeenCalledWith(
        "https://accounts.google.com/signin",
        expect.objectContaining({
          waitUntil: "networkidle",
          timeout: 30000,
        })
      );
      // Returns true on navigation detected
      expect(result).toBe(true);
    });

    it("waits for email input selector", async () => {
      const credScraper = createGoogleMapsScraper({
        credentials: {
          email: "test@example.com",
          password: "password123",
        },
      });

      mockPage.waitForSelector.mockResolvedValueOnce(undefined);
      mockPage.waitForSelector.mockResolvedValueOnce(undefined);
      mockPage.waitForNavigation.mockRejectedValueOnce(
        new Error("Navigation timeout")
      );
      mockPage.evaluate.mockResolvedValueOnce(false);

      await (credScraper as any).performLogin(mockPage as any);

      expect(mockPage.waitForSelector).toHaveBeenCalledWith(
        'input[type="email"]',
        expect.objectContaining({ timeout: 10000 })
      );
    });

    it("fills email field with configured email", async () => {
      const credScraper = createGoogleMapsScraper({
        credentials: {
          email: "user@domain.com",
          password: "secret",
        },
      });

      mockPage.waitForSelector.mockResolvedValueOnce(undefined);
      mockPage.waitForSelector.mockResolvedValueOnce(undefined);
      mockPage.waitForNavigation.mockRejectedValueOnce(
        new Error("Navigation timeout")
      );
      mockPage.evaluate.mockResolvedValueOnce(false);

      await (credScraper as any).performLogin(mockPage as any);

      expect(mockPage.fill).toHaveBeenCalledWith(
        'input[type="email"]',
        "user@domain.com"
      );
    });

    it("clicks Next button after email entry", async () => {
      const credScraper = createGoogleMapsScraper({
        credentials: {
          email: "test@example.com",
          password: "password123",
        },
      });

      mockPage.waitForSelector.mockResolvedValueOnce(undefined);
      mockPage.waitForSelector.mockResolvedValueOnce(undefined);
      mockPage.waitForNavigation.mockRejectedValueOnce(
        new Error("Navigation timeout")
      );
      mockPage.evaluate.mockResolvedValueOnce(false);

      await (credScraper as any).performLogin(mockPage as any);

      expect(mockPage.click).toHaveBeenCalledWith(
        expect.stringContaining("Next")
      );
    });

    it("waits for password input selector", async () => {
      const credScraper = createGoogleMapsScraper({
        credentials: {
          email: "test@example.com",
          password: "password123",
        },
      });

      mockPage.waitForSelector.mockResolvedValueOnce(undefined);
      mockPage.waitForSelector.mockResolvedValueOnce(undefined);
      mockPage.waitForNavigation.mockRejectedValueOnce(
        new Error("Navigation timeout")
      );
      mockPage.evaluate.mockResolvedValueOnce(false);

      await (credScraper as any).performLogin(mockPage as any);

      expect(mockPage.waitForSelector).toHaveBeenCalledWith(
        'input[type="password"]',
        expect.objectContaining({ timeout: 10000 })
      );
    });

    it("fills password field with configured password", async () => {
      const credScraper = createGoogleMapsScraper({
        credentials: {
          email: "test@example.com",
          password: "mySecretPassword123",
        },
      });

      mockPage.waitForSelector.mockResolvedValueOnce(undefined);
      mockPage.waitForSelector.mockResolvedValueOnce(undefined);
      mockPage.waitForNavigation.mockRejectedValueOnce(
        new Error("Navigation timeout")
      );
      mockPage.evaluate.mockResolvedValueOnce(false);

      await (credScraper as any).performLogin(mockPage as any);

      expect(mockPage.fill).toHaveBeenCalledWith(
        'input[type="password"]',
        "mySecretPassword123"
      );
    });

    it("returns true on successful navigation after login", async () => {
      const credScraper = createGoogleMapsScraper({
        credentials: {
          email: "test@example.com",
          password: "password123",
        },
      });

      mockPage.waitForSelector.mockResolvedValueOnce(undefined);
      mockPage.waitForSelector.mockResolvedValueOnce(undefined);
      mockPage.waitForNavigation.mockResolvedValueOnce(undefined);

      const result = await (credScraper as any).performLogin(mockPage as any);

      expect(result).toBe(true);
    });

    it("returns true when login page is no longer present", async () => {
      const credScraper = createGoogleMapsScraper({
        credentials: {
          email: "test@example.com",
          password: "password123",
        },
      });

      mockPage.waitForSelector.mockResolvedValueOnce(undefined);
      mockPage.waitForSelector.mockResolvedValueOnce(undefined);
      mockPage.waitForNavigation.mockRejectedValueOnce(
        new Error("Navigation timeout")
      );
      mockPage.evaluate.mockResolvedValueOnce(false); // password field not found

      const result = await (credScraper as any).performLogin(mockPage as any);

      expect(result).toBe(true);
    });

    it("returns false when still on login page after timeout", async () => {
      const credScraper = createGoogleMapsScraper({
        credentials: {
          email: "test@example.com",
          password: "password123",
        },
      });

      mockPage.waitForSelector.mockResolvedValueOnce(undefined);
      mockPage.waitForSelector.mockResolvedValueOnce(undefined);
      mockPage.waitForNavigation.mockRejectedValueOnce(
        new Error("Navigation timeout")
      );
      mockPage.evaluate.mockResolvedValueOnce(true); // still on login page

      const result = await (credScraper as any).performLogin(mockPage as any);

      expect(result).toBe(false);
    });

    it("returns false on login error", async () => {
      const credScraper = createGoogleMapsScraper({
        credentials: {
          email: "test@example.com",
          password: "password123",
        },
      });

      mockPage.goto.mockRejectedValueOnce(
        new Error("Network error during navigation")
      );

      const result = await (credScraper as any).performLogin(mockPage as any);

      expect(result).toBe(false);
    });

    it("handles 2FA requirement gracefully", async () => {
      const credScraper = createGoogleMapsScraper({
        credentials: {
          email: "test@example.com",
          password: "password123",
        },
      });

      mockPage.waitForSelector.mockResolvedValueOnce(undefined);
      mockPage.waitForSelector.mockResolvedValueOnce(undefined);
      mockPage.waitForNavigation.mockRejectedValueOnce(
        new Error("Navigation timeout")
      );
      mockPage.evaluate.mockResolvedValueOnce(true); // still on login page (2FA)

      const result = await (credScraper as any).performLogin(mockPage as any);

      expect(result).toBe(false);
    });
  });

  describe("scrape with login flow", () => {
    it("detects login prompt and attempts login before scraping", async () => {
      const credScraper = createGoogleMapsScraper({
        credentials: {
          email: "test@example.com",
          password: "password123",
        },
      });

      // Mock the scrape flow
      mockPage.waitForLoadState.mockResolvedValueOnce(undefined);
      mockPage.evaluate.mockResolvedValueOnce(true); // login prompt detected
      mockPage.waitForSelector.mockResolvedValueOnce(undefined);
      mockPage.waitForSelector.mockResolvedValueOnce(undefined);
      mockPage.waitForNavigation.mockRejectedValueOnce(
        new Error("Navigation timeout")
      );
      mockPage.evaluate.mockResolvedValueOnce(false); // login successful
      mockPage.evaluate.mockResolvedValueOnce([]); // no businesses on page
      mockPage$.mockResolvedValueOnce(null); // no next page button

      const result = await credScraper.scrape("test query", "test location");

      // Verify login flow was triggered
      expect(mockPage.evaluate).toHaveBeenCalled();
      expect(result.businesses).toEqual([]);
    });

    it("continues scraping after successful login", async () => {
      const credScraper = createGoogleMapsScraper({
        credentials: {
          email: "test@example.com",
          password: "password123",
        },
      });

      mockPage.waitForLoadState.mockResolvedValueOnce(undefined);
      mockPage.evaluate.mockResolvedValueOnce(true); // login prompt detected
      mockPage.waitForSelector.mockResolvedValueOnce(undefined);
      mockPage.waitForSelector.mockResolvedValueOnce(undefined);
      mockPage.waitForNavigation.mockResolvedValueOnce(undefined); // login success
      mockPage.evaluate.mockResolvedValueOnce([
        {
          name: "Test Business",
          address: "123 Test St",
          category: "Test Category",
        },
      ]);
      mockPage$.mockResolvedValueOnce(null);

      const result = await credScraper.scrape("test query", "test location");

      expect(result.businesses.length).toBe(1);
      expect(result.businesses[0].name).toBe("Test Business");
    });

    it("scrapes without login when no prompt detected", async () => {
      const credScraper = createGoogleMapsScraper({
        credentials: {
          email: "test@example.com",
          password: "password123",
        },
      });

      mockPage.waitForLoadState.mockResolvedValueOnce(undefined);
      mockPage.evaluate.mockResolvedValueOnce(false); // no login prompt
      mockPage.evaluate.mockResolvedValueOnce([
        {
          name: "Public Business",
          address: "456 Public Ave",
        },
      ]);
      mockPage$.mockResolvedValueOnce(null);

      const result = await credScraper.scrape("public query", "location");

      expect(mockPage.goto).toHaveBeenCalledTimes(1); // only search navigation
      expect(result.businesses.length).toBe(1);
    });

    it("scrapes without login when no credentials configured", async () => {
      const noCredScraper = createGoogleMapsScraper({ maxPages: 3 });

      mockPage.waitForLoadState.mockResolvedValueOnce(undefined);
      mockPage.evaluate.mockResolvedValueOnce(true); // login prompt detected
      mockPage.evaluate.mockResolvedValueOnce([
        {
          name: "Public Business",
          address: "789 Public Rd",
        },
      ]);
      mockPage$.mockResolvedValueOnce(null);

      const result = await noCredScraper.scrape("query", "location");

      // Should not attempt login without credentials
      expect(mockPage.goto).toHaveBeenCalledTimes(1); // only search navigation
      expect(result.businesses.length).toBe(1);
    });
  });
});
