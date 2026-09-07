import { NextRequest, NextResponse } from 'next/server';
import { getPool } from '@/lib/db/user-repository';
import {
  createAuthMiddleware,
  createAuthErrorResponse,
} from '@/lib/auth/jwt-middleware';

export interface RecentScrapeJob {
  id: string;
  source: string;
  query: string;
  location: string;
  status: string;
  businessCount: number | null;
  errorMessage: string | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
}

/**
 * GET /api/analytics/scrape-jobs/recent?limit=N
 *
 * Returns the most recent scrape jobs (newest first) in the live schema shape.
 */
export async function GET(request: NextRequest) {
  const requireAdmin = createAuthMiddleware(['admin']);
  const authResult = await requireAdmin(request);
  if (!authResult.authenticated) {
    return createAuthErrorResponse(authResult.errorType!, authResult.errorMessage!);
  }

  try {
    const searchParams = request.nextUrl.searchParams;
    const limit = parseInt(searchParams.get('limit') || '10', 10);

    if (isNaN(limit) || limit < 1 || limit > 100) {
      return NextResponse.json(
        { success: false, error: 'Invalid limit parameter. Must be between 1 and 100.' },
        { status: 400 }
      );
    }

    const client = await getPool().connect();
    try {
      const result = await client.query(
        `SELECT id, source, query, location, status, business_count, error_message,
                started_at, completed_at, created_at
         FROM scrape_jobs
         ORDER BY created_at DESC
         LIMIT $1`,
        [limit]
      );

      const jobs: RecentScrapeJob[] = result.rows.map((r) => ({
        id: r.id,
        source: r.source,
        query: r.query,
        location: r.location,
        status: r.status,
        businessCount: r.business_count,
        errorMessage: r.error_message,
        startedAt: r.started_at,
        completedAt: r.completed_at,
        createdAt: r.created_at,
      }));

      return NextResponse.json({ success: true, data: jobs });
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Error fetching recent scrape jobs:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
