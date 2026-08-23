/**
 * Facebook Scraper Login Tests (LOC-0063-AC5)
 *
 * Tests for authentication and login handling when Facebook gates search
 * results behind a login wall. Mirrors the AC5 contract: credential
 * configuration, login-prompt detection, login execution (email/password +
 * 2FA-aware outcome), and full scrape-with-login integration.
 */

import { FacebookScraper } from "./facebook-scraper";
import { ScraperOptions } from "../types/scraper-result";

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

/**
 * Count how many times scrape() navigated to the Facebook search URL.
 * A successful login causes a second navigation to the same search URL.
 */
function searchGotoCount(): number {
  return mockPage.goto.mock.calls.filter(
    (args) =>
      typeof args[0] === "string" && args[0].includes("q=restaurants")
  ).length;
}

describe("FacebookScraper - Login Functionality (LOC-0063-AC5)", () => {
  let scraper: FacebookScraper;

  beforeEach(() => {
    jest.clearAllMocks();
    scraper = new FacebookScraper();
  });

  afterEach(async () => {
    await scraper.close();
  });

  describe("constructor with credentials", () => {
    it("stores configured credentials", () => {
      const options: ScraperOptions = {
        credentials: { email: "test@example.com", password: "password123" },
      };
      const credScraper = new FacebookScraper(options);
      expect((credScraper as any).credentials).toEqual({
        email: "test@example.com",
        password: "password123",
      });
    });

    it("leaves credentials undefined when not provided", () => {
      const noCredScraper = new FacebookScraper({ maxPages: 3 });
      expect((noCredScraper as any).credentials).toBeUndefined();
    });
  });

  describe("detectLoginPrompt", () => {
    it("returns true when a login prompt is present", async () => {
      mockPage.evaluate.mockResolvedValueOnce(true);
      const result = await (scraper as any).detectLoginPrompt(mockPage as any);
      expect(result).toBe(true);
    });

    it("returns false when no login prompt is detected", async () => {
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
    it("returns false when no credentials are configured", async () => {
      const noCredScraper = new FacebookScraper({ maxPages: 3 });
      const result = await (noCredScraper as any).performLogin(mockPage as any);
      expect(result).toBe(false);
      expect(mockPage.goto).not.toHaveBeenCalled();
    });

    it("navigates to the Facebook login page", async () => {
      const credScraper = new FacebookScraper({
        credentials: { email: "test@example.com", password: "password123" },
      });
      mockPage.waitForSelector.mockResolvedValue(undefined);
      mockPage.waitForNavigation.mockResolvedValue(undefined);

      const result = await (credScraper as any).performLogin(mockPage as any);

      expect(mockPage.goto).toHaveBeenCalledWith(
        "https://www.facebook.com/login",
        expect.objectContaining({ waitUntil: "networkidle", timeout: 30000 })
      );
      expect(result).toBe(true);
    });

    it("waits for and fills the email field with the configured email", async () => {
      const credScraper = new FacebookScraper({
        credentials: { email: "owner@example.com", password: "password123" },
      });
      mockPage.waitForSelector.mockResolvedValue(undefined);
      mockPage.waitForNavigation.mockResolvedValue(undefined);

      await (credScraper as any).performLogin(mockPage as any);

      expect(mockPage.waitForSelector).toHaveBeenCalledWith(
        'input[name="email"]',
        expect.objectContaining({ timeout: 10000 })
      );
      expect(mockPage.fill).toHaveBeenCalledWith(
        'input[name="email"]',
        "owner@example.com"
      );
    });

    it("waits for and fills the password field with the configured password", async () => {
      const credScraper = new FacebookScraper({
        credentials: { email: "test@example.com", password: "mySecretPassword123" },
      });
      mockPage.waitForSelector.mockResolvedValue(undefined);
      mockPage.waitForNavigation.mockResolvedValue(undefined);

      await (credScraper as any).performLogin(mockPage as any);

      expect(mockPage.waitForSelector).toHaveBeenCalledWith(
        'input[name="pass"]',
        expect.objectContaining({ timeout: 10000 })
      );
      expect(mockPage.fill).toHaveBeenCalledWith(
        'input[name="pass"]',
        "mySecretPassword123"
      );
    });

    it("submits the login form", async () => {
      const credScraper = new FacebookScraper({
        credentials: { email: "test@example.com", password: "password123" },
      });
      mockPage.waitForSelector.mockResolvedValue(undefined);
      mockPage.waitForNavigation.mockResolvedValue(undefined);

      await (credScraper as any).performLogin(mockPage as any);

      expect(mockPage.click).toHaveBeenCalledWith(
        'input[type="submit"][value="Log In"]'
      );
    });

    it("returns true when navigation away from the login page completes", async () => {
      const credScraper = new FacebookScraper({
        credentials: { email: "test@example.com", password: "password123" },
      });
      mockPage.waitForSelector.mockResolvedValue(undefined);
      mockPage.waitForNavigation.mockResolvedValue(undefined);

      const result = await (credScraper as any).performLogin(mockPage as any);

      expect(result).toBe(true);
    });

    it("returns false when the login page is still shown after a navigation timeout (2FA or wrong credentials)", async () => {
      const credScraper = new FacebookScraper({
        credentials: { email: "test@example.com", password: "password123" },
      });
      mockPage.waitForSelector.mockResolvedValue(undefined);
      mockPage.waitForNavigation.mockRejectedValueOnce(
        new Error("Navigation timeout")
      );
      // stillOnLogin check: password field still present
      mockPage.evaluate.mockResolvedValueOnce(true);

      const result = await (credScraper as any).performLogin(mockPage as any);

      expect(result).toBe(false);
    });

    it("returns true when the password field disappears despite a navigation timeout", async () => {
      const credScraper = new FacebookScraper({
        credentials: { email: "test@example.com", password: "password123" },
      });
      mockPage.waitForSelector.mockResolvedValue(undefined);
      mockPage.waitForNavigation.mockRejectedValueOnce(
        new Error("Navigation timeout")
      );
      // stillOnLogin check: password field gone
      mockPage.evaluate.mockResolvedValueOnce(false);

      const result = await (credScraper as any).performLogin(mockPage as any);

      expect(result).toBe(true);
    });

    it("returns false when the login flow throws", async () => {
      const credScraper = new FacebookScraper({
        credentials: { email: "test@example.com", password: "password123" },
      });
      mockPage.goto.mockRejectedValueOnce(new Error("Network down"));

      const result = await (credScraper as any).performLogin(mockPage as any);

      expect(result).toBe(false);
    });
  });

  describe("scrape with login integration", () => {
    it("re-navigates to the search URL after a successful login", async () => {
      const credScraper = new FacebookScraper({
        maxPages: 1,
        credentials: { email: "test@example.com", password: "password123" },
      });
      mockPage.goto.mockResolvedValue(undefined);
      mockPage.waitForSelector.mockResolvedValue(undefined);
      // evaluate #1 = detectLoginPrompt (wall present); #2 = extract (empty).
      mockPage.evaluate.mockResolvedValueOnce(true);
      mockPage.evaluate.mockResolvedValueOnce([]);
      // login navigation succeeds, so no stillOnLogin evaluate is needed.
      mockPage.waitForNavigation.mockResolvedValue(undefined);

      await credScraper.scrape("restaurants", "New York");

      expect(searchGotoCount()).toBe(2);
    });

    it("does not re-navigate when no login prompt is detected", async () => {
      const credScraper = new FacebookScraper({
        maxPages: 1,
        credentials: { email: "test@example.com", password: "password123" },
      });
      mockPage.goto.mockResolvedValue(undefined);
      mockPage.waitForSelector.mockResolvedValue(undefined);
      mockPage.evaluate.mockResolvedValueOnce(false); // no wall
      mockPage.evaluate.mockResolvedValueOnce([]); // extract

      await credScraper.scrape("restaurants", "New York");

      expect(searchGotoCount()).toBe(1);
      expect(mockPage.fill).not.toHaveBeenCalled();
    });

    it("does not attempt login when credentials are not configured", async () => {
      const noCredScraper = new FacebookScraper({ maxPages: 1 });
      mockPage.goto.mockResolvedValue(undefined);
      mockPage.waitForSelector.mockResolvedValue(undefined);
      mockPage.evaluate.mockResolvedValueOnce(true); // wall present, no creds
      mockPage.evaluate.mockResolvedValueOnce([]); // extract

      await noCredScraper.scrape("restaurants", "New York");

      expect(searchGotoCount()).toBe(1);
      expect(mockPage.fill).not.toHaveBeenCalled();
    });

    it("does not re-navigate when login fails (2FA or wrong credentials)", async () => {
      const credScraper = new FacebookScraper({
        maxPages: 1,
        credentials: { email: "test@example.com", password: "wrong" },
      });
      mockPage.goto.mockResolvedValue(undefined);
      mockPage.waitForSelector.mockResolvedValue(undefined);
      // evaluate sequence: #1 detectLoginPrompt(true), #2 performLogin
      // stillOnLogin check (true => still on login), #3 extract (empty).
      mockPage.evaluate.mockResolvedValueOnce(true);
      mockPage.evaluate.mockResolvedValueOnce(true);
      mockPage.evaluate.mockResolvedValueOnce([]);
      mockPage.waitForNavigation.mockRejectedValueOnce(
        new Error("Navigation timeout")
      );

      await credScraper.scrape("restaurants", "New York");

      expect(searchGotoCount()).toBe(1);
    });
  });
});
