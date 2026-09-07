/**
 * Business Content Repository
 *
 * Read/write access for the editable content fields on `businesses`
 * (website, phone, menu_url, image_url, description, social_urls) used by
 * the admin content editor (LOC-0080). Partial-update semantics: only the
 * fields present in the update map are written; an explicit null clears a
 * field. Manual override is intentional — no fill-empty restriction here.
 */

import { getPool } from "./user-repository";

/**
 * Editable content fields, keyed by the camelCase API key each field is
 * exposed under; values are the corresponding `businesses` column names.
 */
export const CONTENT_FIELD_COLUMNS = {
  website: "website",
  phone: "phone",
  menuUrl: "menu_url",
  imageUrl: "image_url",
  description: "description",
  socialUrls: "social_urls",
} as const;

export type ContentField = keyof typeof CONTENT_FIELD_COLUMNS;

export interface SocialEntry {
  platform: string;
  url: string;
}

export interface BusinessContent {
  id: string;
  name: string;
  website: string | null;
  phone: string | null;
  menuUrl: string | null;
  imageUrl: string | null;
  description: string | null;
  socialUrls: SocialEntry[] | null;
}

export interface ContentUpdates {
  website?: string | null;
  phone?: string | null;
  menuUrl?: string | null;
  imageUrl?: string | null;
  description?: string | null;
  socialUrls?: SocialEntry[] | null;
}

/**
 * App-level length caps for string fields. website is VARCHAR(255) in the
 * schema (migration 004), so the cap follows the column. image_url and
 * description are TEXT; their caps are app-level.
 */
const CONTENT_LIMITS: Record<Exclude<ContentField, "socialUrls">, number> = {
  website: 255,
  phone: 50,
  menuUrl: 500,
  imageUrl: 500,
  description: 2000,
};

const SOCIAL_URLS_MAX_ENTRIES = 10;
const SOCIAL_PLATFORM_MAX = 50;
const SOCIAL_URL_MAX = 500;

const SELECT_CONTENT_SQL =
  "SELECT id, name, website, phone, menu_url, image_url, description, social_urls FROM businesses WHERE id = $1";
const RETURNING_COLUMNS =
  "id, name, website, phone, menu_url, image_url, description, social_urls";

function isSocialEntry(value: unknown): value is SocialEntry {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const entry = value as Record<string, unknown>;
  return (
    typeof entry.platform === "string" &&
    entry.platform.length > 0 &&
    entry.platform.length <= SOCIAL_PLATFORM_MAX &&
    typeof entry.url === "string" &&
    entry.url.length > 0 &&
    entry.url.length <= SOCIAL_URL_MAX
  );
}

function isValidSocialUrls(value: unknown): value is SocialEntry[] {
  return (
    Array.isArray(value) &&
    value.length <= SOCIAL_URLS_MAX_ENTRIES &&
    value.every(isSocialEntry)
  );
}

function mapRow(row: Record<string, unknown>): BusinessContent {
  const socialUrls = row.social_urls;
  return {
    id: row.id as string,
    name: row.name as string,
    website: row.website as string | null,
    phone: row.phone as string | null,
    menuUrl: row.menu_url as string | null,
    imageUrl: row.image_url as string | null,
    description: row.description as string | null,
    socialUrls: isValidSocialUrls(socialUrls) ? socialUrls : null,
  };
}

/**
 * Fetch the editable content fields for one business.
 * Returns null when the id does not exist.
 */
export async function fetchBusinessContent(
  id: string
): Promise<BusinessContent | null> {
  const client = await getPool().connect();
  try {
    const result = await client.query(SELECT_CONTENT_SQL, [id]);
    if (result.rows.length === 0) {
      return null;
    }
    return mapRow(result.rows[0]);
  } finally {
    client.release();
  }
}

/**
 * Partial update of a business's content fields. Only the fields present
 * in `updates` are written (dynamic SET built from the fixed column
 * whitelist; values are always bound parameters). An explicit null clears a
 * field. Returns the updated row, or null when no business matches.
 *
 * The caller must ensure `updates` is non-empty (validateContentBody).
 */
export async function updateBusinessContent(
  id: string,
  updates: ContentUpdates
): Promise<BusinessContent | null> {
  const assignments: string[] = [];
  const params: unknown[] = [id];
  for (const field of Object.keys(CONTENT_FIELD_COLUMNS) as ContentField[]) {
    if (!(field in updates)) {
      continue;
    }
    params.push((updates as Record<string, unknown>)[field]);
    assignments.push(`${CONTENT_FIELD_COLUMNS[field]} = $${params.length}`);
  }
  assignments.push("updated_at = NOW()");

  const sql = `UPDATE businesses SET ${assignments.join(
    ", "
  )} WHERE id = $1 RETURNING ${RETURNING_COLUMNS}`;

  const client = await getPool().connect();
  try {
    const result = await client.query(sql, params);
    if (result.rows.length === 0) {
      return null;
    }
    return mapRow(result.rows[0]);
  } finally {
    client.release();
  }
}

export type ValidationOutcome =
  | { ok: true; updates: ContentUpdates }
  | { ok: false; error: string };

/**
 * Validate a PATCH content body against the editable field caps.
 * Partial-save semantics: only keys present are written; an explicit null
 * clears a field. Unknown keys are rejected and named in the error.
 */
export function validateContentBody(body: unknown): ValidationOutcome {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return {
      ok: false,
      error: "Request body must be a JSON object of content fields",
    };
  }

  const record = body as Record<string, unknown>;

  for (const key of Object.keys(record)) {
    if (!(key in CONTENT_FIELD_COLUMNS)) {
      return { ok: false, error: `Unknown content field: ${key}` };
    }
  }

  const updates: ContentUpdates = {};
  for (const field of Object.keys(CONTENT_FIELD_COLUMNS) as ContentField[]) {
    if (!(field in record)) {
      continue;
    }
    const value = record[field];

    if (field === "socialUrls") {
      if (value !== null && !isValidSocialUrls(value)) {
        return {
          ok: false,
          error: `socialUrls must be an array (max ${SOCIAL_URLS_MAX_ENTRIES}) of {platform, url} objects`,
        };
      }
      updates.socialUrls = (value as SocialEntry[] | null) ?? null;
      continue;
    }

    if (value === null) {
      (updates as Record<string, string | null>)[field] = null;
      continue;
    }
    if (typeof value !== "string") {
      return { ok: false, error: `${field} must be a string or null` };
    }
    if (value.length > CONTENT_LIMITS[field]) {
      return {
        ok: false,
        error: `${field} must be at most ${CONTENT_LIMITS[field]} characters`,
      };
    }
    (updates as Record<string, string | null>)[field] = value;
  }

  if (Object.keys(updates).length === 0) {
    return { ok: false, error: "No editable content fields provided" };
  }
  return { ok: true, updates };
}
