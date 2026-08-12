import { NextRequest, NextResponse } from 'next/server';
import { findScrapeJobById } from '@/lib/db/scrape-job-repository';

/**
 * GET /api/scrape-jobs/:id/status
 * Returns the status of a scrape job with full details
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;

    // Validate ID is present
    if (!id || id === 'status') {
      return NextResponse.json(
        { error: 'Job ID is required' },
        { status: 400 }
      );
    }

    // Fetch the job
    const job = await findScrapeJobById(id);

    // Return 404 if job not found
    if (!job) {
      return NextResponse.json(
        { error: 'Job not found' },
        { status: 404 }
      );
    }

    // Return job status with details
    return NextResponse.json({
      id: job.id,
      source: job.source,
      query: job.query,
      location: job.location,
      status: job.status,
      businessCount: job.business_count,
      createdAt: job.created_at,
      updatedAt: job.updated_at
    });
  } catch (error) {
    console.error('Error fetching scrape job status:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
