import { NextRequest, NextResponse } from 'next/server';
import { getPool } from '@/lib/db/user-repository';

export type ScrapeJobSource = 'GoogleMaps' | 'Yelp' | 'Facebook';

interface ScrapeJob {
  id: string;
  jobName: string;
  targetUrl: string;
  status: 'success' | 'failed' | 'running';
  errorMessage: string | null;
  itemsScraped: number;
  startedAt: string;
  completedAt: string | null;
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
    const limit = parseInt(searchParams.get('limit') || '10', 10);
    const source = searchParams.get('source');

    if (isNaN(limit) || limit < 1 || limit > 100) {
      return NextResponse.json(
        { error: 'Invalid limit parameter. Must be between 1 and 100.' },
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

      let query = `
        SELECT
          id,
          source,
          query as "jobName",
          location as "targetUrl",
          status,
          error_message as "errorMessage",
          result_count as "itemsScraped",
          created_at as "startedAt",
          updated_at as "completedAt"
        FROM ${tableName}
        ORDER BY created_at DESC
        LIMIT $1
      `;
      const params: unknown[] = [limit];

      if (source && isValidSource(source)) {
        query = `
          SELECT
            id,
            source,
            query as "jobName",
            location as "targetUrl",
            status,
            error_message as "errorMessage",
            result_count as "itemsScraped",
            created_at as "startedAt",
            updated_at as "completedAt"
          FROM ${tableName}
          WHERE source = $2
          ORDER BY created_at DESC
          LIMIT $1
        `;
        params.unshift(source);
      }

      const result = await client.query<ScrapeJob>(query, params);

      return NextResponse.json(result.rows);
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Error fetching recent scrape jobs:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
