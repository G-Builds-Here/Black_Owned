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
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;

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

      // Fetch associated business details if business_count > 0
      let businessDetails = null;
      if (scrapeJob.business_count > 0) {
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
          business_count: scrapeJob.business_count,
          created_at: scrapeJob.created_at.toISOString(),
          updated_at: scrapeJob.updated_at.toISOString(),
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
 * Delete a scrape job
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;

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
      const deletedJob = await deleteScrapeJob(client, id);

      if (!deletedJob) {
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
        data: {
          id: deletedJob.id,
          source: deletedJob.source,
          query: deletedJob.query,
          location: deletedJob.location,
          status: deletedJob.status,
          business_count: deletedJob.business_count,
          created_at: deletedJob.created_at.toISOString(),
          updated_at: deletedJob.updated_at.toISOString()
        }
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
