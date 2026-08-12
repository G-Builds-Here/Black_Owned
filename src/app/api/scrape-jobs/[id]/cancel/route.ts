import { NextRequest, NextResponse } from 'next/server';
import { getPool } from '@/lib/db/user-repository';
import { cancelScrapeJob } from '@/lib/db/scrape-job-repository';

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const client = await getPool().connect();
  try {
    const { id } = params;

    if (!id || id === 'cancel') {
      return NextResponse.json(
        { error: 'Job ID is required' },
        { status: 400 }
      );
    }

    const updatedJob = await cancelScrapeJob(client, id);

    if (!updatedJob) {
      return NextResponse.json(
        { error: 'Job not found or not in running status' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      message: 'Job cancelled successfully',
      job: updatedJob
    });
  } catch (error) {
    console.error('Cancel scrape job error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}
