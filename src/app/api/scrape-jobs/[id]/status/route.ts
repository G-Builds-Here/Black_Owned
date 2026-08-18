import { NextRequest, NextResponse } from 'next/server';
import { findScrapeJobById } from '@/lib/db/scrape-job-repository';
import { getPool } from '@/lib/db/user-repository';

/**
 * GET /api/scrape-jobs/:id/status
 * Returns the status of a scrape job with full details
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const client = await getPool().connect();
  try {
    const { id } = await params;

    // Validate ID is present
    if (!id || id === 'status') {
      return NextResponse.json(
        { error: 'Job ID is required' },
        { status: 400 }
      );
    }

    // Fetch the job
    const job = await findScrapeJobById(client, id);

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
      businessCount: job.businessCount,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt
    });
  } catch (error) {
    console.error('Error fetching scrape job status:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}
