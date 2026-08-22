import { NextRequest, NextResponse } from 'next/server';
import { getPool } from '@/lib/db/user-repository';
import { findScrapeJobs } from '@/lib/db/scrape-job-repository';
import { findPendingByStatus } from '@/lib/db/pending-import-business-repository';
import {
  createAuthMiddleware,
  createAuthErrorResponse,
} from '@/lib/auth/jwt-middleware';

export interface DashboardCounts {
  totalBusinesses: number;
  newBusinesses: number;
  totalUsers: number;
  usersToday: number;
  pendingReviews: number;
  pendingJobs: number;
  runningJobs: number;
}

export interface DashboardJobStats {
  totalJobs: number;
  successfulJobs: number;
  failedJobs: number;
  totalItemsScraped: number;
  avgDurationSeconds: number | null;
  periodDays: number;
}

export interface DashboardReviewItem {
  id: string;
  name: string;
  address: string;
  source: string;
  rating: number | null;
  status: string;
  createdAt: string;
}

/**
 * GET /api/admin/dashboard?days=N
 *
 * Real dashboard data for the admin console: live counts from the businesses,
 * users, pending_import_businesses, and scrape_jobs tables, job activity for
 * the trailing `days` window, the current review queue (top 5), and the most
 * recent scrape jobs.
 */
export async function GET(request: NextRequest) {
  const requireAdmin = createAuthMiddleware(['admin']);
  const authResult = await requireAdmin(request);
  if (!authResult.authenticated) {
    return createAuthErrorResponse(authResult.errorType!, authResult.errorMessage!);
  }

  try {
    const days = parseInt(request.nextUrl.searchParams.get('days') || '30', 10);

    if (isNaN(days) || days < 1 || days > 365) {
      return NextResponse.json(
        { error: 'Invalid days parameter. Must be between 1 and 365.' },
        { status: 400 }
      );
    }

    const client = await getPool().connect();
    try {
      // Core counts in a single round trip
      const countsResult = await client.query(
        `SELECT
           (SELECT COUNT(*) FROM businesses)::int AS total_businesses,
           (SELECT COUNT(*) FROM businesses
            WHERE created_at >= NOW() - make_interval(days => $1))::int AS new_businesses,
           (SELECT COUNT(*) FROM users)::int AS total_users,
           (SELECT COUNT(*) FROM users WHERE created_at >= CURRENT_DATE)::int AS users_today,
           (SELECT COUNT(*) FROM pending_import_businesses
            WHERE status = 'pending_review')::int AS pending_reviews,
           (SELECT COUNT(*) FROM scrape_jobs WHERE status = 'pending')::int AS pending_jobs,
           (SELECT COUNT(*) FROM scrape_jobs WHERE status = 'running')::int AS running_jobs`,
        [days]
      );
      const counts = countsResult.rows[0] as Record<string, number>;

      // Job activity for the trailing window
      const jobAgg = await client.query(
        `SELECT
           COUNT(*)::int AS total_jobs,
           COUNT(*) FILTER (WHERE status = 'completed')::int AS successful_jobs,
           COUNT(*) FILTER (WHERE status = 'failed')::int AS failed_jobs,
           COALESCE(SUM(business_count) FILTER (WHERE business_count IS NOT NULL), 0)::int AS total_items_scraped,
           AVG(EXTRACT(EPOCH FROM (completed_at - started_at))) FILTER (
             WHERE status = 'completed' AND started_at IS NOT NULL AND completed_at IS NOT NULL
           ) AS avg_duration
         FROM scrape_jobs
         WHERE created_at >= NOW() - make_interval(days => $1)`,
        [days]
      );
      const agg = jobAgg.rows[0] as {
        total_jobs: number;
        successful_jobs: number;
        failed_jobs: number;
        total_items_scraped: number;
        avg_duration: number | null;
      };

      // Current review queue (top 5, newest first per repository ordering)
      const pending = await findPendingByStatus(client, 'pending_review');
      const reviewQueue: DashboardReviewItem[] = pending.slice(0, 5).map((b) => {
        const sourceData = b.source_data as { source?: string; address?: string; rating?: number };
        return {
          id: b.id,
          name: b.name,
          address: sourceData?.address || 'N/A',
          source: sourceData?.source || 'unknown',
          rating: sourceData?.rating ?? null,
          status: b.status,
          createdAt: b.created_at.toISOString(),
        };
      });

      // Most recent scrape jobs
      const recentJobs = await findScrapeJobs(client, undefined, 5);

      return NextResponse.json({
        periodDays: days,
        counts: {
          totalBusinesses: Number(counts.total_businesses),
          newBusinesses: Number(counts.new_businesses),
          totalUsers: Number(counts.total_users),
          usersToday: Number(counts.users_today),
          pendingReviews: Number(counts.pending_reviews),
          pendingJobs: Number(counts.pending_jobs),
          runningJobs: Number(counts.running_jobs),
        },
        jobStats: {
          totalJobs: Number(agg.total_jobs),
          successfulJobs: Number(agg.successful_jobs),
          failedJobs: Number(agg.failed_jobs),
          totalItemsScraped: Number(agg.total_items_scraped),
          avgDurationSeconds: agg.avg_duration != null ? Math.round(agg.avg_duration) : null,
          periodDays: days,
        },
        reviewQueue,
        recentJobs,
      });
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Error building admin dashboard:', error);
    return NextResponse.json(
      { error: 'Failed to build dashboard' },
      { status: 500 }
    );
  }
}
