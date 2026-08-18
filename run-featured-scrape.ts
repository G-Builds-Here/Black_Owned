/**
 * One-off runner: run the Google Maps scraper for ~10 businesses and persist
 * them to the scraped_businesses table so the homepage "Featured Businesses"
 * section has real data.
 *
 * Uses the same scraper + repositories the app uses (not a mock). Bounded to a
 * single results page (~10 businesses) to match the request.
 *
 * Prereqs: Postgres running (DATABASE_URL), Playwright chromium installed,
 * outbound network to Google Maps.
 *
 * Run:
 *   npx tsx run-featured-scrape.ts
 * Env overrides:
 *   SCRAPER_QUERY   (default "black owned restaurants")
 *   SCRAPER_LOCATION (default "Atlanta, GA")
 */
import { Pool } from "pg";
import { GoogleMapsScraper } from "./src/services/google-maps-scraper";
import { ScraperSource } from "./src/types/scraper-result";
import {
  initializeScrapeJobSchema,
  createScrapeJob,
  updateScrapeJobStatus,
} from "./src/lib/db/scrape-job-repository";
import {
  initializeScrapedBusinessSchema,
  createScrapedBusiness,
} from "./src/lib/db/scraped-business-repository";

const QUERY = process.env.SCRAPER_QUERY || "black owned restaurants";
const LOCATION = process.env.SCRAPER_LOCATION || "Atlanta, GA";

async function main(): Promise<void> {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const client = await pool.connect();
  try {
    await initializeScrapeJobSchema(client);
    await initializeScrapedBusinessSchema(client);

    const job = await createScrapeJob(client, {
      source: ScraperSource.GOOGLE_MAPS,
      query: QUERY,
      location: LOCATION,
    });
    await updateScrapeJobStatus(client, job.id, "running", 0);
    console.log(`Scrape job created: ${job.id} (query="${QUERY}" in ${LOCATION})`);

    // Single results page (~10 businesses) to match the request.
    const scraper = new GoogleMapsScraper({ maxPages: 1 });
    const result = await scraper.scrape(QUERY, LOCATION);
    await scraper.close();

    const businesses = result.businesses;
    for (const b of businesses) {
      await createScrapedBusiness(client, {
        scrapeJobId: job.id,
        source: ScraperSource.GOOGLE_MAPS,
        name: b.name,
        address: b.address,
        phone: b.phone,
        website: b.website,
        category: b.category,
        rating: b.rating,
        reviewCount: b.reviewCount,
        sourceId: b.sourceId,
      });
    }
    await updateScrapeJobStatus(client, job.id, "completed", businesses.length);

    console.log(`SCRAPED_COUNT=${businesses.length}`);
    console.log(
      JSON.stringify(
        businesses.map((b) => ({
          name: b.name,
          address: b.address,
          category: b.category,
          rating: b.rating,
          reviewCount: b.reviewCount,
        })),
        null,
        2
      )
    );
  } finally {
    client.release();
    await pool.end();
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("RUNNER_ERROR", e);
    process.exit(1);
  });
