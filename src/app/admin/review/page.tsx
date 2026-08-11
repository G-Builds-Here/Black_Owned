'use client';

import React, { useState, useEffect } from 'react';
import { Navigation } from '@/components/ui/Navigation';
import { Card, Badge, Button, Tabs, TabPanel } from '@/components/ui';

interface PendingBusiness {
  id: string;
  name: string;
  address: string;
  source: string;
  rating: number | null;
  createdAt: {
    timestamp: number;
  };
  categoryId?: string;
  verificationStatus?: string;
  phone?: string;
  website?: string;
}

const PENDING_BUSINESSES_QUERY = `
  query GetPendingBusinesses {
    pendingBusinesses {
      id
      name
      categoryId
      verificationStatus
      createdAt {
        timestamp
      }
    }
  }
`;

export default function AdminReviewPage() {
  const [activeTab, setActiveTab] = useState<'pending' | 'approved' | 'flagged'>('pending');
  const [pendingBusinesses, setPendingBusinesses] = useState<PendingBusiness[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedBusiness, setSelectedBusiness] = useState<PendingBusiness | null>(null);
  const [showDetailPanel, setShowDetailPanel] = useState(false);

  useEffect(() => {
    const fetchPendingBusinesses = async () => {
      try {
        const response = await fetch('/api/graphql', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            query: PENDING_BUSINESSES_QUERY,
          }),
        });

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        const result = await response.json();

        if (result.errors) {
          throw new Error(result.errors[0].message);
        }

        setPendingBusinesses(result.data?.pendingBusinesses || []);
      } catch (err) {
        console.error('Failed to fetch pending businesses:', err);
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setLoading(false);
      }
    };

    fetchPendingBusinesses();
  }, []);

  const formatDate = (timestamp: number) => {
    return new Date(timestamp * 1000).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const handleApprove = (businessId: string) => {
    console.log('Approve business:', businessId);
    // TODO: Implement approval mutation
  };

  const handleReject = (businessId: string) => {
    console.log('Reject business:', businessId);
    // TODO: Implement rejection mutation
  };

  const handleRowClick = (business: PendingBusiness) => {
    setSelectedBusiness(business);
    setShowDetailPanel(true);
  };

  const handleCloseDetailPanel = () => {
    setShowDetailPanel(false);
    setSelectedBusiness(null);
  };

  if (loading) {
    return (
      <main className="min-h-screen bg-neutral-50">
        <Navigation onNavigate={(section) => console.log('Navigate to:', section)} />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="text-center py-12">
            <div className="inline-block animate-spin rounded-full h-12 w-12 border-4 border-heritage-ochre border-t-transparent"></div>
            <p className="mt-4 text-neutral-600">Loading pending businesses...</p>
          </div>
        </div>
      </main>
    );
  }

  if (error) {
    return (
      <main className="min-h-screen bg-neutral-50">
        <Navigation onNavigate={(section) => console.log('Navigate to:', section)} />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-800">
            <p className="font-semibold">Error loading pending businesses</p>
            <p className="text-sm mt-1">{error}</p>
          </div>
        </div>
      </main>
    );
  }

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
              <h1 className="text-3xl font-bold mb-2">Business Review Queue</h1>
              <p className="text-neutral-100">Review and moderate pending business submissions</p>
            </div>
            <Badge variant="warning" size="lg">
              {pendingBusinesses.length} Pending
            </Badge>
          </div>
        </div>
      </section>

      {/* Main Content */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Tabs */}
        <Tabs
          tabs={[
            { key: 'pending', label: `Pending (${pendingBusinesses.length})` },
            { key: 'approved', label: 'Approved' },
            { key: 'flagged', label: 'Flagged' },
          ]}
          selectedKey={activeTab}
          onSelectionChange={(key) => setActiveTab(key as typeof activeTab)}
        />

        {/* Pending Tab */}
        <TabPanel value="pending" className="mt-6">
          {pendingBusinesses.length === 0 ? (
            <Card variant="elevated" padding="lg">
              <div className="text-center py-12">
                <div className="text-6xl mb-4">✓</div>
                <h3 className="text-2xl font-semibold text-neutral-800 mb-2">
                  No pending businesses
                </h3>
                <p className="text-neutral-600">
                  All businesses have been reviewed. Great job!
                </p>
              </div>
            </Card>
          ) : (
            <div className="space-y-4">
              {pendingBusinesses.map((business) => (
                <Card
                  key={business.id}
                  variant="outlined"
                  padding="md"
                  clickable
                  onClick={() => handleRowClick(business)}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <h3 className="font-semibold text-neutral-800">{business.name}</h3>
                        <Badge variant="warning" size="sm">Pending Review</Badge>
                      </div>
                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div>
                          <span className="font-medium text-neutral-600">Address:</span>
                          <p className="text-neutral-800 mt-1">{business.address}</p>
                        </div>
                        <div>
                          <span className="font-medium text-neutral-600">Source:</span>
                          <p className="text-neutral-800 mt-1">{business.source.replace('_', ' ').replace(/\b\w/g, (l) => l.toUpperCase())}</p>
                        </div>
                        <div>
                          <span className="font-medium text-neutral-600">Rating:</span>
                          <p className="text-neutral-800 mt-1">
                            {business.rating !== null ? (
                              <span className="text-heritage-ochre">{'★'.repeat(Math.round(business.rating))}{'☆'.repeat(5 - Math.round(business.rating))} ({business.rating.toFixed(1)})</span>
                            ) : (
                              'Not yet rated'
                            )}
                          </p>
                        </div>
                        <div>
                          <span className="font-medium text-neutral-600">Submitted:</span>
                          <p className="text-neutral-800 mt-1">{formatDate(business.createdAt.timestamp)}</p>
                        </div>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="primary"
                        size="sm"
                        onClick={() => handleApprove(business.id)}
                      >
                        Approve
                      </Button>
                      <Button
                        variant="danger"
                        size="sm"
                        onClick={() => handleReject(business.id)}
                      >
                        Reject
                      </Button>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </TabPanel>

        {/* Approved Tab - Placeholder */}
        <TabPanel value="approved" className="mt-6">
          <Card variant="elevated" padding="lg">
            <div className="text-center py-12">
              <div className="text-6xl mb-4">📋</div>
              <h3 className="text-2xl font-semibold text-neutral-800 mb-2">
                Approved Businesses
              </h3>
              <p className="text-neutral-600">
                Approved businesses will be displayed here.
              </p>
            </div>
          </Card>
        </TabPanel>

        {/* Flagged Tab - Placeholder */}
        <TabPanel value="flagged" className="mt-6">
          <Card variant="elevated" padding="lg">
            <div className="text-center py-12">
              <div className="text-6xl mb-4">🚩</div>
              <h3 className="text-2xl font-semibold text-neutral-800 mb-2">
                Flagged Businesses
              </h3>
              <p className="text-neutral-600">
                Flagged businesses requiring investigation will be displayed here.
              </p>
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

      {/* Detail Panel */}
      {showDetailPanel && selectedBusiness && (
        <div
          role="presentation"
          className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4"
          onClick={handleCloseDetailPanel}
        >
          <div
            className="bg-white rounded-lg shadow-xl max-w-3xl w-full max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="bg-neutral-900 text-white p-6 rounded-t-lg flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-bold">{selectedBusiness.name}</h2>
                <Badge variant="warning" size="sm" className="mt-2">
                  Pending Review
                </Badge>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleCloseDetailPanel}
              >
                Close
              </Button>
            </div>

            {/* Content */}
            <div className="p-6">
              <Tabs
                tabs={[
                  { key: 'basic', label: 'Basic Information' },
                  { key: 'source', label: 'Source Information' },
                  { key: 'data', label: 'Original Scraped Data' },
                ]}
                selectedKey="basic"
              >
                <TabPanel value="basic">
                  <div className="space-y-4">
                    <div>
                      <span className="font-medium text-neutral-600">ID:</span>
                      <p className="text-neutral-800 mt-1">{selectedBusiness.id}</p>
                    </div>
                    <div>
                      <span className="font-medium text-neutral-600">Name:</span>
                      <p className="text-neutral-800 mt-1">{selectedBusiness.name}</p>
                    </div>
                    <div>
                      <span className="font-medium text-neutral-600">Address:</span>
                      <p className="text-neutral-800 mt-1">{selectedBusiness.address}</p>
                    </div>
                    <div>
                      <span className="font-medium text-neutral-600">Category:</span>
                      <p className="text-neutral-800 mt-1">{selectedBusiness.categoryId}</p>
                    </div>
                    <div>
                      <span className="font-medium text-neutral-600">Phone:</span>
                      <p className="text-neutral-800 mt-1">{selectedBusiness.phone}</p>
                    </div>
                    <div>
                      <span className="font-medium text-neutral-600">Website:</span>
                      <p className="text-neutral-800 mt-1">{selectedBusiness.website}</p>
                    </div>
                    <div>
                      <span className="font-medium text-neutral-600">Rating:</span>
                      <p className="text-neutral-800 mt-1">
                        {selectedBusiness.rating !== null ? (
                          <span className="text-heritage-ochre">
                            {'★'.repeat(Math.round(selectedBusiness.rating))}
                            {'☆'.repeat(5 - Math.round(selectedBusiness.rating))}
                            ({selectedBusiness.rating.toFixed(1)})
                          </span>
                        ) : (
                          'Not yet rated'
                        )}
                      </p>
                    </div>
                    <div>
                      <span className="font-medium text-neutral-600">Status:</span>
                      <p className="text-neutral-800 mt-1">{selectedBusiness.verificationStatus}</p>
                    </div>
                    <div>
                      <span className="font-medium text-neutral-600">Submitted:</span>
                      <p className="text-neutral-800 mt-1">{formatDate(selectedBusiness.createdAt.timestamp)}</p>
                    </div>
                  </div>
                </TabPanel>

                <TabPanel value="source">
                  <div className="space-y-4">
                    <div>
                      <span className="font-medium text-neutral-600">Source:</span>
                      <p className="text-neutral-800 mt-1">{selectedBusiness.source}</p>
                    </div>
                    <div>
                      <span className="font-medium text-neutral-600">Scraped At:</span>
                      <p className="text-neutral-800 mt-1">
                        {formatDate(selectedBusiness.createdAt.timestamp)}
                      </p>
                    </div>
                  </div>
                </TabPanel>

                <TabPanel value="data">
                  <div>
                    <span className="font-medium text-neutral-600">Original Scraped Data:</span>
                    <pre className="bg-neutral-100 p-4 rounded-lg mt-2 overflow-x-auto text-sm">
                      {JSON.stringify(selectedBusiness, null, 2)}
                    </pre>
                  </div>
                </TabPanel>
              </Tabs>

              {/* Action Buttons */}
              <div className="flex gap-3 mt-6 pt-6 border-t border-neutral-200">
                <Button
                  variant="primary"
                  onClick={() => {
                    console.log('Approve:', selectedBusiness.id);
                    handleCloseDetailPanel();
                  }}
                >
                  Approve
                </Button>
                <Button
                  variant="danger"
                  onClick={() => {
                    console.log('Reject:', selectedBusiness.id);
                    handleCloseDetailPanel();
                  }}
                >
                  Reject
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
