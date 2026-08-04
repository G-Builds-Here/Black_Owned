import { NextRequest, NextResponse } from 'next/server';

interface ScrapeJobStats {
  totalJobs: number;
  successfulJobs: number;
  failedJobs: number;
  totalItemsScraped: number;
  totalBusinessesScraped: number;
  totalBusinessesImported: number;
  importRate: number;
  periodDays: number;
  avgDurationSeconds: number | null;
  minDurationSeconds: number | null;
  maxDurationSeconds: number | null;
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const days = parseInt(searchParams.get('days') || '30', 10);

    if (isNaN(days) || days < 1 || days > 365) {
      return NextResponse.json(
        { error: 'Invalid days parameter. Must be between 1 and 365.' },
        { status: 400 }
      );
    }

    // In production, this would query the database directly
    // For now, return mock data that matches the expected schema
    const mockStats: ScrapeJobStats = {
      totalJobs: 0,
      successfulJobs: 0,
      failedJobs: 0,
      totalItemsScraped: 0,
      totalBusinessesScraped: 0,
      totalBusinessesImported: 0,
      importRate: 0,
      periodDays: days,
      avgDurationSeconds: null,
      minDurationSeconds: null,
      maxDurationSeconds: null,
    };

    return NextResponse.json(mockStats);
  } catch (error) {
    console.error('Error fetching scrape job stats:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
