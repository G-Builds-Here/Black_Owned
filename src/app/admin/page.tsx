'use client';

import React, { useState } from 'react';
import { Navigation } from '@/components/ui/Navigation';
import { Card, Badge, Button, TabPanel, Input, Dropdown, DropdownItem, Tabs, UserTable } from '@/components/ui';

// Admin metrics data per AC requirements
const METRICS = {
  Users: 150,
  Businesses: 45,
  Reviews: 320,
  Unmoderated: 12,
  PendingVerifications: 3,
  NATS_Lag: 0,
};

const RECENT_BUSINESSES = [
  { id: '1', name: 'Soul Food Kitchen', status: 'pending', submitted: '2026-07-14' },
  { id: '2', name: 'Black Diamond Consulting', status: 'approved', submitted: '2026-07-13' },
  { id: '3', name: 'Afro Threads', status: 'pending', submitted: '2026-07-14' },
  { id: '4', name: 'Heritage Wellness Center', status: 'approved', submitted: '2026-07-12' },
  { id: '5', name: 'Golden Era Barbershop', status: 'flagged', submitted: '2026-07-11' },
];

const RECENT_REVIEWS = [
  { id: '1', business: 'Soul Food Kitchen', user: 'Marcus J.', rating: 5, date: '2026-07-14', status: 'pending' },
  { id: '2', business: 'Afro Threads', user: 'Tanya W.', rating: 4, date: '2026-07-14', status: 'pending' },
  { id: '3', business: 'Heritage Wellness', user: 'James P.', rating: 5, date: '2026-07-13', status: 'approved' },
  { id: '4', business: 'Soul Food Kitchen', user: 'Sarah M.', rating: 3, date: '2026-07-12', status: 'flagged' },
];

const NATS_METRICS = {
  activeConnections: 234,
  messagesPerSecond: 1250,
  pendingMessages: 45,
  subscriptions: 89,
  uptime: '99.97%',
  lastIncident: '2026-06-28',
};

const VERIFICATION_QUEUE = [
  { id: '1', business: 'Soul Food Kitchen', owner: 'Marcus Johnson', email: 'marcus@...', submitted: '2026-07-14', documents: ['business_license.pdf', 'tax_id.pdf'] },
  { id: '2', business: 'Afro Threads', owner: 'Tanya Williams', email: 'tanya@...', submitted: '2026-07-14', documents: ['business_license.pdf'] },
  { id: '3', business: 'Rhythm & Blues Records', owner: 'James Peterson', email: 'james@...', submitted: '2026-07-13', documents: ['business_license.pdf', 'insurance.pdf'] },
];

export default function AdminConsole() {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'users' | 'verifications' | 'moderation' | 'nats' | 'settings'>('dashboard');
  const [selectedPeriod, setSelectedPeriod] = useState('week');

  const handleApproveVerification = (id: string) => {
    console.log('Approve verification:', id);
  };

  const handleRejectVerification = (id: string) => {
    console.log('Reject verification:', id);
  };

  const handleApproveReview = (id: string) => {
    console.log('Approve review:', id);
  };

  const handleFlagReview = (id: string) => {
    console.log('Flag review:', id);
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, 'success' | 'warning' | 'error' | 'default'> = {
      approved: 'success',
      pending: 'warning',
      flagged: 'error',
    };
    return (
      <Badge variant={variants[status] || 'default'} size="sm">
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </Badge>
    );
  };

  // Metric card configuration with links to management sections
  const metricCards = [
    {
      key: 'Users',
      label: 'Users',
      value: METRICS.Users,
      icon: '👥',
      bgClass: 'bg-heritage-jade/10',
      linkTab: 'users',
      linkLabel: 'User Management',
    },
    {
      key: 'Businesses',
      label: 'Businesses',
      value: METRICS.Businesses,
      icon: '🏪',
      bgClass: 'bg-heritage-ochre/10',
      linkTab: 'verifications',
      linkLabel: 'Verification Queue',
    },
    {
      key: 'Reviews',
      label: 'Reviews',
      value: METRICS.Reviews,
      icon: '📝',
      bgClass: 'bg-heritage-royal/10',
      linkTab: null,
      linkLabel: null,
    },
    {
      key: 'Unmoderated',
      label: 'Unmoderated',
      value: METRICS.Unmoderated,
      icon: '⚠️',
      bgClass: 'bg-heritage-amber/10',
      linkTab: 'moderation',
      linkLabel: 'Moderation Queue',
      alert: true,
    },
    {
      key: 'PendingVerifications',
      label: 'Pending Verifications',
      value: METRICS.PendingVerifications,
      icon: '🔍',
      bgClass: 'bg-heritage-jade/10',
      linkTab: 'verifications',
      linkLabel: 'Verification Queue',
      alert: true,
    },
    {
      key: 'NATS_Lag',
      label: 'NATS Lag',
      value: METRICS.NATS_Lag,
      icon: '📡',
      bgClass: 'bg-heritage-jade/10',
      linkTab: 'nats',
      linkLabel: 'NATS Monitor',
      indicator: METRICS.NATS_Lag === 0 ? 'green' : 'red',
    },
  ];

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
                trigger={<span className="text-sm bg-white/10 px-3 py-1.5 rounded-lg">{selectedPeriod === 'week' ? 'This Week' : selectedPeriod === 'month' ? 'This Month' : 'Today'}</span>}
                items={[
                  { key: 'today', label: 'Today', onClick: () => setSelectedPeriod('today') },
                  { key: 'week', label: 'This Week', onClick: () => setSelectedPeriod('week') },
                  { key: 'month', label: 'This Month', onClick: () => setSelectedPeriod('month') },
                ]}
                position="bottom-end"
              />
              <Button variant="secondary" size="sm">
                Export Report
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Main Content */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Tabs */}
        <Tabs
          tabs={[
            { key: 'dashboard', label: 'Dashboard' },
            { key: 'users', label: 'User Management' },
            { key: 'verifications', label: `Verification Queue (${METRICS.Businesses})` },
            { key: 'moderation', label: `Moderation Queue (${METRICS.Unmoderated})` },
            { key: 'nats', label: 'NATS Monitor' },
            { key: 'settings', label: 'Settings' },
          ]}
          selectedKey={activeTab}
          onSelectionChange={(key) => setActiveTab(key as typeof activeTab)}
        />

        {/* Dashboard Tab */}
        <TabPanel value="dashboard" className="mt-6">
          {/* Metrics Grid - 6 cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
            {metricCards.map((metric) => (
              <Card
                key={metric.key}
                variant="elevated"
                padding="lg"
                className={metric.linkTab ? 'cursor-pointer hover:shadow-lg transition-shadow' : ''}
                onClick={metric.linkTab ? () => setActiveTab(metric.linkTab as typeof activeTab) : undefined}
              >
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <p className="text-sm text-neutral-500 mb-1">{metric.label}</p>
                    <p className="text-3xl font-bold text-neutral-800">{metric.value.toLocaleString()}</p>
                    {metric.alert && metric.value > 0 && (
                      <p className="text-sm text-heritage-amber mt-1">Needs attention</p>
                    )}
                    {metric.key === 'NATS_Lag' && (
                      <div className="flex items-center gap-2 mt-2">
                        <span
                          className={`inline-block w-2 h-2 rounded-full ${
                            metric.indicator === 'green' ? 'bg-heritage-jade' : 'bg-red-500'
                          }`}
                        />
                        <span className="text-sm text-neutral-500">
                          {metric.indicator === 'green' ? 'Operational' : 'Lagging'}
                        </span>
                      </div>
                    )}
                  </div>
                  <div className={`w-12 h-12 ${metric.bgClass} rounded-lg flex items-center justify-center`}>
                    <span className="text-2xl">{metric.icon}</span>
                  </div>
                </div>
                {metric.linkTab && (
                  <div className="mt-3 pt-3 border-t border-neutral-100">
                    <span className="text-xs text-heritage-royal font-medium">
                      → {metric.linkLabel}
                    </span>
                  </div>
                )}
              </Card>
            ))}
          </div>

          {/* NATS Monitoring Detail */}
          <div className="mb-8">
            <Card variant="elevated" padding="lg">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-bold text-neutral-800">NATS Monitoring</h2>
                <Badge variant="primary" size="sm">Operational</Badge>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
                <div className="text-center p-4 bg-neutral-50 rounded-lg">
                  <p className="text-sm text-neutral-500">Active Connections</p>
                  <p className="text-2xl font-bold text-neutral-800">{NATS_METRICS.activeConnections}</p>
                </div>
                <div className="text-center p-4 bg-neutral-50 rounded-lg">
                  <p className="text-sm text-neutral-500">Messages/Sec</p>
                  <p className="text-2xl font-bold text-neutral-800">{NATS_METRICS.messagesPerSecond.toLocaleString()}</p>
                </div>
                <div className="text-center p-4 bg-neutral-50 rounded-lg">
                  <p className="text-sm text-neutral-500">Pending Messages</p>
                  <p className="text-2xl font-bold text-neutral-800">{NATS_METRICS.pendingMessages}</p>
                </div>
                <div className="text-center p-4 bg-neutral-50 rounded-lg">
                  <p className="text-sm text-neutral-500">Subscriptions</p>
                  <p className="text-2xl font-bold text-neutral-800">{NATS_METRICS.subscriptions}</p>
                </div>
                <div className="text-center p-4 bg-neutral-50 rounded-lg">
                  <p className="text-sm text-neutral-500">Uptime</p>
                  <p className="text-2xl font-bold text-heritage-jade">{NATS_METRICS.uptime}</p>
                </div>
                <div className="text-center p-4 bg-neutral-50 rounded-lg">
                  <p className="text-sm text-neutral-500">Last Incident</p>
                  <p className="text-lg font-bold text-neutral-800">{NATS_METRICS.lastIncident}</p>
                </div>
              </div>
            </Card>
          </div>

          {/* Recent Activity */}
          <div className="grid md:grid-cols-2 gap-6">
            {/* Recent Businesses */}
            <Card variant="elevated" padding="lg">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-bold text-neutral-800">Recent Business Submissions</h3>
                <Button variant="ghost" size="sm">View All</Button>
              </div>
              <div className="space-y-3">
                {RECENT_BUSINESSES.map((business) => (
                  <div key={business.id} className="flex items-center justify-between p-3 bg-neutral-50 rounded-lg">
                    <div>
                      <p className="font-medium text-neutral-800">{business.name}</p>
                      <p className="text-sm text-neutral-500">Submitted: {business.submitted}</p>
                    </div>
                    {getStatusBadge(business.status)}
                  </div>
                ))}
              </div>
            </Card>

            {/* Recent Reviews */}
            <Card variant="elevated" padding="lg">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-bold text-neutral-800">Recent Reviews</h3>
                <Button variant="ghost" size="sm">View All</Button>
              </div>
              <div className="space-y-3">
                {RECENT_REVIEWS.map((review) => (
                  <div key={review.id} className="flex items-center justify-between p-3 bg-neutral-50 rounded-lg">
                    <div className="flex-1">
                      <p className="font-medium text-neutral-800">{review.business}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-sm text-neutral-500">{review.user}</span>
                        <span className="text-heritage-ochre">{'★'.repeat(review.rating)}</span>
                        <span className="text-sm text-neutral-500">{review.date}</span>
                      </div>
                    </div>
                    {getStatusBadge(review.status)}
                  </div>
                ))}
              </div>
            </Card>
          </div>
        </TabPanel>

        {/* User Management Tab */}
        <TabPanel value="users" className="mt-6">
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

        {/* Verification Queue Tab */}
        <TabPanel value="verifications" className="mt-6">
          <Card variant="elevated" padding="lg">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-neutral-800">Verification Queue</h2>
              <div className="flex gap-2">
                <Input placeholder="Search businesses..." className="text-sm" />
                <Button variant="secondary" size="sm">Filter</Button>
              </div>
            </div>
            <div className="space-y-4">
              {VERIFICATION_QUEUE.map((item) => (
                <Card key={item.id} variant="outlined" padding="md">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <h3 className="font-semibold text-neutral-800">{item.business}</h3>
                        <Badge variant="warning" size="sm">Pending</Badge>
                      </div>
                      <p className="text-sm text-neutral-600 mb-2">Owner: {item.owner}</p>
                      <p className="text-sm text-neutral-500 mb-3">Email: {item.email}</p>
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-neutral-500">Documents:</span>
                        {item.documents.map((doc) => (
                          <Badge key={doc} variant="default" size="sm">
                            {doc.replace('.pdf', '')}
                          </Badge>
                        ))}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button variant="primary" size="sm" onClick={() => handleApproveVerification(item.id)}>
                        Approve
                      </Button>
                      <Button variant="danger" size="sm" onClick={() => handleRejectVerification(item.id)}>
                        Reject
                      </Button>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          </Card>
        </TabPanel>

        {/* Moderation Queue Tab */}
        <TabPanel value="moderation" className="mt-6">
          <Card variant="elevated" padding="lg">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-neutral-800">Moderation Queue</h2>
              <div className="flex gap-2">
                <Input placeholder="Search reviews..." className="text-sm" />
                <Button variant="secondary" size="sm">Filter</Button>
              </div>
            </div>
            <div className="space-y-4">
              {RECENT_REVIEWS.filter((r) => r.status === 'pending').map((review) => (
                <Card key={review.id} variant="outlined" padding="md">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <h3 className="font-semibold text-neutral-800">{review.business}</h3>
                        <span className="text-heritage-ochre">{'★'.repeat(review.rating)}</span>
                        <Badge variant="warning" size="sm">Unmoderated</Badge>
                      </div>
                      <p className="text-sm text-neutral-600 mb-2">By: {review.user}</p>
                      <p className="text-sm text-neutral-500 mb-3">Date: {review.date}</p>
                    </div>
                    <div className="flex gap-2">
                      <Button variant="primary" size="sm" onClick={() => handleApproveReview(review.id)}>
                        Approve
                      </Button>
                      <Button variant="danger" size="sm" onClick={() => handleFlagReview(review.id)}>
                        Flag
                      </Button>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          </Card>
        </TabPanel>

        {/* NATS Monitor Tab */}
        <TabPanel value="nats" className="mt-6">
          <Card variant="elevated" padding="lg">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-neutral-800">NATS Message Bus Monitor</h2>
              <Badge variant="success" size="sm">Operational</Badge>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
              <div className="text-center p-4 bg-neutral-50 rounded-lg">
                <p className="text-sm text-neutral-500">Active Connections</p>
                <p className="text-2xl font-bold text-neutral-800">{NATS_METRICS.activeConnections}</p>
              </div>
              <div className="text-center p-4 bg-neutral-50 rounded-lg">
                <p className="text-sm text-neutral-500">Messages/Sec</p>
                <p className="text-2xl font-bold text-neutral-800">{NATS_METRICS.messagesPerSecond.toLocaleString()}</p>
              </div>
              <div className="text-center p-4 bg-neutral-50 rounded-lg">
                <p className="text-sm text-neutral-500">Pending Messages</p>
                <p className="text-2xl font-bold text-neutral-800">{NATS_METRICS.pendingMessages}</p>
              </div>
              <div className="text-center p-4 bg-neutral-50 rounded-lg">
                <p className="text-sm text-neutral-500">Subscriptions</p>
                <p className="text-2xl font-bold text-neutral-800">{NATS_METRICS.subscriptions}</p>
              </div>
              <div className="text-center p-4 bg-neutral-50 rounded-lg">
                <p className="text-sm text-neutral-500">Uptime</p>
                <p className="text-2xl font-bold text-heritage-jade">{NATS_METRICS.uptime}</p>
              </div>
              <div className="text-center p-4 bg-neutral-50 rounded-lg">
                <p className="text-sm text-neutral-500">Last Incident</p>
                <p className="text-lg font-bold text-neutral-800">{NATS_METRICS.lastIncident}</p>
              </div>
            </div>
            <div className="mt-6 p-4 bg-heritage-jade/10 rounded-lg">
              <div className="flex items-center gap-3">
                <span className="inline-block w-3 h-3 bg-heritage-jade rounded-full" />
                <span className="text-sm font-medium text-neutral-800">
                  NATS Lag: {METRICS.NATS_Lag}ms - System healthy
                </span>
              </div>
            </div>
          </Card>
        </TabPanel>

        {/* Settings Tab */}
        <TabPanel value="settings" className="mt-6">
          <Card variant="elevated" padding="lg">
            <h2 className="text-xl font-bold text-neutral-800 mb-6">Platform Settings</h2>
            <div className="space-y-6">
              <div>
                <h3 className="font-semibold text-neutral-800 mb-3">Moderation Settings</h3>
                <div className="space-y-3">
                  <label className="flex items-center gap-3">
                    <input type="checkbox" defaultChecked className="w-4 h-4" />
                    <span>Auto-flag reviews with suspicious patterns</span>
                  </label>
                  <label className="flex items-center gap-3">
                    <input type="checkbox" defaultChecked className="w-4 h-4" />
                    <span>Require document verification for new businesses</span>
                  </label>
                  <label className="flex items-center gap-3">
                    <input type="checkbox" className="w-4 h-4" />
                    <span>Enable automated spam detection</span>
                  </label>
                </div>
              </div>
              <div>
                <h3 className="font-semibold text-neutral-800 mb-3">Notification Settings</h3>
                <div className="space-y-3">
                  <label className="flex items-center gap-3">
                    <input type="checkbox" defaultChecked className="w-4 h-4" />
                    <span>Email alerts for pending verifications</span>
                  </label>
                  <label className="flex items-center gap-3">
                    <input type="checkbox" defaultChecked className="w-4 h-4" />
                    <span>Email alerts for flagged reviews</span>
                  </label>
                  <label className="flex items-center gap-3">
                    <input type="checkbox" className="w-4 h-4" />
                    <span>Weekly summary report</span>
                  </label>
                </div>
              </div>
              <div className="pt-4 border-t border-neutral-200">
                <Button variant="primary">Save Settings</Button>
              </div>
            </div>
          </Card>
        </TabPanel>
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
