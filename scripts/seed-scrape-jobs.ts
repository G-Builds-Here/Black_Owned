/**
 * Seed Script: Create Test Scrape Jobs
 *
 * This script creates 5 test scrape jobs for development and testing:
 * - 2 Google Maps jobs
 * - 2 Yelp jobs
 * - 1 Facebook job
 *
 * Each job has realistic search queries and locations relevant to the
 * Black Owned directory platform.
 *
 * Usage:
 *   npx tsx scripts/seed-scrape-jobs.ts
 */

import { createScrapeJob, initializeScrapeJobSchema } from "../src/lib/db/scrape-job-repository";
import { getPool } from "../src/lib/db/user-repository";
import { CreateScrapeJobInput } from "../src/types/scrape-job";

/**
 * Test scrape job definitions
 */
const TEST_JOBS: CreateScrapeJobInput[] = [
  {
    source: "google-maps",
    query: "black owned restaurants",
    location: "Dallas, TX",
  },
  {
    source: "google-maps",
    query: "black owned coffee shops",
    location: "Houston, TX",
  },
  {
    source: "yelp",
    query: "black owned beauty salons",
    location: "Atlanta, GA",
  },
  {
    source: "yelp",
    query: "black owned barbershops",
    location: "Chicago, IL",
  },
  {
    source: "facebook",
    query: "black owned businesses",
    location: "Washington, DC",
  },
];

/**
 * Main seed function
 */
async function seedScrapeJobs(): Promise<void> {
  console.log("Initializing scrape job schema...");
  await initializeScrapeJobSchema();

  console.log(`Creating ${TEST_JOBS.length} test scrape jobs...`);

  const results = [];

  for (const job of TEST_JOBS) {
    try {
      const createdJob = await createScrapeJob(job);
      results.push({
        status: "success",
        job: createdJob,
      });
      console.log(
        `[OK] Created ${createdJob.source} job: "${job.query}" in ${job.location} (ID: ${createdJob.id})`
      );
    } catch (error) {
      results.push({
        status: "error",
        job: job,
        error: error instanceof Error ? error.message : String(error),
      });
      console.error(
        `[ERROR] Failed to create ${job.source} job: "${job.query}" in ${job.location}`,
        error
      );
    }
  }

  // Summary
  const successCount = results.filter((r) => r.status === "success").length;
  const errorCount = results.filter((r) => r.status === "error").length;

  console.log("\n--- Seed Summary ---");
  console.log(`Total jobs attempted: ${TEST_JOBS.length}`);
  console.log(`Successfully created: ${successCount}`);
  console.log(`Failed: ${errorCount}`);

  if (errorCount > 0) {
    console.log("\nFailed jobs:");
    results
      .filter((r) => r.status === "error")
      .forEach((r) => {
        if (r.status === "error") {
          console.log(`  - ${r.job.source}: ${r.job.query} (${r.job.location}) - ${r.error}`);
        }
      });
  }

  // Close database connection
  const pool = getPool();
  await pool.end();

  console.log("\nSeed script completed.");
}

// Run the seed script
seedScrapeJobs().catch((error) => {
  console.error("Fatal error running seed script:", error);
  process.exit(1);
});
