import { NextRequest, NextResponse } from 'next/server';
import { cancelScrapeJob } from '@/lib/db/scrape-job-repository';

/**
 * POST /api/scrape-jobs/:id/cancel
 * Cancel a running scrape job.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    if (!id || id.trim() === '') {
      return NextResponse.json(
        { error: 'Job ID is required' },
        { status: 400 }
      );
    }

    const job = await cancelScrapeJob(id.trim());

    if (!job) {
      return NextResponse.json(
        { error: 'Job not found or not in running status' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      message: 'Job cancelled successfully',
      job: {
        id: job.id,
        source: job.source,
        query: job.query,
        location: job.location,
        status: job.status,
      },
    });
  } catch (error) {
    console.error('Cancel scrape job error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
