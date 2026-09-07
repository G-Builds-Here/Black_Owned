/**
 * ScraperResult Type Tests
 *
 * QA tests validating the ScraperResult type structure for raw scraped data
 * before normalization, with source-specific fields for GoogleMaps, Yelp, Facebook.
 */

import {
  type ScraperResult,
  type GoogleMapsRawData,
  type YelpRawData,
  type FacebookRawData,
  type RawScraperData,
  ScraperSource,
} from "./scraper-result";

describe("ScraperResult Types", () => {
  describe("ScraperSource Enum", () => {
    it("should have all required source values", () => {
      expect(ScraperSource.GOOGLE_MAPS).toBe("google-maps");
      expect(ScraperSource.YELP).toBe("yelp");
      expect(ScraperSource.FACEBOOK).toBe("facebook");
    });
  });

  describe("GoogleMapsRawData", () => {
    const createValidGoogleMapsData = (overrides?: Partial<GoogleMapsRawData>): GoogleMapsRawData => ({
      placeId: "ChIJN1t_tDeuEmsRUsoyG83frY4",
      name: "Googleplex",
      formattedAddress: "1600 Amphitheatre Pkwy, Mountain View, CA, USA",
      latitude: 37.4224764,
      longitude: -122.0842499,
      phoneNumber: "+1 650-253-0000",
      website: "https://www.google.com",
      rating: 4.5,
      userRatingsTotal: 12500,
      priceLevel: 0,
      businessStatus: "OPERATIONAL",
      openingHours: {
        openNow: true,
        weekdayText: ["Monday: Open 24 hours"],
      },
      types: ["point_of_interest", "establishment"],
      formattedPhoneNumber: "(650) 253-0000",
      internationalPhoneNumber: "+1 650-253-0000",
      geometry: {
        location: {
          lat: 37.4224764,
          lng: -122.0842499,
        },
        viewport: {},
      },
      url: "https://maps.google.com",
      utcOffset: -480,
      vicinity: "Mountain View, CA",
      ...overrides,
    });

    it("should accept a complete GoogleMapsRawData object", () => {
      const data: GoogleMapsRawData = createValidGoogleMapsData();
      expect(data.placeId).toBeDefined();
      expect(data.name).toBe("Googleplex");
      expect(data.latitude).toBe(37.4224764);
      expect(data.longitude).toBe(-122.0842499);
    });

    it("should allow optional fields to be undefined", () => {
      const data: GoogleMapsRawData = createValidGoogleMapsData({
        phoneNumber: undefined,
        website: undefined,
        rating: undefined,
      });
      expect(data.phoneNumber).toBeUndefined();
      expect(data.website).toBeUndefined();
      expect(data.rating).toBeUndefined();
    });

    it("should include nested openingHours structure", () => {
      const data: GoogleMapsRawData = createValidGoogleMapsData();
      expect(data.openingHours).toBeDefined();
      expect(data.openingHours?.openNow).toBe(true);
      expect(Array.isArray(data.openingHours?.weekdayText)).toBe(true);
    });

    it("should include nested geometry structure", () => {
      const data: GoogleMapsRawData = createValidGoogleMapsData();
      expect(data.geometry).toBeDefined();
      expect(data.geometry?.location.lat).toBe(37.4224764);
      expect(data.geometry?.location.lng).toBe(-122.0842499);
    });
  });

  describe("YelpRawData", () => {
    const createValidYelpData = (overrides?: Partial<YelpRawData>): YelpRawData => ({
      id: "the-fork-toronto",
      alias: "the-fork-toronto",
      name: "The Fork",
      image_url: "https://s3-media2.fl.yelpcdn.com/bphoto/example.jpg",
      is_claimed: true,
      is_closed: false,
      url: "https://www.yelp.com/biz/the-fork-toronto",
      phone: "+14165551234",
      display_phone: "(416) 555-1234",
      review_count: 850,
      categories: [
        { alias: "restaurants", title: "Restaurants" },
        { alias: "italian", title: "Italian" },
      ],
      rating: 4.0,
      location: {
        address1: "123 King St W",
        address2: "Suite 100",
        address3: undefined,
        city: "Toronto",
        state: "ON",
        zip_code: "M5H 1A1",
        country: "CA",
        display_address: ["123 King St W", "Suite 100", "Toronto, ON M5H 1A1"],
      },
      coordinates: {
        latitude: 43.651070,
        longitude: -79.383932,
      },
      photos: ["https://s3-media1.fl.yelpcdn.com/bphoto/example1.jpg"],
      price: "$$",
      hours: [
        {
          open: [
            { is_overnight: false, start: "0900", end: "1700", day: 0 },
          ],
          hours_type: "REGULAR",
          is_open_now: true,
        },
      ],
      transactions: ["pickup", "delivery"],
      messaging: {
        url: "https://www.yelp.com/raq/the-fork-toronto",
        use_case_text: "Message the Business",
      },
      ...overrides,
    });

    it("should accept a complete YelpRawData object", () => {
      const data: YelpRawData = createValidYelpData();
      expect(data.id).toBe("the-fork-toronto");
      expect(data.name).toBe("The Fork");
      expect(data.rating).toBe(4.0);
      expect(data.review_count).toBe(850);
    });

    it("should include categories as array", () => {
      const data: YelpRawData = createValidYelpData();
      expect(Array.isArray(data.categories)).toBe(true);
      expect(data.categories.length).toBe(2);
      expect(data.categories[0].alias).toBe("restaurants");
      expect(data.categories[0].title).toBe("Restaurants");
    });

    it("should include nested location structure", () => {
      const data: YelpRawData = createValidYelpData();
      expect(data.location.address1).toBe("123 King St W");
      expect(data.location.city).toBe("Toronto");
      expect(data.location.country).toBe("CA");
      expect(Array.isArray(data.location.display_address)).toBe(true);
    });

    it("should include nested coordinates structure", () => {
      const data: YelpRawData = createValidYelpData();
      expect(data.coordinates.latitude).toBe(43.651070);
      expect(data.coordinates.longitude).toBe(-79.383932);
    });

    it("should allow optional fields to be undefined", () => {
      const data: YelpRawData = {
        id: "test-id",
        alias: "test-alias",
        name: "Test",
        image_url: "https://example.com/img.jpg",
        is_claimed: true,
        is_closed: false,
        url: "https://yelp.com/biz/test",
        phone: "+15551234567",
        display_phone: "(555) 123-4567",
        review_count: 100,
        categories: [{ alias: "test", title: "Test" }],
        rating: 4.0,
        location: {
          address1: "123 St",
          city: "City",
          state: "ST",
          zip_code: "12345",
          country: "US",
          display_address: ["123 St"],
        },
        coordinates: { latitude: 40.0, longitude: -74.0 },
        photos: [],
        price: "$",
        transactions: [],
        messaging: undefined,
        hours: undefined,
      };
      expect(data.location.address2).toBeUndefined();
      expect(data.location.address3).toBeUndefined();
      expect(data.messaging).toBeUndefined();
    });
  });

  describe("FacebookRawData", () => {
    const createValidFacebookData = (overrides?: Partial<FacebookRawData>): FacebookRawData => ({
      id: "1234567890",
      name: "Example Business Page",
      description: "A great local business",
      link: "https://www.facebook.com/examplebusiness",
      phone: "+1-555-123-4567",
      email: "info@example.com",
      website: "https://www.example.com",
      category: "Local Business",
      location: {
        city: "New York",
        state: "NY",
        country: "United States",
        latitude: 40.7128,
        longitude: -74.0060,
        street: "123 Main St",
        zip: "10001",
      },
      cover: {
        cover_id: "987654321",
        offset_y: 0,
        source: "https://scontent.xx.fbcdn.net/v/example.jpg",
      },
      about: "We are a local business serving the community",
      were_here_count: 1500,
      checkins: 500,
      talking_about_count: 250,
      fan_count: 5000,
      verification_status: "verified",
      ...overrides,
    });

    it("should accept a complete FacebookRawData object", () => {
      const data: FacebookRawData = createValidFacebookData();
      expect(data.id).toBe("1234567890");
      expect(data.name).toBe("Example Business Page");
      expect(data.category).toBe("Local Business");
    });

    it("should allow optional fields to be undefined", () => {
      const data: FacebookRawData = createValidFacebookData({
        description: undefined,
        link: undefined,
        email: undefined,
        about: undefined,
      });
      expect(data.description).toBeUndefined();
      expect(data.link).toBeUndefined();
      expect(data.email).toBeUndefined();
    });

    it("should include nested location structure", () => {
      const data: FacebookRawData = createValidFacebookData();
      expect(data.location).toBeDefined();
      expect(data.location?.city).toBe("New York");
      expect(data.location?.latitude).toBe(40.7128);
      expect(data.location?.longitude).toBe(-74.0060);
    });

    it("should include nested cover structure", () => {
      const data: FacebookRawData = createValidFacebookData();
      expect(data.cover).toBeDefined();
      expect(data.cover?.cover_id).toBe("987654321");
      expect(data.cover?.source).toContain("fbcdn.net");
    });
  });

  describe("RawScraperData Union Type", () => {
    it("should accept GoogleMapsRawData", () => {
      const googleData: RawScraperData = {
        placeId: "ChIJN1t_tDeuEmsRUsoyG83frY4",
        name: "Test",
        formattedAddress: "123 Main St",
        latitude: 40.7128,
        longitude: -74.0060,
      };
      expect((googleData as GoogleMapsRawData).placeId).toBe("ChIJN1t_tDeuEmsRUsoyG83frY4");
    });

    it("should accept YelpRawData", () => {
      const yelpData: RawScraperData = {
        id: "test-yelp-id",
        alias: "test-alias",
        name: "Test Business",
        image_url: "https://example.com/image.jpg",
        is_claimed: true,
        is_closed: false,
        url: "https://yelp.com/biz/test",
        phone: "+15551234567",
        display_phone: "(555) 123-4567",
        review_count: 100,
        categories: [{ alias: "test", title: "Test" }],
        rating: 4.0,
        location: {
          address1: "123 Main St",
          city: "Test City",
          state: "TS",
          zip_code: "12345",
          country: "US",
          display_address: ["123 Main St"],
        },
        coordinates: { latitude: 40.7128, longitude: -74.0060 },
        photos: [],
        price: "$$",
      };
      expect((yelpData as YelpRawData).id).toBe("test-yelp-id");
    });

    it("should accept FacebookRawData", () => {
      const fbData: RawScraperData = {
        id: "test-fb-id",
        name: "Test Facebook Business",
      };
      expect((fbData as FacebookRawData).id).toBe("test-fb-id");
    });
  });

  describe("ScraperResult", () => {
    const createValidScraperResult = (
      source: ScraperSource,
      rawData: RawScraperData,
      overrides?: Partial<ScraperResult>
    ): ScraperResult => ({
      source,
      rawData,
      scrapedAt: new Date("2026-08-03T10:00:00Z"),
      jobId: "job-123",
      ...overrides,
    });

    it("should wrap GoogleMapsRawData with source metadata", () => {
      const googleData: GoogleMapsRawData = {
        placeId: "ChIJN1t_tDeuEmsRUsoyG83frY4",
        name: "Googleplex",
        formattedAddress: "1600 Amphitheatre Pkwy",
        latitude: 37.4224764,
        longitude: -122.0842499,
      };

      const result: ScraperResult = createValidScraperResult(ScraperSource.GOOGLE_MAPS, googleData);

      expect(result.source).toBe(ScraperSource.GOOGLE_MAPS);
      expect((result.rawData as GoogleMapsRawData).placeId).toBe("ChIJN1t_tDeuEmsRUsoyG83frY4");
      expect(result.scrapedAt).toEqual(new Date("2026-08-03T10:00:00Z"));
      expect(result.jobId).toBe("job-123");
    });

    it("should wrap YelpRawData with source metadata", () => {
      const yelpData: YelpRawData = {
        id: "test-yelp",
        alias: "test-yelp",
        name: "Yelp Business",
        image_url: "https://example.com/img.jpg",
        is_claimed: true,
        is_closed: false,
        url: "https://yelp.com/biz/test",
        phone: "+15551234567",
        display_phone: "(555) 123-4567",
        review_count: 50,
        categories: [{ alias: "test", title: "Test" }],
        rating: 3.5,
        location: {
          address1: "123 St",
          city: "City",
          state: "ST",
          zip_code: "12345",
          country: "US",
          display_address: ["123 St"],
        },
        coordinates: { latitude: 40.0, longitude: -74.0 },
        photos: [],
        price: "$",
        transactions: [],
      };

      const result: ScraperResult = createValidScraperResult(ScraperSource.YELP, yelpData);

      expect(result.source).toBe(ScraperSource.YELP);
      expect((result.rawData as YelpRawData).id).toBe("test-yelp");
      expect(result.scrapedAt).toEqual(new Date("2026-08-03T10:00:00Z"));
    });

    it("should wrap FacebookRawData with source metadata", () => {
      const fbData: FacebookRawData = {
        id: "test-fb",
        name: "Facebook Business",
        category: "Business",
      };

      const result: ScraperResult = createValidScraperResult(ScraperSource.FACEBOOK, fbData);

      expect(result.source).toBe(ScraperSource.FACEBOOK);
      expect((result.rawData as FacebookRawData).id).toBe("test-fb");
      expect(result.scrapedAt).toEqual(new Date("2026-08-03T10:00:00Z"));
    });

    it("should allow jobId to be optional", () => {
      const googleData: GoogleMapsRawData = {
        placeId: "ChIJN1t_tDeuEmsRUsoyG83frY4",
        name: "Test",
        formattedAddress: "123 Main St",
        latitude: 40.7128,
        longitude: -74.0060,
      };

      const result: ScraperResult = {
        source: ScraperSource.GOOGLE_MAPS,
        rawData: googleData,
        scrapedAt: new Date(),
      };

      expect(result.jobId).toBeUndefined();
    });

    it("should preserve raw data structure without normalization", () => {
      const originalData: GoogleMapsRawData = {
        placeId: "ChIJN1t_tDeuEmsRUsoyG83frY4",
        name: "Original Name",
        formattedAddress: "Original Address",
        latitude: 37.4224764,
        longitude: -122.0842499,
        rating: 4.5,
        userRatingsTotal: 1000,
      };

      const result: ScraperResult = {
        source: ScraperSource.GOOGLE_MAPS,
        rawData: originalData,
        scrapedAt: new Date("2026-08-03T10:00:00Z"),
      };

      // Verify raw data is preserved exactly as scraped
      expect((result.rawData as GoogleMapsRawData).name).toBe("Original Name");
      expect((result.rawData as GoogleMapsRawData).formattedAddress).toBe("Original Address");
      expect((result.rawData as GoogleMapsRawData).rating).toBe(4.5);
      expect((result.rawData as GoogleMapsRawData).userRatingsTotal).toBe(1000);
    });
  });

  describe("Type Discrimination", () => {
    it("should allow type narrowing based on source", () => {
      const results: ScraperResult[] = [
        {
          source: ScraperSource.GOOGLE_MAPS,
          rawData: {
            placeId: "ChIJN1t_tDeuEmsRUsoyG83frY4",
            name: "Google",
            formattedAddress: "1600 Amphitheatre",
            latitude: 37.42,
            longitude: -122.08,
          },
          scrapedAt: new Date(),
        },
        {
          source: ScraperSource.YELP,
          rawData: {
            id: "yelp-id",
            alias: "yelp-alias",
            name: "Yelp",
            image_url: "https://example.com/img.jpg",
            is_claimed: true,
            is_closed: false,
            url: "https://yelp.com",
            phone: "+15551234567",
            display_phone: "(555) 123-4567",
            review_count: 100,
            categories: [{ alias: "test", title: "Test" }],
            rating: 4.0,
            location: {
              address1: "123 St",
              city: "City",
              state: "ST",
              zip_code: "12345",
              country: "US",
              display_address: ["123 St"],
            },
            coordinates: { latitude: 40.0, longitude: -74.0 },
            photos: [],
            price: "$",
          },
          scrapedAt: new Date(),
        },
      ];

      // Type narrowing should work
      const googleResults = results.filter((r) => r.source === ScraperSource.GOOGLE_MAPS);
      expect(googleResults.length).toBe(1);
      expect((googleResults[0].rawData as GoogleMapsRawData).placeId).toBe("ChIJN1t_tDeuEmsRUsoyG83frY4");

      const yelpResults = results.filter((r) => r.source === ScraperSource.YELP);
      expect(yelpResults.length).toBe(1);
      expect((yelpResults[0].rawData as YelpRawData).id).toBe("yelp-id");
    });
  });
});
