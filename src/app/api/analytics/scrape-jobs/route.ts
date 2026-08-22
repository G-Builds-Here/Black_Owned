import { NextRequest, NextResponse } from 'next/server';
import { getPool } from '@/lib/db/user-repository';
import {
  createAuthMiddleware,
  createAuthErrorResponse,
} from '@/lib/auth/jwt-middleware';

export interface ScrapeJobStats {
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

/**
 * GET /api/analytics/scrape-jobs?days=N
 *
 * Aggregates real scrape job activity over the trailing `days` window from the
 * live scrape_jobs table, with scraped/imported counts joined from the
 * downstream tables that scrape jobs feed into.
 */
export async function GET(request: NextRequest) {
  const requireAdmin = createAuthMiddleware(['admin']);
  const authResult = await requireAdmin(request);
  if (!authResult.authenticated) {
    return createAuthErrorResponse(authResult.errorType!, authResult.errorMessage!);
  }

  try {
    const searchParams = request.nextUrl.searchParams;
    const days = parseInt(searchParams.get('days') || '30', 10);

    if (isNaN(days) || days < 1 || days > 365) {
      return NextResponse.json(
        { error: 'Invalid days parameter. Must be between 1 and 365.' },
        { status: 400 }
      );
    }

    const client = await getPool().connect();
    try {
      const since = `NOW() - make_interval(days => $1)`;

      // Core job aggregates + duration metrics for completed jobs
      const jobAgg = await client.query(
        `SELECT
           COUNT(*)::int AS total_jobs,
           COUNT(*) FILTER (WHERE status = 'completed')::int AS successful_jobs,
           COUNT(*) FILTER (WHERE status = 'failed')::int AS failed_jobs,
           COALESCE(SUM(business_count) FILTER (WHERE business_count IS NOT NULL), 0)::int AS total_items_scraped,
           AVG(EXTRACT(EPOCH FROM (completed_at - started_at))) FILTER (
             WHERE status = 'completed' AND started_at IS NOT NULL AND completed_at IS NOT NULL
           ) AS avg_duration,
           MIN(EXTRACT(EPOCH FROM (completed_at - started_at))) FILTER (
             WHERE status = 'completed' AND started_at IS NOT NULL AND completed_at IS NOT NULL
           ) AS min_duration,
           MAX(EXTRACT(EPOCH FROM (completed_at - started_at))) FILTER (
             WHERE status = 'completed' AND started_at IS NOT NULL AND completed_at IS NOT NULL
           ) AS max_duration
         FROM scrape_jobs
         WHERE created_at >= ${since}`,
        [days]
      );

      const row = jobAgg.rows[0] as {
        total_jobs: number;
        successful_jobs: number;
        failed_jobs: number;
        total_items_scraped: number;
        avg_duration: number | null;
        min_duration: number | null;
        max_duration: number | null;
      };

      // Businesses persisted by jobs in the window
      const scrapedAgg = await client.query(
        `SELECT COUNT(*)::int AS total
         FROM scraped_businesses sb
         JOIN scrape_jobs j ON sb.scrape_job_id = j.id
         WHERE j.created_at >= ${since}`,
        [days]
      );
      const totalBusinessesScraped = Number(scrapedAgg.rows[0].total);

      // Businesses that made it into the review/import pipeline
      const importedAgg = await client.query(
        `SELECT COUNT(*)::int AS total
         FROM pending_import_businesses pib
         JOIN scrape_jobs j ON pib.job_id = j.id
         WHERE j.created_at >= ${since}`,
        [days]
      );
      const totalBusinessesImported = Number(importedAgg.rows[0].total);

      const stats: ScrapeJobStats = {
        totalJobs: Number(row.total_jobs),
        successfulJobs: Number(row.successful_jobs),
        failedJobs: Number(row.failed_jobs),
        totalItemsScraped: Number(row.total_items_scraped),
        totalBusinessesScraped,
        totalBusinessesImported,
        importRate:
          totalBusinessesScraped > 0
            ? Math.round((totalBusinessesImported / totalBusinessesScraped) * 1000) / 10
            : 0,
        periodDays: days,
        avgDurationSeconds: row.avg_duration != null ? Math.round(row.avg_duration) : null,
        minDurationSeconds: row.min_duration != null ? Math.round(row.min_duration) : null,
        maxDurationSeconds: row.max_duration != null ? Math.round(row.max_duration) : null,
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
