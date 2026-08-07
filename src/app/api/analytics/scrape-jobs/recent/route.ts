import { NextRequest, NextResponse } from 'next/server';

interface ScrapeJob {
  id: string;
  jobName: string;
  targetUrl: string;
  status: 'success' | 'failed' | 'running';
  errorMessage: string | null;
  itemsScraped: number;
  startedAt: string;
  completedAt: string | null;
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const limit = parseInt(searchParams.get('limit') || '10', 10);

    if (isNaN(limit) || limit < 1 || limit > 100) {
      return NextResponse.json(
        { error: 'Invalid limit parameter. Must be between 1 and 100.' },
        { status: 400 }
      );
    }

    // In production, this would query the database directly
    // For now, return empty array (no jobs recorded yet)
    const mockJobs: ScrapeJob[] = [];

    return NextResponse.json(mockJobs);
  } catch (error) {
    console.error('Error fetching recent scrape jobs:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
