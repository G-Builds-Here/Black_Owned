/**
 * POST /api/pending-businesses/import/job/[jobId]
 *
 * Normalizes a completed scrape job's scraped_businesses rows into
 * pending_import_businesses for admin review. Idempotent: businesses whose
 * name already exists in pending_import_businesses (any status) are skipped.
 */

import { NextRequest, NextResponse } from "next/server";
import { getPool } from "@/lib/db/user-repository";
import { findScrapeJobById } from "@/lib/db/scrape-job-repository";
import {
  findScrapedBusinessesByJobId,
  initializeScrapedBusinessSchema,
} from "@/lib/db/scraped-business-repository";
import {
  importNormalizedBusinesses,
  initializePendingImportSchema,
} from "@/lib/db/pending-import-business-repository";

function isValidUuid(id: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(id);
}

export async function POST(
  _request: NextRequest,
  context: { params: Promise<{ jobId: string }> }
): Promise<NextResponse> {
  try {
    const { jobId } = await context.params;

    if (!isValidUuid(jobId)) {
      return NextResponse.json(
        { success: false, error: "Invalid job ID format", code: "INVALID_ID" },
        { status: 400 }
      );
    }

    const pool = getPool();
    const client = await pool.connect();

    try {
      await initializeScrapedBusinessSchema(client);
      await initializePendingImportSchema(client);

      const job = await findScrapeJobById(client, jobId);
      if (!job) {
        return NextResponse.json(
          { success: false, error: "Scrape job not found", code: "NOT_FOUND" },
          { status: 404 }
        );
      }

      if (job.status !== "completed") {
        return NextResponse.json(
          {
            success: false,
            error: "Job is not completed yet",
            code: "JOB_NOT_COMPLETED",
            status: job.status,
          },
          { status: 400 }
        );
      }

      const scraped = await findScrapedBusinessesByJobId(client, jobId);
      if (scraped.length === 0) {
        return NextResponse.json({
          success: true,
          jobId,
          total: 0,
          imported: 0,
          skipped: 0,
          results: [],
          errors: [],
        });
      }

      // Dedupe against everything already in the review queue (any status)
      const existing = await client.query("SELECT name FROM pending_import_businesses");
      const existingNames = new Set(existing.rows.map((r: { name: string }) => r.name.toLowerCase()));

      const toImport = scraped.filter((b) => !existingNames.has(b.name.toLowerCase()));
      const skipped = scraped.length - toImport.length;

      const normalized = toImport.map((b) => ({
        name: b.name,
        description: b.website ? `Scraped from ${b.source}. ${b.website}` : undefined,
        category_id: b.category || "other",
        source: b.source,
        source_data: {
          source: b.source,
          address: b.address,
          phone: b.phone,
          website: b.website,
          rating: b.rating,
          reviewCount: b.reviewCount,
          category: b.category,
          scrapedBusinessId: b.id,
        },
        originalId: b.sourceId || b.id,
      }));

      const result = await importNormalizedBusinesses(client, normalized, jobId);

      return NextResponse.json({
        success: true,
        jobId,
        total: result.total,
        imported: result.succeeded,
        skipped,
        results: result.results,
        errors: result.errors,
      });
    } finally {
      client.release();
    }
  } catch (error) {
    console.error("Error importing scraped businesses for job:", error);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}
