/**
 * API Route: Get scraped businesses by job ID
 *
 * GET /api/admin/reviews/job/[jobId]
 * Returns businesses scraped by a specific job for the admin review queue.
 */

import { NextRequest, NextResponse } from "next/server";
import { getPool } from "@/lib/db/user-repository";
import { findScrapedBusinessesByJobId } from "@/lib/db/scraped-business-repository";
import { findScrapeJobById } from "@/lib/db/scrape-job-repository";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const { jobId } = await params;

  if (!jobId || jobId === "") {
    return NextResponse.json(
      { success: false, error: "Job ID is required" },
      { status: 400 }
    );
  }

  const client = await getPool().connect();

  try {
    // Verify the job exists
    const job = await findScrapeJobById(client, jobId);

    if (!job) {
      return NextResponse.json(
        { success: false, error: "Job not found" },
        { status: 404 }
      );
    }

    // Get businesses for this job
    const businesses = await findScrapedBusinessesByJobId(client, jobId);

    // Transform to review-friendly format
    const reviewBusinesses = businesses.map((business) => ({
      id: business.id,
      name: business.name,
      address: business.address,
      source: business.source,
      rating: business.rating || 0,
      submittedAt: business.createdAt.toISOString().split("T")[0],
      description: undefined,
      category: business.category,
      phone: business.phone,
      website: business.website,
      hours: undefined,
      priceRange: undefined,
      originalData: {
        scrapeJobId: business.scrapeJobId,
        status: business.status,
        createdAt: business.createdAt.toISOString(),
      },
    }));

    return NextResponse.json({
      success: true,
      data: reviewBusinesses,
      job: {
        id: job.id,
        source: job.source,
        query: job.query,
        location: job.location,
        status: job.status,
        resultCount: job.businessCount ?? 0,
        createdAt: job.createdAt.toISOString(),
      },
    });
  } catch (error) {
    console.error("Error fetching businesses by job ID:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Internal server error",
      },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}
