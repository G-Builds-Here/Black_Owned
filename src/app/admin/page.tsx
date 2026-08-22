'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Navigation } from '@/components/ui/Navigation';
import { getSession, clearSession, authHeaders } from '@/lib/auth/client-session';
import { Card, Badge, Button, TabPanel, Input, Dropdown, Tabs, TabContent, UserTable } from '@/components/ui';

interface DashboardCounts {
  totalBusinesses: number;
  newBusinesses: number;
  totalUsers: number;
  usersToday: number;
  pendingReviews: number;
  pendingJobs: number;
  runningJobs: number;
}

interface DashboardJobStats {
  totalJobs: number;
  successfulJobs: number;
  failedJobs: number;
  totalItemsScraped: number;
  avgDurationSeconds: number | null;
  periodDays: number;
}

interface DashboardReviewItem {
  id: string;
  name: string;
  address: string;
  source: string;
  rating: number | null;
  status: string;
  createdAt: string;
}

interface DashboardData {
  periodDays: number;
  counts: DashboardCounts;
  jobStats: DashboardJobStats;
  reviewQueue: DashboardReviewItem[];
  recentJobs: ScrapeJob[];
}

interface ScrapeJob {
  id: string;
  source: string;
  query: string;
  location: string;
  status: string;
  businessCount?: number;
  errorMessage?: string;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
}

interface PendingBusiness {
  id: string;
  name: string;
  address: string;
  source: string;
  rating: number | null;
  status: string;
  createdAt: string;
  description?: string;
  categoryId?: string;
  sourceData?: Record<string, unknown>;
}

const PERIOD_DAYS: Record<'today' | 'week' | 'month', number> = {
  today: 1,
  week: 7,
  month: 30,
};

const PERIOD_LABELS: Record<'today' | 'week' | 'month', string> = {
  today: 'Today',
  week: 'This Week',
  month: 'This Month',
};

function statusVariant(status: string): 'success' | 'warning' | 'error' | 'default' {
  const variants: Record<string, 'success' | 'warning' | 'error' | 'default'> = {
    pending_review: 'warning',
    pending: 'warning',
    running: 'warning',
    completed: 'success',
    approved: 'success',
    verified: 'success',
    failed: 'error',
    rejected: 'error',
    flagged: 'error',
    cancelled: 'default',
  };
  return variants[status] || 'default';
}

function StatusBadge({ status }: { status: string }) {
  const label = status
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
  return (
    <Badge variant={statusVariant(status)} size="sm">
      {label}
    </Badge>
  );
}

function formatDate(value: string): string {
  const date = new Date(value);
  return isNaN(date.getTime()) ? value : date.toLocaleDateString();
}

function formatDuration(seconds: number | null): string {
  if (seconds == null) return '—';
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return minutes > 0 ? `${minutes}m ${rest}s` : `${rest}s`;
}

export default function AdminConsole() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<'dashboard' | 'reviews' | 'jobs' | 'users'>('dashboard');
  const [selectedPeriod, setSelectedPeriod] = useState<'today' | 'week' | 'month'>('week');

  const [data, setData] = useState<DashboardData | null>(null);
  const [dashboardError, setDashboardError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [queue, setQueue] = useState<PendingBusiness[]>([]);
  const [queueLoaded, setQueueLoaded] = useState(false);
  const [queueError, setQueueError] = useState<string | null>(null);

  const [jobs, setJobs] = useState<ScrapeJob[]>([]);
  const [jobsLoaded, setJobsLoaded] = useState(false);
  const [jobsError, setJobsError] = useState<string | null>(null);

  const [busyId, setBusyId] = useState<string | null>(null);
  const [rejectFor, setRejectFor] = useState<PendingBusiness | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [actionMessage, setActionMessage] = useState<{ success: boolean; message: string } | null>(null);

  useEffect(() => {
    const session = getSession();
    if (!session) {
      router.replace('/login');
      return;
    }
    if (session.user.role !== 'admin') {
      router.replace('/owner');
    }
  }, [router]);

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    setDashboardError(null);
    try {
      const response = await fetch(`/api/admin/dashboard?days=${PERIOD_DAYS[selectedPeriod]}`, {
        headers: authHeaders(),
      });
      if (response.status === 401) {
        clearSession();
        router.replace('/login');
        return;
      }
      if (!response.ok) throw new Error('Failed to load dashboard data');
      const body: DashboardData = await response.json();
      setData(body);
    } catch (error) {
      console.error('Failed to load dashboard:', error);
      setDashboardError('Could not load dashboard data');
    } finally {
      setLoading(false);
    }
  }, [selectedPeriod, router]);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  useEffect(() => {
    if (activeTab !== 'reviews' || queueLoaded) return;
    let cancelled = false;
    (async () => {
      try {
        const response = await fetch('/api/pending-businesses', { headers: authHeaders() });
        if (response.status === 401) {
          clearSession();
          router.replace('/login');
          return;
        }
        if (!response.ok) throw new Error('Failed to load review queue');
        const body: PendingBusiness[] = await response.json();
        if (!cancelled) setQueue(Array.isArray(body) ? body : []);
      } catch (error) {
        console.error('Failed to load review queue:', error);
        if (!cancelled) setQueueError('Failed to load the review queue');
      } finally {
        if (!cancelled) setQueueLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [activeTab, queueLoaded]);

  useEffect(() => {
    if (activeTab !== 'jobs' || jobsLoaded) return;
    let cancelled = false;
    (async () => {
      try {
        const response = await fetch('/api/scrape-jobs', { headers: authHeaders() });
        if (response.status === 401) {
          clearSession();
          router.replace('/login');
          return;
        }
        if (!response.ok) throw new Error('Failed to load jobs');
        const body = await response.json();
        if (!cancelled) setJobs(Array.isArray(body?.data) ? body.data : []);
      } catch (error) {
        console.error('Failed to load jobs:', error);
        if (!cancelled) setJobsError('Failed to load scrape jobs');
      } finally {
        if (!cancelled) setJobsLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [activeTab, jobsLoaded]);

  const handleApprove = async (business: PendingBusiness) => {
    if (busyId) return;
    setBusyId(business.id);
    setActionMessage(null);
    try {
      const response = await fetch(`/api/businesses/${business.id}/approve`, {
        method: 'POST',
        headers: authHeaders(),
      });
      const result = await response.json();
      if (result.success) {
        setActionMessage({ success: true, message: `${business.name} approved` });
        setQueue((prev) => prev.filter((b) => b.id !== business.id));
        setRejectFor(null);
        loadDashboard();
      } else {
        setActionMessage({ success: false, message: result.error || 'Failed to approve business' });
      }
    } catch (error) {
      setActionMessage({
        success: false,
        message: error instanceof Error ? error.message : 'An unexpected error occurred',
      });
    } finally {
      setBusyId(null);
    }
  };

  const handleConfirmReject = async () => {
    if (!rejectFor || busyId || !rejectReason.trim()) return;
    const business = rejectFor;
    setBusyId(business.id);
    setActionMessage(null);
    try {
      const response = await fetch(`/api/businesses/${business.id}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ reason: rejectReason.trim() }),
      });
      const result = await response.json();
      if (result.success) {
        setActionMessage({ success: true, message: `${business.name} rejected` });
        setQueue((prev) => prev.filter((b) => b.id !== business.id));
        setRejectFor(null);
        setRejectReason('');
        loadDashboard();
      } else {
        setActionMessage({ success: false, message: result.error || 'Failed to reject business' });
      }
    } catch (error) {
      setActionMessage({
        success: false,
        message: error instanceof Error ? error.message : 'An unexpected error occurred',
      });
    } finally {
      setBusyId(null);
    }
  };

  return (
    <main className="min-h-screen bg-neutral-50">
      {/* Navigation */}
      <Navigation
        onNavigate={(section) => {
          console.log('Navigate to:', section);
        }}
      />

      {/* Header */}
      <section className="bg-gradient-to-br from-heritage-midnight via-heritage-royal to-heritage-forest text-white py-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold mb-2">Admin Console</h1>
              <p className="text-neutral-100">Monitor, moderate, and manage the Black Owned platform</p>
            </div>
            <div className="flex items-center gap-3">
              <Dropdown
                trigger={<span className="text-sm bg-white/10 px-3 py-1.5 rounded-lg">{PERIOD_LABELS[selectedPeriod]}</span>}
                items={[
                  { key: 'today', label: 'Today', onClick: () => setSelectedPeriod('today') },
                  { key: 'week', label: 'This Week', onClick: () => setSelectedPeriod('week') },
                  { key: 'month', label: 'This Month', onClick: () => setSelectedPeriod('month') },
                ]}
                position="bottom-end"
              />
            </div>
          </div>
        </div>
      </section>

      {/* Main Content */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Tabs
          tabs={[
            { key: 'dashboard', label: 'Dashboard' },
            { key: 'reviews', label: data ? `Review Queue (${data.counts.pendingReviews})` : 'Review Queue' },
            { key: 'jobs', label: 'Jobs' },
            { key: 'users', label: 'User Management' },
          ]}
          selectedKey={activeTab}
          onSelectionChange={(key) => setActiveTab(key as typeof activeTab)}
        >
          <TabContent>
            {/* Dashboard Tab */}
            <TabPanel value="dashboard" className="mt-4">
              {loading && <p className="text-neutral-500 py-8 text-center">Loading dashboard...</p>}
              {!loading && dashboardError && (
                <Card variant="elevated" padding="lg">
                  <div className="flex items-center justify-between">
                    <p className="text-red-700">{dashboardError}</p>
                    <Button variant="secondary" size="sm" onClick={loadDashboard}>
                      Retry
                    </Button>
                  </div>
                </Card>
              )}
              {!loading && !dashboardError && data && (
                <>
                  {/* Metrics Grid */}
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
                    <Card variant="elevated" padding="lg">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm text-neutral-500 mb-1">Total Businesses</p>
                          <p className="text-3xl font-bold text-neutral-800">{data.counts.totalBusinesses.toLocaleString()}</p>
                          <p className="text-sm text-heritage-jade mt-1">+{data.counts.newBusinesses} in {PERIOD_LABELS[selectedPeriod].toLowerCase()}</p>
                        </div>
                        <div className="w-12 h-12 bg-heritage-ochre/10 rounded-lg flex items-center justify-center">
                          <span className="text-2xl">🏪</span>
                        </div>
                      </div>
                    </Card>

                    <Card variant="elevated" padding="lg">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm text-neutral-500 mb-1">Pending Reviews</p>
                          <p className="text-3xl font-bold text-neutral-800">{data.counts.pendingReviews}</p>
                          <p className={`text-sm mt-1 ${data.counts.pendingReviews > 0 ? 'text-heritage-amber' : 'text-heritage-jade'}`}>
                            {data.counts.pendingReviews > 0 ? 'Needs attention' : 'Queue is clear'}
                          </p>
                        </div>
                        <div className="w-12 h-12 bg-heritage-amber/10 rounded-lg flex items-center justify-center">
                          <span className="text-2xl">📝</span>
                        </div>
                      </div>
                    </Card>

                    <Card variant="elevated" padding="lg">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm text-neutral-500 mb-1">Total Users</p>
                          <p className="text-3xl font-bold text-neutral-800">{data.counts.totalUsers.toLocaleString()}</p>
                          <p className="text-sm text-heritage-jade mt-1">+{data.counts.usersToday} signed up today</p>
                        </div>
                        <div className="w-12 h-12 bg-heritage-jade/10 rounded-lg flex items-center justify-center">
                          <span className="text-2xl">👥</span>
                        </div>
                      </div>
                    </Card>

                    <Card variant="elevated" padding="lg">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm text-neutral-500 mb-1">Scrape Jobs</p>
                          <p className="text-3xl font-bold text-neutral-800">{data.counts.runningJobs}</p>
                          <p className="text-sm text-neutral-500 mt-1">{data.counts.pendingJobs} queued</p>
                        </div>
                        <div className="w-12 h-12 bg-heritage-royal/10 rounded-lg flex items-center justify-center">
                          <span className="text-2xl">📈</span>
                        </div>
                      </div>
                    </Card>
                  </div>

                  {/* Job Activity */}
                  <div className="mb-8">
                    <Card variant="elevated" padding="lg">
                      <div className="flex items-center justify-between mb-6">
                        <h2 className="text-xl font-bold text-neutral-800">Job Activity</h2>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => window.location.assign('/admin/scrape')}
                        >
                          View all
                        </Button>
                      </div>
                      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
                        <div className="text-center p-4 bg-neutral-50 rounded-lg">
                          <p className="text-sm text-neutral-500">Jobs ({PERIOD_LABELS[selectedPeriod]})</p>
                          <p className="text-2xl font-bold text-neutral-800">{data.jobStats.totalJobs}</p>
                        </div>
                        <div className="text-center p-4 bg-neutral-50 rounded-lg">
                          <p className="text-sm text-neutral-500">Successful</p>
                          <p className="text-2xl font-bold text-heritage-jade">{data.jobStats.successfulJobs}</p>
                        </div>
                        <div className="text-center p-4 bg-neutral-50 rounded-lg">
                          <p className="text-sm text-neutral-500">Failed</p>
                          <p className="text-2xl font-bold text-neutral-800">{data.jobStats.failedJobs}</p>
                        </div>
                        <div className="text-center p-4 bg-neutral-50 rounded-lg">
                          <p className="text-sm text-neutral-500">Items Scraped</p>
                          <p className="text-2xl font-bold text-neutral-800">{data.jobStats.totalItemsScraped}</p>
                        </div>
                        <div className="text-center p-4 bg-neutral-50 rounded-lg">
                          <p className="text-sm text-neutral-500">Avg Duration</p>
                          <p className="text-2xl font-bold text-neutral-800">{formatDuration(data.jobStats.avgDurationSeconds)}</p>
                        </div>
                      </div>
                    </Card>
                  </div>

                  {/* Queues */}
                  <div className="grid md:grid-cols-2 gap-6">
                    <Card variant="elevated" padding="lg">
                      <div className="flex items-center justify-between mb-4">
                        <h3 className="text-lg font-bold text-neutral-800">Review Queue</h3>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => window.location.assign('/admin/reviews')}
                        >
                          View all
                        </Button>
                      </div>
                      <div className="space-y-3">
                        {data.reviewQueue.length === 0 ? (
                          <p className="text-sm text-neutral-500 py-4 text-center">No businesses pending review</p>
                        ) : (
                          data.reviewQueue.map((business) => (
                            <div key={business.id} className="flex items-center justify-between p-3 bg-neutral-50 rounded-lg">
                              <div>
                                <p className="font-medium text-neutral-800">{business.name}</p>
                                <p className="text-sm text-neutral-500">
                                  {business.address} · {business.source} · {formatDate(business.createdAt)}
                                </p>
                              </div>
                              <StatusBadge status={business.status} />
                            </div>
                          ))
                        )}
                      </div>
                    </Card>

                    <Card variant="elevated" padding="lg">
                      <div className="flex items-center justify-between mb-4">
                        <h3 className="text-lg font-bold text-neutral-800">Recent Jobs</h3>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => window.location.assign('/admin/scrape')}
                        >
                          View all
                        </Button>
                      </div>
                      <div className="space-y-3">
                        {data.recentJobs.length === 0 ? (
                          <p className="text-sm text-neutral-500 py-4 text-center">No scrape jobs yet</p>
                        ) : (
                          data.recentJobs.map((job) => (
                            <div key={job.id} className="flex items-center justify-between p-3 bg-neutral-50 rounded-lg">
                              <div>
                                <p className="font-medium text-neutral-800 truncate max-w-xs">{job.query}</p>
                                <p className="text-sm text-neutral-500">
                                  {job.source} · {job.location} · {formatDate(job.createdAt)}
                                </p>
                              </div>
                              <StatusBadge status={job.status} />
                            </div>
                          ))
                        )}
                      </div>
                    </Card>
                  </div>
                </>
              )}
            </TabPanel>

            {/* Review Queue Tab */}
            <TabPanel value="reviews" className="mt-4">
              <Card variant="elevated" padding="lg">
                <div className="flex items-center justify-between mb-6">
                  <div>
                    <h2 className="text-xl font-bold text-neutral-800">Review Queue</h2>
                    <p className="text-sm text-neutral-500 mt-1">
                      Businesses awaiting a decision. Full details live in the
                      <a
                        href="/admin/reviews"
                        className="text-heritage-royal hover:underline ml-1"
                      >
                        review page
                      </a>
                    </p>
                  </div>
                </div>

                {actionMessage && (
                  <div className={`mb-4 p-3 rounded-lg ${actionMessage.success ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                    <p className="text-sm font-medium">{actionMessage.message}</p>
                  </div>
                )}

                {queueError ? (
                  <p className="text-red-700 text-sm py-4 text-center">{queueError}</p>
                ) : queue.length === 0 ? (
                  <p className="text-sm text-neutral-500 py-4 text-center">
                    {queueLoaded ? 'No businesses pending review' : 'Loading review queue...'}
                  </p>
                ) : (
                  <div className="space-y-4">
                    {queue.map((business) => (
                      <div key={business.id} className="border border-neutral-200 rounded-lg p-4">
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1">
                            <div className="flex items-center gap-3 mb-1">
                              <h3 className="font-semibold text-neutral-800">{business.name}</h3>
                              <Badge variant="default" size="sm">{business.source}</Badge>
                            </div>
                            <p className="text-sm text-neutral-600 mb-1">{business.address}</p>
                            <p className="text-sm text-neutral-500">
                              {business.rating != null ? `Rating: ${business.rating.toFixed(1)} · ` : ''}
                              Submitted {formatDate(business.createdAt)}
                            </p>
                          </div>
                          <div className="flex gap-2 shrink-0">
                            <Button
                              variant="primary"
                              size="sm"
                              disabled={busyId !== null}
                              onClick={() => handleApprove(business)}
                            >
                              Approve
                            </Button>
                            <Button
                              variant="danger"
                              size="sm"
                              disabled={busyId !== null}
                              onClick={() => {
                                setRejectFor(rejectFor?.id === business.id ? null : business);
                                setRejectReason('');
                              }}
                            >
                              Reject
                            </Button>
                          </div>
                        </div>
                        {rejectFor?.id === business.id && (
                          <div className="mt-3 bg-red-50 border border-red-200 rounded-lg p-4">
                            <Input
                              label="Rejection reason"
                              placeholder="Why is this business being rejected?"
                              value={rejectReason}
                              onChange={(e) => setRejectReason(e.target.value)}
                              maxLength={500}
                              disabled={busyId !== null}
                            />
                            <div className="flex justify-end gap-3 mt-3">
                              <Button
                                variant="secondary"
                                size="sm"
                                onClick={() => {
                                  setRejectFor(null);
                                  setRejectReason('');
                                }}
                                disabled={busyId !== null}
                              >
                                Cancel
                              </Button>
                              <Button
                                variant="danger"
                                size="sm"
                                onClick={handleConfirmReject}
                                disabled={busyId !== null || !rejectReason.trim()}
                              >
                                {busyId === business.id ? 'Rejecting...' : 'Confirm Reject'}
                              </Button>
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            </TabPanel>

            {/* Jobs Tab */}
            <TabPanel value="jobs" className="mt-4">
              <Card variant="elevated" padding="lg">
                <div className="flex items-center justify-between mb-6">
                  <div>
                    <h2 className="text-xl font-bold text-neutral-800">Scrape Jobs</h2>
                    <p className="text-sm text-neutral-500 mt-1">
                      Create and cancel jobs on the
                      <a
                        href="/admin/scrape"
                        className="text-heritage-royal hover:underline ml-1"
                      >
                        scrape page
                      </a>
                    </p>
                  </div>
                </div>

                {jobsError ? (
                  <p className="text-red-700 text-sm py-4 text-center">{jobsError}</p>
                ) : jobs.length === 0 ? (
                  <p className="text-sm text-neutral-500 py-4 text-center">
                    {jobsLoaded ? 'No scrape jobs yet' : 'Loading jobs...'}
                  </p>
                ) : (
                  <div className="space-y-3">
                    {jobs.map((job) => (
                      <div key={job.id} className="flex items-center justify-between p-3 bg-neutral-50 rounded-lg">
                        <div className="min-w-0">
                          <p className="font-medium text-neutral-800 truncate">{job.query}</p>
                          <p className="text-sm text-neutral-500 truncate">
                            {job.source} · {job.location} · {formatDate(job.createdAt)}
                            {job.businessCount != null ? ` · ${job.businessCount} businesses` : ''}
                          </p>
                          {job.errorMessage && (
                            <p className="text-xs text-red-700 mt-1 truncate">{job.errorMessage}</p>
                          )}
                        </div>
                        <StatusBadge status={job.status} />
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            </TabPanel>

            {/* User Management Tab */}
            <TabPanel value="users" className="mt-4">
              <Card variant="elevated" padding="lg">
                <div className="flex items-center justify-between mb-6">
                  <div>
                    <h2 className="text-xl font-bold text-neutral-800">User Management</h2>
                    <p className="text-sm text-neutral-500 mt-1">View and manage user roles</p>
                  </div>
                </div>
                <UserTable adminUser="admin" />
              </Card>
            </TabPanel>
          </TabContent>
        </Tabs>
      </section>

      {/* Footer */}
      <footer className="bg-neutral-950 text-neutral-400 py-12 mt-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center text-sm">
            <p>&copy; 2026 Black Owned Admin Console. All rights reserved.</p>
          </div>
        </div>
      </footer>
    </main>
  );
}
