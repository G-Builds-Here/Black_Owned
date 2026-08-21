/**
 * POST /api/pending-businesses/import/job/[jobId]
 *
 * Normalizes a completed scrape job's scraped_businesses rows into
 * pending_import_businesses for admin review. Each row is fuzzy-matched
 * (name/address via the duplicate-detection service, plus exact
 * normalized-phone tie-break) against the live businesses table, all
 * previously scraped businesses, the existing review queue, and rows
 * earlier in this same run; matches are skipped and reported in the
 * response. Name/address thresholds are configurable via
 * DUPLICATE_NAME_THRESHOLD and DUPLICATE_ADDRESS_THRESHOLD
 * (0-1, defaults 0.8 / 0.85).
 */

import { NextRequest, NextResponse } from "next/server";
import { getPool, initializeUserSchema } from "@/lib/db/user-repository";
import { findScrapeJobById } from "@/lib/db/scrape-job-repository";
import {
  findScrapedBusinessesByJobId,
  findScrapedCandidatesForDedup,
  initializeScrapedBusinessSchema,
} from "@/lib/db/scraped-business-repository";
import {
  importNormalizedBusinesses,
  initializePendingImportSchema,
} from "@/lib/db/pending-import-business-repository";
import {
  findBusinessNames,
  initializeBusinessSchema,
} from "@/lib/db/business-repository";
import {
  checkForDuplicate,
  DEFAULT_DUPLICATE_CONFIG,
  type DuplicateDetectionConfig,
} from "@/services/duplicate-detection-service";
import { normalizeString } from "@/utils/similarity";

function isValidUuid(id: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(id);
}

/**
 * Parse an env-supplied similarity threshold (0-1), falling back to the
 * service default when unset or invalid.
 */
function thresholdFromEnv(raw: string | undefined, fallback: number): number {
  if (raw === undefined || raw.trim() === "") return fallback;
  const value = Number(raw);
  return Number.isFinite(value) && value >= 0 && value <= 1 ? value : fallback;
}

interface DedupCandidate {
  name: string;
  address: string;
  phone?: string;
  origin: "directory" | "scraped" | "queue";
}

interface CompareTarget {
  name: string;
  address: string;
  phone?: string;
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
      await initializeUserSchema();
      await initializeBusinessSchema(client);
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
          duplicates: [],
          results: [],
          errors: [],
        });
      }

      // External dedup candidate pool: the live directory (name only),
      // every previously scraped business outside this job
      // (name/address/phone), and everything already in the review queue
      // (name + source_data address/phone).
      const directoryNames = await findBusinessNames(client);
      const scrapedCandidates = await findScrapedCandidatesForDedup(client);
      const currentJobIds = new Set(scraped.map((b) => b.id));
      const pendingRows = await client.query<{
        name: string;
        source_data: Record<string, unknown> | null;
      }>("SELECT name, source_data FROM pending_import_businesses");

      const externalCandidates: DedupCandidate[] = [
        ...directoryNames.map((name) => ({
          name,
          address: "",
          origin: "directory" as const,
        })),
        ...scrapedCandidates
          .filter((c) => !currentJobIds.has(c.id))
          .map((c) => ({
            name: c.name,
            address: c.address,
            phone: c.phone,
            origin: "scraped" as const,
          })),
        ...pendingRows.rows.map((r) => ({
          name: r.name,
          address:
            typeof r.source_data?.address === "string" ? r.source_data.address : "",
          phone:
            typeof r.source_data?.phone === "string" ? r.source_data.phone : undefined,
          origin: "queue" as const,
        })),
      ];

      const config: DuplicateDetectionConfig = {
        nameThreshold: thresholdFromEnv(
          process.env.DUPLICATE_NAME_THRESHOLD,
          DEFAULT_DUPLICATE_CONFIG.nameThreshold
        ),
        addressThreshold: thresholdFromEnv(
          process.env.DUPLICATE_ADDRESS_THRESHOLD,
          DEFAULT_DUPLICATE_CONFIG.addressThreshold
        ),
        nameWeight: DEFAULT_DUPLICATE_CONFIG.nameWeight,
        addressWeight: DEFAULT_DUPLICATE_CONFIG.addressWeight,
      };

      const isDuplicateOf = (b: CompareTarget, c: CompareTarget): boolean =>
        normalizeString(c.name) === normalizeString(b.name) ||
        checkForDuplicate(b, c, config).isPotentialDuplicate;

      const duplicates: Array<{
        name: string;
        matchedName: string;
        matchSource: string;
      }> = [];
      const toImport: typeof scraped = [];
      const accepted: CompareTarget[] = [];

      for (const b of scraped) {
        const target: CompareTarget = {
          name: b.name,
          address: b.address,
          phone: b.phone,
        };
        const external = externalCandidates.find((c) => isDuplicateOf(target, c));
        const earlier = external
          ? undefined
          : accepted.find((a) => isDuplicateOf(target, a));

        if (external || earlier) {
          duplicates.push({
            name: b.name,
            matchedName: external ? external.name : (earlier as CompareTarget).name,
            matchSource: external ? external.origin : "scraped",
          });
        } else {
          toImport.push(b);
          accepted.push(target);
        }
      }
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
        duplicates,
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
