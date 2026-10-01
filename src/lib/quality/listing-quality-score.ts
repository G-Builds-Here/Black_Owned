/**
 * ListingQualityScorer — pure listing-completeness scoring.
 *
 * Part of LOC-0097 (quality-score epic), blueprint LOC-0096 DR-2/DR-4:
 * scoring logic lives in this pure module; routes stay thin wrappers.
 * Contract surfaces consumed by LOC-0099 (POST /api/quality-score) and
 * LOC-0100 (quality-ordered pending queue): `QualityScorePayload`,
 * `QualityScoreResult`, `scoreQualityListing` (+ `scorePendingImport`,
 * added with AC4).
 *
 * Fitness postconditions (blueprint §9): this module imports NOTHING —
 * no src/lib/db, no src/app, no clock, no cache, no randomness. Scoring a
 * payload twice must return identical results; garbage signal values
 * contribute 0 and must never throw.
 */

/**
 * Fixed per-signal weights (LOC-0096): phone 15, website 20, socials 15,
 * photos 30 (tiered), hours 20 — the full set sums to 100.
 */
const WEIGHT_PHONE = 15;
const WEIGHT_WEBSITE = 20;
const WEIGHT_SOCIALS = 15;
const WEIGHT_HOURS = 20;

/** Photo tiering (AC3): 0 photos → 0, 1-2 → 15, 3 or more → 30. */
const PHOTO_TIER_SOME = 15;
const PHOTO_TIER_TOP = 30;
const PHOTO_TIER_TOP_COUNT = 3;

/** One day's opening hours; the hours signal needs at least one day with both `open` and `close` present. */
export interface OpeningHoursDay {
  open?: string;
  close?: string;
}

/** Week-keyed opening hours (monday..sunday); days may be absent or closed. */
export type OpeningHours = Record<string, OpeningHoursDay | null | undefined>;

/**
 * Canonical listing payload contract (blueprint §5 C3.5). Consumers build
 * this shape from whatever storage they hold; the scorer never looks at a
 * DB row. `name` is carried for consumer convenience and is not scored.
 */
export interface QualityScorePayload {
  name?: string;
  phone?: string;
  website?: string;
  /** Social profile URLs; ≥1 valid URL satisfies the socials signal. */
  socials?: string[];
  /** Photo URLs; scored on tiers (see AC3), not linearly. */
  photos?: string[];
  openingHours?: OpeningHours;
}

/** Per-signal point contributions; always sums to `QualityScoreResult.score`. */
export interface ScoreBreakdown {
  phone: number;
  website: number;
  socials: number;
  photos: number;
  hours: number;
}

/** Scoring outcome: overall integer 0-100 plus the breakdown that sums to it. */
export interface QualityScoreResult {
  score: number;
  breakdown: ScoreBreakdown;
}

/**
 * Manual shape checks (no validation library — LOC-0096 tech-stack
 * constraint). Payload values are untrusted: scrapers put numbers in string
 * fields and strings in list fields. A value that is not a non-empty
 * string never satisfies a signal — and nothing here may throw.
 */
function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Count of entries that are well-formed (non-empty) strings; wrong-typed or absent lists count as none. */
function validStringCount(values: unknown): number {
  if (!Array.isArray(values)) {
    return 0;
  }
  return values.filter(isNonEmptyString).length;
}

/**
 * Photos are a tier, not a ratio: one photo earns partial credit, three
 * earn the full weight, and every photo beyond three earns nothing extra.
 */
function photoTierPoints(photos: unknown): number {
  const count = validStringCount(photos);
  if (count === 0) {
    return 0;
  }
  return count >= PHOTO_TIER_TOP_COUNT ? PHOTO_TIER_TOP : PHOTO_TIER_SOME;
}

/**
 * The hours signal is satisfied by at least one day carrying both an open
 * and a close time (LOC-0096 note; closed/absent days do not count).
 */
function hasOpenDay(openingHours: unknown): boolean {
  if (!isPlainObject(openingHours)) {
    return false;
  }
  return Object.values(openingHours).some(
    (day) =>
      isPlainObject(day) &&
      isNonEmptyString(day.open) &&
      isNonEmptyString(day.close)
  );
}

function totalOf(breakdown: ScoreBreakdown): number {
  return (
    breakdown.phone +
    breakdown.website +
    breakdown.socials +
    breakdown.photos +
    breakdown.hours
  );
}

/**
 * Scores a canonical listing payload for completeness. Deterministic and
 * total: identical input yields identical output, and no input shape may
 * throw — wrong-typed signal values simply contribute 0 (AC4).
 */
export function scoreQualityListing(
  payload: QualityScorePayload
): QualityScoreResult {
  const breakdown: ScoreBreakdown = {
    phone: isNonEmptyString(payload?.phone) ? WEIGHT_PHONE : 0,
    website: isNonEmptyString(payload?.website) ? WEIGHT_WEBSITE : 0,
    socials: validStringCount(payload?.socials) > 0 ? WEIGHT_SOCIALS : 0,
    photos: photoTierPoints(payload?.photos),
    hours: hasOpenDay(payload?.openingHours) ? WEIGHT_HOURS : 0,
  };
  return { score: totalOf(breakdown), breakdown };
}

/**
 * Minimal structural view of a pending-import record (blueprint DR-4).
 * Deliberately NOT `PendingImportBusiness`: the adapter takes plain record
 * fields so the quality module stays DB-free and the mapper is testable
 * without repository mocks; the caller (queue route, LOC-0100) does the
 * reading. Any object carrying these fields is assignable.
 */
export interface PendingImportRecordFields {
  name?: string | null;
  /** Decoded `source_data` JSONB (camelCase, as the repository returns it). */
  sourceData?: Record<string, unknown> | null;
}

/**
 * Scores a pending-import record by mapping its fields onto the canonical
 * payload. Known completeness keys in `sourceData`: `phone` and `website`
 * (blueprint §1 data reality: pending rows carry `{source, originalId}`
 * plus scraped phone/website; socials, photos, and hours exist only on
 * approved businesses, so absent here means 0 — never an error).
 */
export function scorePendingImport(
  record: PendingImportRecordFields
): QualityScoreResult {
  const rawSourceData = record?.sourceData;
  const sourceData = isPlainObject(rawSourceData) ? rawSourceData : {};
  const rawName = record?.name;
  const rawPhone = sourceData.phone;
  const rawWebsite = sourceData.website;
  return scoreQualityListing({
    name: isNonEmptyString(rawName) ? rawName : undefined,
    phone: isNonEmptyString(rawPhone) ? rawPhone : undefined,
    website: isNonEmptyString(rawWebsite) ? rawWebsite : undefined,
  });
}
