import { NextRequest, NextResponse } from 'next/server';
import { getPool } from '@/lib/db/user-repository';

export type ScrapeJobSource = 'GoogleMaps' | 'Yelp' | 'Facebook';

interface ScrapeJobStats {
  totalJobs: number;
  successfulJobs: number;
  failedJobs: number;
  totalItemsScraped: number;
  periodDays: number;
  source?: ScrapeJobSource;
}

const VALID_SOURCES: ScrapeJobSource[] = ['GoogleMaps', 'Yelp', 'Facebook'];

function isValidSource(source: string): source is ScrapeJobSource {
  return VALID_SOURCES.includes(source as ScrapeJobSource);
}

function getTableName(): string {
  const schema = process.env.POSTGRES_SCHEMA;
  return schema ? `${schema}.scrape_jobs` : 'scrape_jobs';
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const days = parseInt(searchParams.get('days') || '30', 10);
    const source = searchParams.get('source');

    if (isNaN(days) || days < 1 || days > 365) {
      return NextResponse.json(
        { error: 'Invalid days parameter. Must be between 1 and 365.' },
        { status: 400 }
      );
    }

    if (source && !isValidSource(source)) {
      return NextResponse.json(
        { error: `Invalid source parameter. Must be one of: ${VALID_SOURCES.join(', ')}` },
        { status: 400 }
      );
    }

    const pool = getPool();
    const client = await pool.connect();

    try {
      const tableName = getTableName();
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - days);

      let query = `
        SELECT
          COUNT(*) as total_jobs,
          COUNT(*) FILTER (WHERE status = 'completed') as successful_jobs,
          COUNT(*) FILTER (WHERE status = 'failed') as failed_jobs,
          COALESCE(SUM(result_count), 0) as total_items_scraped
        FROM ${tableName}
        WHERE created_at >= $1
      `;
      const params: unknown[] = [cutoffDate.toISOString()];

      if (source && isValidSource(source)) {
        query += ' AND source = $2';
        params.push(source);
      }

      const result = await client.query<{
        total_jobs: string;
        successful_jobs: string;
        failed_jobs: string;
        total_items_scraped: string;
      }>(query, params);

      const row = result.rows[0];

      const stats: ScrapeJobStats = {
        totalJobs: parseInt(row.total_jobs, 10),
        successfulJobs: parseInt(row.successful_jobs, 10),
        failedJobs: parseInt(row.failed_jobs, 10),
        totalItemsScraped: parseInt(row.total_items_scraped, 10),
        periodDays: days,
        ...(source && { source: source as ScrapeJobSource }),
      };

      return NextResponse.json(stats);
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Error fetching scrape job stats:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
