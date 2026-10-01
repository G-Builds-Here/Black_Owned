/**
 * ListingQualityScorer Unit Tests — LOC-0098
 *
 * Unit spec for the pure completeness scorer (AC1-AC4). The module is
 * DB-free, clock-free, and randomness-free by contract (blueprint §9
 * fitness postconditions), so these specs need no mocks, no server, and no
 * fixtures beyond plain payload objects — the scorer consumes payload
 * objects only; "adapter performs no database access" is enforced
 * structurally by the module importing nothing.
 */

import {
  scoreQualityListing,
  scorePendingImport,
  PendingImportRecordFields,
  QualityScorePayload,
  QualityScoreResult,
} from "./listing-quality-score";

/** Three well-formed photo URLs; sliced to exercise the photo tiers. */
const PHOTO_URLS = [
  "https://cdn.example.com/bloom-1.jpg",
  "https://cdn.example.com/bloom-2.jpg",
  "https://cdn.example.com/bloom-3.jpg",
];

/** Payload with every completeness signal present and well-formed. */
const COMPLETE_PAYLOAD: QualityScorePayload = {
  name: "Bloom Cafe",
  phone: "+1-555-0100",
  website: "https://bloom.example.com",
  socials: ["https://instagram.com/bloomcafe"],
  photos: [...PHOTO_URLS],
  openingHours: { monday: { open: "08:00", close: "17:00" } },
};

describe("ListingQualityScorer", () => {
  describe("AC1: complete payload scores full marks with a breakdown that sums", () => {
    it("scores a complete payload as the integer 100", () => {
      // Arrange
      const payload = COMPLETE_PAYLOAD;

      // Act
      const result = scoreQualityListing(payload);

      // Assert
      expect(Number.isInteger(result.score)).toBe(true);
      expect(result.score).toBe(100);
    });

    it("reports the fixed per-signal weights in the breakdown", () => {
      // Arrange
      const payload = COMPLETE_PAYLOAD;

      // Act
      const { breakdown } = scoreQualityListing(payload);

      // Assert
      expect(breakdown).toEqual({
        phone: 15,
        website: 20,
        socials: 15,
        photos: 30,
        hours: 20,
      });
    });

    it("has breakdown values that sum exactly to the overall score", () => {
      // Arrange
      const payload = COMPLETE_PAYLOAD;

      // Act
      const { score, breakdown } = scoreQualityListing(payload);

      // Assert
      const sum =
        breakdown.phone +
        breakdown.website +
        breakdown.socials +
        breakdown.photos +
        breakdown.hours;
      expect(sum).toBe(score);
    });

    it("returns the identical score and breakdown when the same payload is scored twice", () => {
      // Arrange
      const payload = COMPLETE_PAYLOAD;

      // Act
      const first = scoreQualityListing(payload);
      const second = scoreQualityListing(payload);

      // Assert — no clock, DB, cache, or randomness may be consulted
      expect(second.score).toBe(first.score);
      expect(second.breakdown).toEqual(first.breakdown);
    });
  });

  describe("AC2: omitting exactly one signal loses exactly that signal's weight", () => {
    it("scores 80 with website contribution 0 when the website is absent", () => {
      // Arrange
      const { website, ...withoutWebsite } = COMPLETE_PAYLOAD;

      // Act
      const result = scoreQualityListing(withoutWebsite);

      // Assert
      expect(result.score).toBe(80);
      expect(result.breakdown.website).toBe(0);
    });

    it("scores 85 when the phone is absent", () => {
      // Arrange
      const { phone, ...withoutPhone } = COMPLETE_PAYLOAD;

      // Act
      expect(scoreQualityListing(withoutPhone).score).toBe(85);
    });

    it("scores 85 when the social URL list is empty", () => {
      // Arrange
      const noSocials: QualityScorePayload = {
        ...COMPLETE_PAYLOAD,
        socials: [],
      };

      // Act
      expect(scoreQualityListing(noSocials).score).toBe(85);
    });

    it("scores 80 when there are no opening hours", () => {
      // Arrange
      const { openingHours, ...withoutHours } = COMPLETE_PAYLOAD;

      // Act
      expect(scoreQualityListing(withoutHours).score).toBe(80);
    });
  });

  describe("AC3: photos score on tiers, not on count", () => {
    const withPhotos = (count: number): QualityScorePayload => ({
      ...COMPLETE_PAYLOAD,
      photos: PHOTO_URLS.slice(0, count),
    });

    it.each([
      { count: 0, photos: 0, score: 70 },
      { count: 1, photos: 15, score: 85 },
      { count: 3, photos: 30, score: 100 },
    ])(
      "scores $count photos as contribution $photos (overall $score)",
      ({ count, photos, score }) => {
        // Arrange
        const payload = withPhotos(count);

        // Act
        const result = scoreQualityListing(payload);

        // Assert
        expect(result.breakdown.photos).toBe(photos);
        expect(result.score).toBe(score);
      }
    );

    it("keeps the photo contribution at the 30-point top tier for 5 photos", () => {
      // Arrange
      const manyPhotos: QualityScorePayload = {
        ...COMPLETE_PAYLOAD,
        photos: [
          ...PHOTO_URLS,
          "https://cdn.example.com/bloom-4.jpg",
          "https://cdn.example.com/bloom-5.jpg",
        ],
      };
      expect(manyPhotos.photos).toHaveLength(5);

      // Act
      const result = scoreQualityListing(manyPhotos);

      // Assert
      expect(result.breakdown.photos).toBe(30);
      expect(result.score).toBe(100);
    });
  });

  describe("AC4: garbage or absent signals contribute 0 and never throw", () => {
    it("counts wrong-typed phone and photos as 0 without throwing, keeping the well-formed signals at full weight", () => {
      // Arrange — third-party scrapers hand us wrong-typed values; the
      // declared payload types describe intent, runtime must not trust them
      const garbage = {
        ...COMPLETE_PAYLOAD,
        phone: 555,
        photos: "many",
      } as unknown as QualityScorePayload;

      // Act
      let result: QualityScoreResult | undefined;
      expect(() => {
        result = scoreQualityListing(garbage);
      }).not.toThrow();

      // Assert
      expect(result?.breakdown.phone).toBe(0);
      expect(result?.breakdown.photos).toBe(0);
      expect(result?.breakdown.website).toBe(20);
      expect(result?.breakdown.socials).toBe(15);
      expect(result?.breakdown.hours).toBe(20);
      expect(result?.score).toBe(55);
    });

    it("scores a pending record whose source data holds only source metadata as 0 with a valid breakdown", () => {
      // Arrange — the adapter receives plain record fields; the caller does
      // the (DB) reading, so no data layer is reachable from here at all
      const record = {
        name: "Sunny Deli",
        sourceData: { source: "yelp", originalId: "yb-0042" },
      };

      // Act
      const result = scorePendingImport(record);

      // Assert
      expect(result.score).toBe(0);
      expect(result.breakdown).toEqual({
        phone: 0,
        website: 0,
        socials: 0,
        photos: 0,
        hours: 0,
      });
    });

    it("scores a pending record with scraped phone and website as 35 (phone 15 + website 20)", () => {
      // Arrange
      const record = {
        name: "Sunny Deli",
        sourceData: {
          source: "yelp",
          originalId: "yb-0042",
          phone: "+1-555-0142",
          website: "https://sunny.example.com",
        },
      };

      // Act
      const result = scorePendingImport(record);

      // Assert
      expect(result.score).toBe(35);
      expect(result.breakdown.phone).toBe(15);
      expect(result.breakdown.website).toBe(20);
    });

    // --- Exception-path rows (Bruce QA): total-function guard states the
    // module introduces but no AC names explicitly; all belong to the
    // AC4 "absent signals contribute 0 and never throw" contract. ---

    it("scores a wholly absent payload as 0 without throwing", () => {
      // Arrange — upstream callers (queue route, LOC-0100) may hand the
      // scorer nothing at all; every signal then reads as absent
      const payloads = [undefined, null, {}] as unknown as QualityScorePayload[];

      // Act
      const results = payloads.map((payload) => scoreQualityListing(payload));

      // Assert
      results.forEach((result) => {
        expect(result.score).toBe(0);
        expect(result.breakdown).toEqual({
          phone: 0,
          website: 0,
          socials: 0,
          photos: 0,
          hours: 0,
        });
      });
    });

    it("scores a nullish pending record or non-object source data as 0 without throwing", () => {
      // Arrange — adapter guards: nullish record, and sourceData that is a
      // raw string instead of the decoded JSONB object
      const records = [
        undefined,
        null,
        { name: "Sunny Deli", sourceData: "yelp-raw-string" },
      ] as unknown as PendingImportRecordFields[];

      // Act
      const results = records.map((record) => scorePendingImport(record));

      // Assert
      results.forEach((result) => {
        expect(result.score).toBe(0);
        expect(result.breakdown.phone).toBe(0);
        expect(result.breakdown.website).toBe(0);
      });
    });

    it("treats a whitespace-only phone as absent", () => {
      // Arrange — the trim guard: a scraped field of spaces is not a phone
      const blankPhone: QualityScorePayload = {
        ...COMPLETE_PAYLOAD,
        phone: "   ",
      };

      // Act
      const result = scoreQualityListing(blankPhone);

      // Assert
      expect(result.breakdown.phone).toBe(0);
      expect(result.score).toBe(85);
    });

    it("tiers photos on well-formed entries only", () => {
      // Arrange — one real URL plus garbage entries in the list
      const mixedPhotos = {
        ...COMPLETE_PAYLOAD,
        photos: ["https://cdn.example.com/bloom-1.jpg", 42, null],
      } as unknown as QualityScorePayload;

      // Act
      const result = scoreQualityListing(mixedPhotos);

      // Assert — one valid string earns the partial tier (15), not the top tier
      expect(result.breakdown.photos).toBe(15);
      expect(result.score).toBe(85);
    });
  });
});
