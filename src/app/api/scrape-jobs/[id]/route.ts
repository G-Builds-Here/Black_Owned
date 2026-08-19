import { NextRequest, NextResponse } from 'next/server';
import { findScrapeJobById, deleteScrapeJob } from '@/lib/db/scrape-job-repository';
import { findBusinessById } from '@/lib/db/business-repository';
import { getPool } from '@/lib/db/user-repository';

/**
 * GET /api/scrape-jobs/:id
 * Get scrape job details with business information
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    if (!id || id.trim() === '') {
      return NextResponse.json(
        {
          success: false,
          error: 'Job ID is required'
        },
        { status: 400 }
      );
    }

    const client = await getPool().connect();
    try {
      const scrapeJob = await findScrapeJobById(client, id);

      if (!scrapeJob) {
        return NextResponse.json(
          {
            success: false,
            error: 'Scrape job not found'
          },
          { status: 404 }
        );
      }

      // Fetch associated business details if businessCount > 0
      let businessDetails = null;
      if ((scrapeJob.businessCount ?? 0) > 0) {
        // For now, return null - business details would be fetched separately
        // This is a placeholder for future enhancement
        businessDetails = null;
      }

      return NextResponse.json({
        success: true,
        data: {
          id: scrapeJob.id,
          source: scrapeJob.source,
          query: scrapeJob.query,
          location: scrapeJob.location,
          status: scrapeJob.status,
          businessCount: scrapeJob.businessCount,
          createdAt: scrapeJob.createdAt.toISOString(),
          updatedAt: scrapeJob.updatedAt.toISOString(),
          business_details: businessDetails
        }
      });
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Get scrape job error:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Internal server error'
      },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/scrape-jobs/:id
 * Delete a scrape job by id
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    if (!id || id.trim() === '') {
      return NextResponse.json(
        {
          success: false,
          error: 'Job ID is required'
        },
        { status: 400 }
      );
    }

    const client = await getPool().connect();
    try {
      const job = await deleteScrapeJob(client, id);

      if (!job) {
        return NextResponse.json(
          {
            success: false,
            error: 'Scrape job not found'
          },
          { status: 404 }
        );
      }

      return NextResponse.json({
        success: true,
        message: 'Scrape job deleted successfully',
        data: { id: job.id }
      });
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Delete scrape job error:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Internal server error'
      },
      { status: 500 }
    );
  }
}
