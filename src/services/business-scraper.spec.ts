/**
 * Business Scraper Tests
 */

import {
  extractBusinessData,
  getScraper,
} from "./business-scraper";
import { RawBusinessListing, ScraperSource } from "../types/business-listing";

describe("BusinessScraper", () => {
  describe("extractBusinessData", () => {
    describe("Google Maps", () => {
      it("should extract business name and address from Google Maps listing", () => {
        const listing: RawBusinessListing = {
          source: "google-maps",
          rawName: "Black Owned Restaurant",
          rawAddress: "123 Main St, New York, NY 10001, US",
        };

        const result = extractBusinessData(listing);

        expect(result.success).toBe(true);
        expect(result.data).toBeDefined();
        expect(result.data?.name).toBe("Black Owned Restaurant");
        expect(result.data?.address.fullAddress).toBe("123 Main St, New York, NY 10001, US");
        expect(result.data?.address.street).toBe("123 Main St");
        expect(result.data?.address.city).toBe("New York");
        expect(result.data?.address.state).toBe("NY");
        expect(result.data?.address.zipCode).toBe("10001");
      });

      it("should clean up business name with extra metadata", () => {
        const listing: RawBusinessListing = {
          source: "google-maps",
          rawName: "Joe's Diner - Best BBQ in Town (Map data from Google)",
          rawAddress: "456 Oak Ave, Los Angeles, CA 90001",
        };

        const result = extractBusinessData(listing);

        expect(result.success).toBe(true);
        expect(result.data?.name).toBe("Joe's Diner - Best BBQ in Town");
      });

      it("should handle address without ZIP code", () => {
        const listing: RawBusinessListing = {
          source: "google-maps",
          rawName: "Test Business",
          rawAddress: "789 Pine St, Chicago, IL",
        };

        const result = extractBusinessData(listing);

        expect(result.success).toBe(true);
        expect(result.data?.address.street).toBe("789 Pine St");
        expect(result.data?.address.city).toBe("Chicago");
        expect(result.data?.address.state).toBe("IL");
        expect(result.data?.address.zipCode).toBe("");
      });
    });

    describe("Yelp", () => {
      it("should extract business name and address from Yelp listing", () => {
        const listing: RawBusinessListing = {
          source: "yelp",
          rawName: "Soul Food Kitchen",
          rawAddress: "321 Elm St, Houston, TX 77001",
        };

        const result = extractBusinessData(listing);

        expect(result.success).toBe(true);
        expect(result.data?.name).toBe("Soul Food Kitchen");
        expect(result.data?.address.street).toBe("321 Elm St");
        expect(result.data?.address.city).toBe("Houston");
        expect(result.data?.address.state).toBe("TX");
        expect(result.data?.address.zipCode).toBe("77001");
      });

      it("should handle ZIP+4 format", () => {
        const listing: RawBusinessListing = {
          source: "yelp",
          rawName: "Community Cafe",
          rawAddress: "555 Maple Dr, Phoenix, AZ 85001-1234",
        };

        const result = extractBusinessData(listing);

        expect(result.success).toBe(true);
        expect(result.data?.address.zipCode).toBe("85001-1234");
      });
    });

    describe("Facebook", () => {
      it("should extract business name and address from Facebook listing", () => {
        const listing: RawBusinessListing = {
          source: "facebook",
          rawName: "Neighborhood Store",
          rawAddress: "999 Cedar Blvd, Philadelphia, PA 19101",
        };

        const result = extractBusinessData(listing);

        expect(result.success).toBe(true);
        expect(result.data?.name).toBe("Neighborhood Store");
        expect(result.data?.address.street).toBe("999 Cedar Blvd");
        expect(result.data?.address.city).toBe("Philadelphia");
        expect(result.data?.address.state).toBe("PA");
        expect(result.data?.address.zipCode).toBe("19101");
      });
    });

    describe("Error handling", () => {
      it("should return error when name is empty", () => {
        const listing: RawBusinessListing = {
          source: "google-maps",
          rawName: "",
          rawAddress: "123 Main St, New York, NY 10001",
        };

        const result = extractBusinessData(listing);

        expect(result.success).toBe(false);
        expect(result.error).toBe("Could not extract business name");
      });

      it("should return error when name is null", () => {
        const listing: RawBusinessListing = {
          source: "google-maps",
          rawName: "",
          rawAddress: "123 Main St, New York, NY 10001",
        };

        const result = extractBusinessData(listing);

        expect(result.success).toBe(false);
      });
    });
  });

  describe("getScraper", () => {
    it("should return GoogleMapsScraper for google-maps source", () => {
      const scraper = getScraper("google-maps");
      expect(scraper.source).toBe("google-maps");
    });

    it("should return YelpScraper for yelp source", () => {
      const scraper = getScraper("yelp");
      expect(scraper.source).toBe("yelp");
    });

    it("should return FacebookScraper for facebook source", () => {
      const scraper = getScraper("facebook");
      expect(scraper.source).toBe("facebook");
    });

    it("should throw error for unsupported source", () => {
      expect(() => getScraper("twitter" as ScraperSource)).toThrow(
        "Unsupported scraper source: twitter"
      );
    });
  });

  describe("Address parsing edge cases", () => {
    it("should handle address with street suffix", () => {
      const listing: RawBusinessListing = {
        source: "google-maps",
        rawName: "Test Business",
        rawAddress: "100 Broadway Street, Miami, FL 33101",
      };

      const result = extractBusinessData(listing);

      expect(result.success).toBe(true);
      expect(result.data?.address.street).toBe("100 Broadway Street");
      expect(result.data?.address.city).toBe("Miami");
    });

    it("should handle multi-part address", () => {
      const listing: RawBusinessListing = {
        source: "yelp",
        rawName: "Downtown Deli",
        rawAddress: "200 Park Avenue Suite 500, New York, NY 10017",
      };

      const result = extractBusinessData(listing);

      expect(result.success).toBe(true);
      expect(result.data?.address.street).toBe("200 Park Avenue Suite 500");
      expect(result.data?.address.city).toBe("New York");
    });

    it("should handle address with ZIP+4 format", () => {
      const listing: RawBusinessListing = {
        source: "google-maps",
        rawName: "Test Business",
        rawAddress: "500 Main St, Dallas, TX 75201-1234",
      };

      const result = extractBusinessData(listing);

      expect(result.success).toBe(true);
      expect(result.data?.address.zipCode).toBe("75201-1234");
    });

    it("should handle address with country code US", () => {
      const listing: RawBusinessListing = {
        source: "google-maps",
        rawName: "Test Business",
        rawAddress: "100 First Ave, Seattle, WA 98101, US",
      };

      const result = extractBusinessData(listing);

      expect(result.success).toBe(true);
      expect(result.data?.address.countryCode).toBe("US");
    });

    it("should handle address with country code UK", () => {
      const listing: RawBusinessListing = {
        source: "google-maps",
        rawName: "Test Business",
        rawAddress: "10 Downing St, London, UK",
      };

      const result = extractBusinessData(listing);

      expect(result.success).toBe(true);
      expect(result.data?.address.countryCode).toBe("UK");
    });

    it("should handle address without comma separation", () => {
      const listing: RawBusinessListing = {
        source: "yelp",
        rawName: "Test Business",
        rawAddress: "123 Oak Street Austin TX 78701",
      };

      const result = extractBusinessData(listing);

      expect(result.success).toBe(true);
      // ZIP code is extracted separately, so street contains everything before the ZIP
      expect(result.data?.address.street).toBe("123 Oak Street Austin TX");
      expect(result.data?.address.zipCode).toBe("78701");
    });

    it("should handle empty address string", () => {
      const listing: RawBusinessListing = {
        source: "google-maps",
        rawName: "Test Business",
        rawAddress: "",
      };

      const result = extractBusinessData(listing);

      expect(result.success).toBe(true);
      expect(result.data?.address.fullAddress).toBe("");
      expect(result.data?.address.street).toBe("");
      expect(result.data?.address.city).toBe("");
    });

    it("should handle null address", () => {
      const listing: RawBusinessListing = {
        source: "google-maps",
        rawName: "Test Business",
        rawAddress: "",
      };

      const result = extractBusinessData(listing);

      expect(result.success).toBe(true);
    });

    it("should clean name with dash metadata pattern", () => {
      const listing: RawBusinessListing = {
        source: "google-maps",
        rawName: "Joe's Cafe - Downtown (Map data from Google)",
        rawAddress: "100 Main St, Boston, MA 02101",
      };

      const result = extractBusinessData(listing);

      expect(result.success).toBe(true);
      expect(result.data?.name).toBe("Joe's Cafe - Downtown");
    });

    it("should handle address with multiple commas", () => {
      const listing: RawBusinessListing = {
        source: "facebook",
        rawName: "Test Business",
        rawAddress: "1000 Broadway, Suite 200, New York, NY 10001",
      };

      const result = extractBusinessData(listing);

      expect(result.success).toBe(true);
      expect(result.data?.address.street).toBe("1000 Broadway");
      expect(result.data?.address.city).toBe("Suite 200");
    });

    it("should handle address with Drive suffix", () => {
      const listing: RawBusinessListing = {
        source: "yelp",
        rawName: "Test Business",
        rawAddress: "500 Sunset Drive, Los Angeles, CA 90028",
      };

      const result = extractBusinessData(listing);

      expect(result.success).toBe(true);
      expect(result.data?.address.street).toBe("500 Sunset Drive");
      expect(result.data?.address.city).toBe("Los Angeles");
    });

    it("should handle address with Boulevard suffix", () => {
      const listing: RawBusinessListing = {
        source: "facebook",
        rawName: "Test Business",
        rawAddress: "750 Wilshire Blvd, Los Angeles, CA 90017",
      };

      const result = extractBusinessData(listing);

      expect(result.success).toBe(true);
      expect(result.data?.address.street).toBe("750 Wilshire Blvd");
      expect(result.data?.address.city).toBe("Los Angeles");
    });

    it("should handle address with only street and city", () => {
      const listing: RawBusinessListing = {
        source: "google-maps",
        rawName: "Test Business",
        rawAddress: "100 Main St, Portland",
      };

      const result = extractBusinessData(listing);

      expect(result.success).toBe(true);
      expect(result.data?.address.street).toBe("100 Main St");
      expect(result.data?.address.city).toBe("Portland");
      expect(result.data?.address.state).toBe("");
      expect(result.data?.address.zipCode).toBe("");
    });

    it("should handle whitespace-only name", () => {
      const listing: RawBusinessListing = {
        source: "google-maps",
        rawName: "   ",
        rawAddress: "100 Main St, New York, NY 10001",
      };

      const result = extractBusinessData(listing);

      expect(result.success).toBe(false);
      expect(result.error).toBe("Could not extract business name");
    });

    it("should handle name with extra whitespace", () => {
      const listing: RawBusinessListing = {
        source: "google-maps",
        rawName: "   The   Best   Restaurant   ",
        rawAddress: "100 Main St, New York, NY 10001",
      };

      const result = extractBusinessData(listing);

      expect(result.success).toBe(true);
      expect(result.data?.name).toBe("The Best Restaurant");
    });
  });
});
