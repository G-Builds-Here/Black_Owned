/**
 * One-off importer: promote rows from `scraped_businesses` into the
 * `businesses` table so the scraped (Google Maps) businesses show up as real
 * directory entries.
 *
 * Mapping (scraped_businesses -> businesses):
 *   owner_id            -> the seed user (00000000-0000-0000-0000-000000000001)
 *   name                -> name
 *   category            -> category_id (looked up by name in `categories`;
 *                          food/restaurant terms fall back to "Food & Dining")
 *   address             -> location
 *   rating / review_cnt -> rating / review_count
 *   website / phone     -> website / phone (dedicated columns)
 *   verification_status -> 'unverified' (not owner-claimed yet)
 *
 * Idempotent: a scraped business is only inserted if no `businesses` row with
 * the same (name, location) already exists, so re-running is a no-op.
 *
 * Prereqs: Postgres running (DATABASE_URL, or the default local black_owned DB).
 * Run: npx -y tsx import-scraped-businesses.ts
 */
import { Pool } from "pg";

const DATABASE_URL =
  process.env.DATABASE_URL ||
  "postgresql://postgres:postgres@localhost:5432/black_owned";

const SEED_OWNER_ID = "00000000-0000-0000-0000-000000000001";

interface Category {
  id: string;
  name: string;
}

interface ScrapedRow {
  id: string;
  name: string;
  address: string | null;
  phone: string | null;
  website: string | null;
  description: string | null;
  category: string | null;
  rating: number | null;
  review_count: number | null;
}

/** Pick the categories-table id for a free-text scraped category. */
function resolveCategoryId(category: string | null, cats: Category[]): string {
  const byName = (needle: string) =>
    cats.find((c) => c.name.toLowerCase() === needle.toLowerCase());

  const text = (category || "").toLowerCase();
  // Order matters: most specific first.
  if (/(cloth|fashion|boutique|apparel|retail|store|shop)/.test(text))
    return (byName("Retail & Fashion") ?? cats[0]).id;
  if (/(health|wellness|medical|fitness|yoga|therapy|clinic)/.test(text))
    return (byName("Health & Wellness") ?? cats[0]).id;
  if (/(barber|salon|beauty|groom|nail)/.test(text))
    return (byName("Personal Services") ?? cats[0]).id;
  if (/(consult|legal|financial|account|insur|service|office)/.test(text))
    return (byName("Professional Services") ?? cats[0]).id;
  if (/(music|art|entertain|theater|theatre|venue|event)/.test(text))
    return (byName("Entertainment") ?? cats[0]).id;
  // Default (and all restaurant/food/cafe terms): Food & Dining.
  return (byName("Food & Dining") ?? cats[0]).id;
}

async function main(): Promise<void> {
  const pool = new Pool({ connectionString: DATABASE_URL });

  try {
    const catsRes = await pool.query<Category>(
      "SELECT id, name FROM categories ORDER BY name"
    );
    const cats = catsRes.rows;
    if (cats.length === 0) {
      throw new Error("No categories found — seed the categories table first.");
    }

    const scrapedRes = await pool.query<ScrapedRow>(
      `SELECT id, name, address, phone, website, description, category, rating, review_count
       FROM scraped_businesses ORDER BY created_at`
    );
    const rows = scrapedRes.rows;
    console.log(`scraped_businesses rows: ${rows.length}`);

    let inserted = 0;
    let skipped = 0;

    for (const r of rows) {
      const location = r.address ?? "";
      const categoryId = resolveCategoryId(r.category, cats);

      // Idempotency guard: skip if an identical (name, location) already exists.
      const exists = await pool.query(
        "SELECT 1 FROM businesses WHERE name = $1 AND location = $2 LIMIT 1",
        [r.name, location]
      );
      if (exists.rowCount && exists.rowCount > 0) {
        skipped++;
        console.log(`  skip (exists): ${r.name}`);
        continue;
      }

      await pool.query(
        `INSERT INTO businesses
           (owner_id, name, description, category_id, verification_status,
            location, rating, review_count, image_url, website, phone)
         VALUES ($1, $2, $3, $4, 'unverified', $5, $6, $7, $8, $9, $10)`,
        [
          SEED_OWNER_ID,
          r.name,
          r.description,
          categoryId,
          location,
          r.rating ?? 0,
          r.review_count ?? 0,
          null,
          r.website,
          r.phone,
        ]
      );
      inserted++;
      console.log(`  insert: ${r.name} -> category_id=${categoryId.slice(0, 8)}`);
    }

    const total = await pool.query("SELECT count(*)::int AS n FROM businesses");
    console.log(
      `RESULT inserted=${inserted} skipped=${skipped} businesses_total=${total.rows[0].n}`
    );
  } finally {
    await pool.end();
  }
}

main();
