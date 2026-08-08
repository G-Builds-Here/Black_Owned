'use client';

import { useState, useEffect } from 'react';
import { Card, Badge, Navigation } from '@/components/ui';

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

export default function AnalyticsPage() {
  const [stats, setStats] = useState<ScrapeJobStats | null>(null);
  const [recentJobs, setRecentJobs] = useState<ScrapeJob[]>([]);
  const [periodDays, setPeriodDays] = useState(30);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchStats = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/analytics/scrape-jobs?days=${periodDays}`);
      if (!response.ok) throw new Error('Failed to fetch stats');
      const data = await response.json();
      setStats(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  const fetchRecentJobs = async () => {
    try {
      const response = await fetch('/api/analytics/scrape-jobs/recent?limit=10');
      if (!response.ok) throw new Error('Failed to fetch recent jobs');
      const data = await response.json();
      setRecentJobs(data);
    } catch (err) {
      console.error('Failed to fetch recent jobs:', err);
    }
  };

  useEffect(() => {
    fetchStats();
    fetchRecentJobs();
  }, [periodDays]);

  const handlePeriodChange = (days: number) => {
    setPeriodDays(days);
  };

  const formatDateTime = (dateStr: string) => {
    return new Date(dateStr).toLocaleString();
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'success': return 'bg-green-100 text-green-800';
      case 'failed': return 'bg-red-100 text-red-800';
      case 'running': return 'bg-yellow-100 text-yellow-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const successRate = stats && stats.totalJobs > 0
    ? ((stats.successfulJobs / stats.totalJobs) * 100).toFixed(1)
    : '0.0';

  const formatDuration = (seconds: number | null) => {
    if (seconds === null) return 'N/A';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    if (mins > 0) {
      return `${mins}m ${secs}s`;
    }
    return `${secs}s`;
  };

  return (
    <main className="min-h-screen bg-neutral-50">
      <Navigation onNavigate={(section) => console.log('Navigate to:', section)} />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-neutral-900 mb-2">Scrape Job Analytics</h1>
          <p className="text-neutral-600">Monitor web scraping operations and success rates</p>
        </div>

        {/* Period Selector */}
        <div className="mb-6 flex gap-2">
          {[7, 14, 30, 90].map((days) => (
            <button
              key={days}
              onClick={() => handlePeriodChange(days)}
              className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                periodDays === days
                  ? 'bg-heritage-ochre text-white'
                  : 'bg-white text-neutral-700 hover:bg-neutral-100'
              }`}
            >
              Last {days} days
            </button>
          ))}
        </div>

        {/* Error Display */}
        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-red-800">Error: {error}</p>
          </div>
        )}

        {/* Loading State */}
        {loading && !stats && (
          <div className="flex justify-center items-center py-12" role="status">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-heritage-ochre"></div>
          </div>
        )}

        {/* Stats Cards */}
        {stats && (
          <>
            <div className="grid grid-cols-1 md:grid-cols-6 gap-6 mb-8">
              <Card variant="elevated" padding="lg">
                <div className="text-center">
                  <p className="text-sm text-neutral-600 mb-2">Total Jobs</p>
                  <p className="text-4xl font-bold text-neutral-900">{stats.totalJobs}</p>
                  <p className="text-xs text-neutral-500 mt-1">Last {stats.periodDays} days</p>
                </div>
              </Card>

              <Card variant="elevated" padding="lg">
                <div className="text-center">
                  <p className="text-sm text-neutral-600 mb-2">Successful</p>
                  <p className="text-4xl font-bold text-green-600">{stats.successfulJobs}</p>
                  <p className="text-xs text-neutral-500 mt-1">{successRate}% success rate</p>
                </div>
              </Card>

              <Card variant="elevated" padding="lg">
                <div className="text-center">
                  <p className="text-sm text-neutral-600 mb-2">Failed</p>
                  <p className="text-4xl font-bold text-red-600">{stats.failedJobs}</p>
                  <p className="text-xs text-neutral-500 mt-1">Requires attention</p>
                </div>
              </Card>

              <Card variant="elevated" padding="lg">
                <div className="text-center">
                  <p className="text-sm text-neutral-600 mb-2">Items Scraped</p>
                  <p className="text-4xl font-bold text-heritage-ochre">{stats.totalItemsScraped.toLocaleString()}</p>
                  <p className="text-xs text-neutral-500 mt-1">Total records</p>
                </div>
              </Card>

              <Card variant="elevated" padding="lg">
                <div className="text-center">
                  <p className="text-sm text-neutral-600 mb-2">Businesses Scraped</p>
                  <p className="text-4xl font-bold text-blue-600">{stats.totalBusinessesScraped.toLocaleString()}</p>
                  <p className="text-xs text-neutral-500 mt-1">From completed jobs</p>
                </div>
              </Card>

              <Card variant="elevated" padding="lg">
                <div className="text-center">
                  <p className="text-sm text-neutral-600 mb-2">Businesses Imported</p>
                  <p className="text-4xl font-bold text-purple-600">{stats.totalBusinessesImported.toLocaleString()}</p>
                  <p className="text-xs text-neutral-500 mt-1">{stats.importRate.toFixed(1)}% import rate</p>
                </div>
              </Card>
            </div>

            {/* Duration Metrics */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
              <Card variant="elevated" padding="lg">
                <div className="text-center">
                  <p className="text-sm text-neutral-600 mb-2">Avg Duration</p>
                  <p className="text-4xl font-bold text-blue-600">{formatDuration(stats.avgDurationSeconds)}</p>
                  <p className="text-xs text-neutral-500 mt-1">Completed jobs only</p>
                </div>
              </Card>

              <Card variant="elevated" padding="lg">
                <div className="text-center">
                  <p className="text-sm text-neutral-600 mb-2">Min Duration</p>
                  <p className="text-4xl font-bold text-purple-600">{formatDuration(stats.minDurationSeconds)}</p>
                  <p className="text-xs text-neutral-500 mt-1">Fastest job</p>
                </div>
              </Card>

              <Card variant="elevated" padding="lg">
                <div className="text-center">
                  <p className="text-sm text-neutral-600 mb-2">Max Duration</p>
                  <p className="text-4xl font-bold text-orange-600">{formatDuration(stats.maxDurationSeconds)}</p>
                  <p className="text-xs text-neutral-500 mt-1">Longest job</p>
                </div>
              </Card>
            </div>

            {/* Duration Metrics */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
              <Card variant="elevated" padding="lg">
                <div className="text-center">
                  <p className="text-sm text-neutral-600 mb-2">Avg Duration</p>
                  <p className="text-4xl font-bold text-blue-600">{formatDuration(stats.avgDurationSeconds)}</p>
                  <p className="text-xs text-neutral-500 mt-1">Completed jobs only</p>
                </div>
              </Card>

              <Card variant="elevated" padding="lg">
                <div className="text-center">
                  <p className="text-sm text-neutral-600 mb-2">Min Duration</p>
                  <p className="text-4xl font-bold text-purple-600">{formatDuration(stats.minDurationSeconds)}</p>
                  <p className="text-xs text-neutral-500 mt-1">Fastest job</p>
                </div>
              </Card>

              <Card variant="elevated" padding="lg">
                <div className="text-center">
                  <p className="text-sm text-neutral-600 mb-2">Max Duration</p>
                  <p className="text-4xl font-bold text-orange-600">{formatDuration(stats.maxDurationSeconds)}</p>
                  <p className="text-xs text-neutral-500 mt-1">Longest job</p>
                </div>
              </Card>
            </div>

            {/* Recent Jobs Table */}
            <Card variant="elevated" padding="lg" className="mb-8">
              <h2 className="text-xl font-semibold mb-4">Recent Jobs</h2>
              {recentJobs.length === 0 ? (
                <p className="text-neutral-500 text-center py-8">No scrape jobs recorded yet</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-neutral-200">
                        <th className="text-left py-2 px-4 font-medium text-neutral-600">Job Name</th>
                        <th className="text-left py-2 px-4 font-medium text-neutral-600">Target</th>
                        <th className="text-left py-2 px-4 font-medium text-neutral-600">Status</th>
                        <th className="text-left py-2 px-4 font-medium text-neutral-600">Items</th>
                        <th className="text-left py-2 px-4 font-medium text-neutral-600">Started</th>
                      </tr>
                    </thead>
                    <tbody>
                      {recentJobs.map((job) => (
                        <tr key={job.id} className="border-b border-neutral-100 hover:bg-neutral-50">
                          <td className="py-3 px-4 font-medium">{job.jobName}</td>
                          <td className="py-3 px-4 text-neutral-600 truncate max-w-xs">{job.targetUrl}</td>
                          <td className="py-3 px-4">
                            <Badge
                              variant={job.status === 'success' ? 'primary' : job.status === 'failed' ? 'secondary' : 'tertiary'}
                              size="sm"
                            >
                              {job.status}
                            </Badge>
                          </td>
                          <td className="py-3 px-4 text-neutral-600">{job.itemsScraped}</td>
                          <td className="py-3 px-4 text-neutral-500 text-sm">{formatDateTime(job.startedAt)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          </>
        )}
      </div>
    </main>
  );
}
