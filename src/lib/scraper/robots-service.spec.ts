/**
 * Robots.txt Service Tests
 */

import {
  getBaseUrl,
  fetchRobotsTxt,
  isPathAllowed,
  checkUrlAllowed,
  clearRobotsCache,
} from "./robots-service";
import Robots from "robots-parser";

describe("Robots Service", () => {
  beforeEach(() => {
    clearRobotsCache();
    jest.clearAllMocks();
  });

  describe("getBaseUrl", () => {
    it("should extract base URL from full URL", () => {
      expect(getBaseUrl("https://www.example.com/path/to/page")).toBe(
        "https://www.example.com"
      );
    });

    it("should handle URLs with port", () => {
      expect(getBaseUrl("http://localhost:3000/api/test")).toBe(
        "http://localhost:3000"
      );
    });

    it("should return empty string for invalid URL", () => {
      expect(getBaseUrl("not-a-valid-url")).toBe("");
    });
  });

  describe("isPathAllowed", () => {
    it("should return true when no robots.txt exists", () => {
      expect(isPathAllowed(null, "/any/path")).toBe(true);
    });

    it("should allow path when robots.txt allows it", () => {
      const baseUrl = "https://example.com";
      const robotsTxt = "User-agent: *\nDisallow: /private/\n";
      const robots = Robots(baseUrl, robotsTxt);

      expect(isPathAllowed(robots, "/public/page")).toBe(true);
    });

    it("should disallow path when robots.txt disallows it", () => {
      const baseUrl = "https://example.com";
      const robotsTxt = "User-agent: *\nDisallow: /private/\n";
      const robots = Robots(baseUrl, robotsTxt);

      expect(isPathAllowed(robots, "/private/secret")).toBe(false);
    });

    it("should respect specific user-agent rules", () => {
      const baseUrl = "https://example.com";
      const robotsTxt =
        "User-agent: BadBot\nDisallow: /\nUser-agent: *\nAllow: /\n";
      const robots = Robots(baseUrl, robotsTxt);

      expect(isPathAllowed(robots, "/public", "BadBot")).toBe(false);
      expect(isPathAllowed(robots, "/public", "*")).toBe(true);
    });
  });

  describe("fetchRobotsTxt", () => {
    it("should return robots when fetched successfully", async () => {
      const mockRobotsTxt = "User-agent: *\nDisallow: /admin/\n";

      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        text: jest.fn().mockResolvedValue(mockRobotsTxt),
      });

      const result = await fetchRobotsTxt("https://example.com");

      expect(result).toBeDefined();
      expect(isPathAllowed(result, "/public")).toBe(true);
      expect(isPathAllowed(result, "/admin/")).toBe(false);
      expect(isPathAllowed(result, "/admin/page")).toBe(false);
    });

    it("should return empty robots when robots.txt not found", async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 404,
      });

      const result = await fetchRobotsTxt("https://example.com");

      expect(result).toBeDefined();
      expect(isPathAllowed(result, "/any/path")).toBe(true);
    });

    it("should return empty robots when fetch fails", async () => {
      global.fetch = jest.fn().mockRejectedValue(new Error("Network error"));

      const result = await fetchRobotsTxt("https://example.com");

      expect(result).toBeDefined();
      expect(isPathAllowed(result, "/any/path")).toBe(true);
    });

    it("should cache robots.txt results", async () => {
      const mockRobotsTxt = "User-agent: *\nDisallow: /admin/\n";
      let callCount = 0;

      global.fetch = jest.fn().mockImplementation(() => {
        callCount++;
        return Promise.resolve({
          ok: true,
          text: jest.fn().mockResolvedValue(mockRobotsTxt),
        });
      });

      await fetchRobotsTxt("https://example.com");
      await fetchRobotsTxt("https://example.com");

      expect(callCount).toBe(1);
    });
  });

  describe("checkUrlAllowed", () => {
    it("should return allowed when robots.txt allows the path", async () => {
      const mockRobotsTxt = "User-agent: *\nDisallow: /admin/\n";

      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        text: jest.fn().mockResolvedValue(mockRobotsTxt),
      });

      const result = await checkUrlAllowed(
        "https://example.com/public/page"
      );

      expect(result.allowed).toBe(true);
    });

    it("should return disallowed when robots.txt blocks the path", async () => {
      const mockRobotsTxt = "User-agent: *\nDisallow: /admin/\n";

      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        text: jest.fn().mockResolvedValue(mockRobotsTxt),
      });

      const result = await checkUrlAllowed("https://example.com/admin/secret");

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain("disallowed by robots.txt");
    });

    it("should return disallowed for invalid URL", async () => {
      const result = await checkUrlAllowed("not-a-valid-url");

      expect(result.allowed).toBe(false);
      expect(result.reason).toBe("Invalid URL");
    });

    it("should allow when robots.txt fetch fails", async () => {
      global.fetch = jest.fn().mockRejectedValue(new Error("Network error"));

      const result = await checkUrlAllowed("https://example.com/page");

      expect(result.allowed).toBe(true);
    });
  });
});
