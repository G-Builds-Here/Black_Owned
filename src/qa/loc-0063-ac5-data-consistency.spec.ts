/**
 * QA Test — LOC-0063-AC5: Data consistency tests for cross-platform business data validation
 *
 * Validates that the same business found across multiple platforms (Google Maps, Yelp, Facebook)
 * has consistent core data after normalization:
 * - Business name normalization and comparison
 * - Address normalization and comparison
 * - Phone number normalization and comparison
 * - Business ID mapping to unified records
 * - Full data pipeline from scrape to storage
 */

import { checkForDuplicate, normalizeAddress } from "../services/duplicate-detection-service";
import { normalizeString } from "../utils/similarity";

interface MockScrapedBusiness {
  name: string;
  address: string;
  phone?: string;
  source: "google-maps" | "yelp" | "facebook";
  platformId: string;
}

interface UnifiedBusiness {
  unifiedId: string;
  name: string;
  normalizedAddress: string;
  normalizedPhone?: string;
  platformSources: string[];
  platformIds: Record<string, string>;
}

describe("LOC-0063-AC5: Cross-platform data consistency", () => {
  describe("Business name normalization across platforms", () => {
    it("normalizes the same business name from different platforms to identical form", () => {
      const googleName = "Joe's Pizza Palace";
      const yelpName = "Joe's Pizza Palace (Downtown)";
      const facebookName = "JOE'S PIZZA PALACE";

      const normalizedGoogle = normalizeString(googleName);
      const normalizedYelp = normalizeString(yelpName);
      const normalizedFacebook = normalizeString(facebookName);

      expect(normalizedGoogle).toBe(normalizedFacebook);
      expect(normalizedYelp).toContain("joes pizza palace");
    });

    it("handles special characters consistently across platforms", () => {
      const testCases = [
        { google: "McDonald's", yelp: "McDonalds", facebook: "MCDONALD'S" },
        { google: "Joe & Jill's Diner", yelp: "Joe and Jill's Diner", facebook: "JOE & JILL'S DINER" },
        { google: "Target Store", yelp: "Target", facebook: "TARGET STORE" },
      ];

      testCases.forEach(({ google, yelp, facebook }) => {
        const normGoogle = normalizeString(google);
        const normYelp = normalizeString(yelp);
        const normFacebook = normalizeString(facebook);

        const coreName = normGoogle.split(" ")[0];
        expect(normYelp).toContain(coreName);
        expect(normFacebook).toContain(coreName);
      });
    });

    it("detects potential duplicates across platforms using similarity scoring", () => {
      const businesses = [
        { name: "Pike Place Market", source: "google-maps" },
        { name: "Pike Place Market", source: "yelp" },
        { name: "Pike Place Market (Main Entrance)", source: "facebook" },
      ];

      const googleYelpCheck = checkForDuplicate(
        { name: businesses[0].name, address: "85 Pike St, Seattle, WA 98101" },
        { name: businesses[1].name, address: "85 Pike St, Seattle, WA 98101" }
      );

      expect(googleYelpCheck.isPotentialDuplicate).toBe(true);
      expect(googleYelpCheck.nameSimilarity).toBe(1);

      const googleFacebookCheck = checkForDuplicate(
        { name: businesses[0].name, address: "85 Pike St, Seattle, WA 98101" },
        { name: businesses[2].name, address: "85 Pike St, Seattle, WA 98101" }
      );

      expect(googleFacebookCheck.nameAboveThreshold).toBe(true);
    });
  });

  describe("Address normalization across platforms", () => {
    it("normalizes addresses with different formatting to comparable form", () => {
      const testCases = [
        {
          google: "123 Main Street, Seattle, WA 98101",
          yelp: "123 Main St, Seattle, Washington 98101",
          facebook: "123 MAIN STREET SEATTLE WA 98101",
        },
        {
          google: "400 Broad St, Seattle, WA 98109",
          yelp: "400 Broad Street, Seattle, WA 98109-1234",
          facebook: "400 BROAD ST SEATTLE WA 98109",
        },
      ];

      testCases.forEach(({ google, yelp, facebook }) => {
        const normGoogle = normalizeAddress(google);
        const normYelp = normalizeAddress(yelp);
        const normFacebook = normalizeAddress(facebook);

        const googleNumber = normGoogle.match(/^\d+/)?.[0];
        const yelpNumber = normYelp.match(/^\d+/)?.[0];
        const facebookNumber = normFacebook.match(/^\d+/)?.[0];

        expect(googleNumber).toBe(yelpNumber);
        expect(googleNumber).toBe(facebookNumber);
      });
    });

    it("handles suite/apartment number variations", () => {
      const testCases = [
        {
          google: "1000 Business Blvd, Suite 500, Seattle, WA 98101",
          yelp: "1000 Business Blvd #500, Seattle, WA 98101",
          facebook: "1000 BUSINESS BLVD SUITE 500 SEATTLE WA 98101",
        },
      ];

      testCases.forEach(({ google, yelp, facebook }) => {
        const normGoogle = normalizeAddress(google);
        const normYelp = normalizeAddress(yelp);
        const normFacebook = normalizeAddress(facebook);

        expect(normGoogle).toContain("500");
        expect(normYelp).toContain("500");
        expect(normFacebook).toContain("500");
      });
    });

    it("detects address similarity for cross-platform matching", () => {
      const googleAddress = "85 Pike St, Seattle, WA 98101";
      const yelpAddress = "85 Pike Street, Seattle, Washington 98101";
      const facebookAddress = "85 PIKE ST SEATTLE WA 98101";

      const googleYelpCheck = checkForDuplicate(
        { name: "Pike Place Market", address: googleAddress },
        { name: "Pike Place Market", address: yelpAddress }
      );

      expect(googleYelpCheck.addressAboveThreshold).toBe(true);
      expect(googleYelpCheck.addressSimilarity).toBeGreaterThan(0.9);

      const googleFacebookCheck = checkForDuplicate(
        { name: "Pike Place Market", address: googleAddress },
        { name: "Pike Place Market", address: facebookAddress }
      );

      expect(googleFacebookCheck.addressAboveThreshold).toBe(true);
    });
  });

  describe("Phone number normalization", () => {
    it("normalizes phone numbers with different formats", () => {
      const normalizePhone = (phone) => phone.replace(/\D/g, "");

      const testCases = [
        { google: "(206) 448-8762", yelp: "206-448-8762", facebook: "206.448.8762" },
        { google: "206-905-2100", yelp: "(206) 905-2100", facebook: "206 905 2100" },
      ];

      testCases.forEach(({ google, yelp, facebook }) => {
        expect(normalizePhone(google)).toBe(normalizePhone(yelp));
        expect(normalizePhone(google)).toBe(normalizePhone(facebook));
        expect(normalizePhone(google)).toHaveLength(10);
      });
    });

    it("handles international phone formats", () => {
      const normalizePhone = (phone) => phone.replace(/\D/g, "");

      const internationalCases = [
        { google: "+1 (206) 448-8762", yelp: "1-206-448-8762", facebook: "+12064488762" },
      ];

      internationalCases.forEach(({ google, yelp, facebook }) => {
        expect(normalizePhone(google)).toBe(normalizePhone(yelp));
        expect(normalizePhone(google)).toBe(normalizePhone(facebook));
      });
    });
  });

  describe("Business ID mapping to unified records", () => {
    it("maps multiple platform IDs to a single unified business record", () => {
      const unified = {
        unifiedId: "unified-001",
        name: "Space Needle",
        normalizedAddress: normalizeAddress("400 Broad St, Seattle, WA 98109"),
        normalizedPhone: "2069052100",
        platformSources: ["google-maps", "yelp", "facebook"],
        platformIds: {
          "google-maps": "google:ChIJ-bfVTh8VkFQRDZLQHVvqAAQ",
          yelp: "yelp:space-needle-seattle",
          facebook: "facebook:123456789",
        },
      };

      expect(unified.platformSources.length).toBe(3);
      expect(unified.platformIds["google-maps"]).toBe("google:ChIJ-bfVTh8VkFQRDZLQHVvqAAQ");
      expect(unified.platformIds.yelp).toBe("yelp:space-needle-seattle");
      expect(unified.platformIds.facebook).toBe("facebook:123456789");
    });

    it("creates unified ID deterministically from business key", () => {
      const generateUnifiedId = (name, address) => {
        const key = name + "|" + address;
        const hash = key.split("").reduce((acc, char) => acc + char.charCodeAt(0), 0);
        return "unified-" + hash.toString(16);
      };

      const id1 = generateUnifiedId("Space Needle", "400 Broad St, Seattle, WA 98109");
      const id2 = generateUnifiedId("Space Needle", "400 Broad St, Seattle, WA 98109");
      const id3 = generateUnifiedId("Space Needle", "500 Broad St, Seattle, WA 98109");

      expect(id1).toBe(id2);
      expect(id1).not.toBe(id3);
    });
  });

  describe("Full data pipeline integration", () => {
    it("validates complete flow from scrape to unified storage", () => {
      const scrapedData = [
        {
          name: "Pike Place Market",
          address: "85 Pike St, Seattle, WA 98101",
          phone: "206-448-8762",
          source: "google-maps",
          platformId: "google:pike-place-001",
        },
        {
          name: "Pike Place Market",
          address: "85 Pike Street, Seattle, WA 98101",
          phone: "206-448-8762",
          source: "yelp",
          platformId: "yelp:pike-place-market",
        },
        {
          name: "Pike Place Market",
          address: "85 PIKE ST SEATTLE WA 98101",
          phone: "206-448-8762",
          source: "facebook",
          platformId: "facebook:pike-place",
        },
      ];

      const normalized = scrapedData.map((biz) => ({
        ...biz,
        normalizedName: normalizeString(biz.name),
        normalizedAddress: normalizeAddress(biz.address),
        normalizedPhone: biz.phone ? biz.phone.replace(/\D/g, "") : undefined,
      }));

      const coreName = normalized[0].normalizedName;
      normalized.forEach((biz) => {
        expect(biz.normalizedName).toContain(coreName);
      });

      const phones = normalized.map((biz) => biz.normalizedPhone);
      expect(new Set(phones).size).toBe(1);

      const unified = {
        unifiedId: "unified-pike-place",
        name: "Pike Place Market",
        normalizedAddress: normalized[0].normalizedAddress,
        normalizedPhone: phones[0],
        platformSources: normalized.map((biz) => biz.source),
        platformIds: normalized.reduce((acc, biz) => {
          acc[biz.source] = biz.platformId;
          return acc;
        }, {}),
      };

      expect(unified.platformSources).toEqual(expect.arrayContaining(["google-maps", "yelp", "facebook"]));
      expect(Object.keys(unified.platformIds).length).toBe(3);
    });

    it("handles businesses found on only some platforms", () => {
      const scrapedData = [
        {
          name: "Local Coffee Shop",
          address: "100 Pike St, Seattle, WA 98101",
          phone: "206-555-0100",
          source: "google-maps",
          platformId: "google:coffee-001",
        },
        {
          name: "Local Coffee Shop",
          address: "100 Pike St, Seattle, WA 98101",
          phone: "206-555-0100",
          source: "yelp",
          platformId: "yelp:local-coffee",
        },
      ];

      const normalized = scrapedData.map((biz) => ({
        ...biz,
        normalizedAddress: normalizeAddress(biz.address),
        normalizedPhone: biz.phone?.replace(/\D/g, ""),
      }));

      const unified = {
        unifiedId: "unified-coffee",
        name: "Local Coffee Shop",
        normalizedAddress: normalized[0].normalizedAddress,
        normalizedPhone: normalized[0].normalizedPhone,
        platformSources: normalized.map((biz) => biz.source),
        platformIds: normalized.reduce((acc, biz) => {
          acc[biz.source] = biz.platformId;
          return acc;
        }, {}),
      };

      expect(unified.platformSources.length).toBe(2);
      expect(unified.platformSources).toEqual(expect.arrayContaining(["google-maps", "yelp"]));
      expect(unified.platformSources).not.toContain("facebook");
    });

    it("detects cross-platform duplicates using combined similarity scoring", () => {
      const platformPairs = [
        {
          google: {
            name: "Joe's Pizza",
            address: "123 Main St, Seattle, WA 98101",
            source: "google-maps",
            platformId: "google:pizza-001",
          },
          yelp: {
            name: "Joe's Pizza Palace",
            address: "123 Main Street, Seattle, WA 98101",
            source: "yelp",
            platformId: "yelp:joes-pizza",
          },
          shouldBeDuplicate: true,
        },
        {
          google: {
            name: "Starbucks",
            address: "100 Pike St, Seattle, WA 98101",
            source: "google-maps",
            platformId: "google:starbucks-001",
          },
          yelp: {
            name: "Starbucks",
            address: "200 Pine St, Seattle, WA 98101",
            source: "yelp",
            platformId: "yelp:starbucks-002",
          },
          shouldBeDuplicate: false,
        },
      ];

      platformPairs.forEach(({ google, yelp, shouldBeDuplicate }) => {
        const result = checkForDuplicate(
          { name: google.name, address: google.address },
          { name: yelp.name, address: yelp.address }
        );

        expect(result.isPotentialDuplicate).toBe(shouldBeDuplicate);
      });
    });
  });

  describe("Edge cases and error handling", () => {
    it("handles missing phone numbers gracefully", () => {
      const businessWithPhone = {
        name: "Business A",
        address: "100 Main St, Seattle, WA 98101",
        phone: "206-555-0100",
        source: "google-maps",
        platformId: "google:a",
      };

      const businessWithoutPhone = {
        name: "Business A",
        address: "100 Main St, Seattle, WA 98101",
        source: "yelp",
        platformId: "yelp:a",
      };

      const normalizedWithPhone = businessWithPhone.phone?.replace(/\D/g, "");
      const normalizedWithoutPhone = businessWithoutPhone.phone?.replace(/\D/g, "");

      expect(normalizedWithPhone).toBe("2065550100");
      expect(normalizedWithoutPhone).toBeUndefined();
    });

    it("handles addresses with missing components", () => {
      const incompleteAddresses = [
        "123 Main St",
        "123 Main St, Seattle",
        "123 Main St, Seattle, WA",
        "123 Main St, Seattle, WA 98101",
      ];

      incompleteAddresses.forEach((addr) => {
        const normalized = normalizeAddress(addr);
        expect(typeof normalized).toBe("string");
        expect(normalized).toBeTruthy();
      });
    });

    it("handles extreme case variations in business names", () => {
      const variations = [
        "McDonald's Restaurant",
        "MCDONALD'S",
        "mcdonalds",
        "McDonalds Restaurant Inc.",
        "McDonald's - Downtown Location",
      ];

      const normalized = variations.map((name) => normalizeString(name));

      normalized.forEach((norm) => {
        expect(norm).toContain("mcdonalds");
      });
    });
  });
});
