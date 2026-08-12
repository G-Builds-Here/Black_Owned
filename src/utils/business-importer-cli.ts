/**
 * Business Importer CLI
 *
 * Command-line interface for importing scraped business data.
 */

import { Pool } from "pg";
import { importBusinessBatch, initializeImportSchema } from "../lib/importer/business-importer";
import { ScraperResult, ScraperSource, GoogleMapsRawData, YelpRawData, FacebookRawData } from "../types/scraper-result";

/**
 * Load scraped data from JSON file
 */
async function loadScrapedData(filePath: string): Promise<ScraperResult[]> {
  const fs = await import("fs");
  const path = await import("path");

  const absolutePath = path.resolve(filePath);
  const rawData = fs.readFileSync(absolutePath, "utf-8");
  const parsed = JSON.parse(rawData);

  // Handle different input formats
  if (Array.isArray(parsed)) {
    return parsed.map((item) => ({
      source: item.source || ScraperSource.GOOGLE_MAPS,
      rawData: item.rawData || item,
      scrapedAt: item.scrapedAt ? new Date(item.scrapedAt) : new Date(),
      jobId: item.jobId,
    }));
  }

  // Handle object format with businesses array
  if (parsed.businesses && Array.isArray(parsed.businesses)) {
    return parsed.businesses.map((item: unknown) => ({
      source: item.source || ScraperSource.GOOGLE_MAPS,
      rawData: item.rawData || item,
      scrapedAt: item.scrapedAt ? new Date(item.scrapedAt) : new Date(),
      jobId: item.jobId,
    }));
  }

  throw new Error("Unsupported data format. Expected array of ScraperResult or object with businesses array.");
}

/**
 * Run the import pipeline
 */
async function runImport(
  dbUrl: string,
  inputFile: string,
  ownerId: string,
  batchSize: number
): Promise<void> {
  console.log(`Loading scraped data from: ${inputFile}`);
  const scrapedData = await loadScrapedData(inputFile);
  console.log(`Loaded ${scrapedData.length} records`);

  // Count by source
  const sourceCounts = scrapedData.reduce((acc, item) => {
    acc[item.source] = (acc[item.source] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  console.log("Source breakdown:");
  for (const [source, count] of Object.entries(sourceCounts)) {
    console.log(`  - ${source}: ${count}`);
  }

  // Connect to database
  console.log(`Connecting to database: ${dbUrl.replace(/\/\/[^:]+:[^@]+@/, "//***:***@")}`);
  const pool = new Pool({ connectionString: dbUrl });

  try {
    const client = await pool.connect();

    try {
      // Initialize schema
      console.log("Initializing database schema...");
      await initializeImportSchema(client);

      // Run import
      console.log(`Importing ${scrapedData.length} records in batches of ${batchSize}...`);
      const startTime = Date.now();

      const result = await importBusinessBatch(client, scrapedData, ownerId, batchSize);

      const duration = ((Date.now() - startTime) / 1000).toFixed(2);

      // Print summary
      console.log("\n=== Import Summary ===");
      console.log(`Total records: ${result.total}`);
      console.log(`Successful: ${result.succeeded}`);
      console.log(`Failed: ${result.failed}`);
      console.log(`Duration: ${duration}s`);

      if (result.errors.length > 0) {
        console.log("\n=== Errors ===");
        for (const error of result.errors.slice(0, 10)) {
          console.log(`  - [${error.source}] ${error.originalId}: ${error.error}`);
        }
        if (result.errors.length > 10) {
          console.log(`  ... and ${result.errors.length - 10} more errors`);
        }
      }
    } finally {
      client.release();
    }
  } finally {
    await pool.end();
  }
}

/**
 * Main entry point
 */
async function main(): Promise<void> {
  const args = process.argv.slice(2);

  const dbUrl = process.env.DATABASE_URL || "postgresql://localhost:5432/black_owned";
  const inputFile = args[0];
  const ownerId = args[1] || "00000000-0000-0000-0000-000000000000";
  const batchSize = parseInt(args[2] || "50", 10);

  if (!inputFile) {
    console.error("Usage: business-importer-cli.ts <input-file> [owner-id] [batch-size]");
    console.error("");
    console.error("Arguments:");
    console.error("  input-file  Path to JSON file containing scraped data");
    console.error("  owner-id    UUID of the business owner (default: 00000000-0000-0000-0000-000000000000)");
    console.error("  batch-size  Number of records to process per batch (default: 50)");
    console.error("");
    console.error("Environment:");
    console.error("  DATABASE_URL  PostgreSQL connection string");
    process.exit(1);
  }

  try {
    await runImport(dbUrl, inputFile, ownerId, batchSize);
    console.log("\nImport completed successfully!");
  } catch (error) {
    console.error("\nImport failed:", error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main().catch((error) => {
    console.error("Unhandled error:", error);
    process.exit(1);
  });
}

export { runImport, loadScrapedData };
