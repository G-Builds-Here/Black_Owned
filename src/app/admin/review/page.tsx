'use client';

import React, { useState, useEffect } from 'react';
import { Navigation } from '@/components/ui/Navigation';
import { Card, Badge, Button, Tabs, TabPanel } from '@/components/ui';

interface ScrapedBusiness {
  id: string;
  name: string;
  address: string;
  source: string;
  rating: number | null;
  category: string | null;
  phone: string | null;
  website: string | null;
  status: string;
  createdAt: {
    timestamp: number;
  };
}

const PENDING_BUSINESSES_QUERY = `
  query GetPendingBusinesses {
    pendingBusinesses {
      id
      name
      address
      source
      rating
      category
      phone
      website
      status
      createdAt {
        timestamp
      }
    }
  }
`;

const APPROVE_BUSINESS_MUTATION = `
  mutation ApproveBusiness($id: String!) {
    approveBusiness(id: $id) {
      success
      error
      business {
        id
        name
        categoryId
        verified
        createdAt {
          timestamp
        }
      }
    }
  }
`;

export default function AdminReviewPage() {
  const [activeTab, setActiveTab] = useState<'pending' | 'approved' | 'flagged'>('pending');
  const [pendingBusinesses, setPendingBusinesses] = useState<Business[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

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

  const handleApprove = async (businessId: string) => {
    try {
      const response = await fetch('/api/graphql', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query: APPROVE_BUSINESS_MUTATION,
          variables: { id: businessId },
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result = await response.json();

      if (result.errors) {
        throw new Error(result.errors[0].message);
      }

      const approveResult = result.data?.approveBusiness;
      if (approveResult?.success) {
        setSuccessMessage('Business approved successfully');
        // Remove the approved business from pending list
        setPendingBusinesses(prev => prev.filter(b => b.id !== businessId));
        // Clear success message after 3 seconds
        setTimeout(() => setSuccessMessage(null), 3000);
      } else {
        throw new Error(approveResult?.error || 'Failed to approve business');
      }
    } catch (err) {
      console.error('Failed to approve business:', err);
      setError(err instanceof Error ? err.message : 'Unknown error');
      setTimeout(() => setError(null), 5000);
    }
  };

  const handleReject = (businessId: string) => {
    console.log('Reject business:', businessId);
    // TODO: Implement rejection mutation
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

      {/* Success Message */}
      {successMessage && (
        <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-green-800">
            <p className="font-semibold">{successMessage}</p>
          </div>
        </section>
      )}

      {/* Error Message */}
      {error && (
        <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-800">
            <p className="font-semibold">Error</p>
            <p className="text-sm mt-1">{error}</p>
          </div>
        </section>
      )}

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
                <Card key={business.id} variant="outlined" padding="md">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <h3 className="font-semibold text-neutral-800">{business.name}</h3>
                        <Badge variant="warning" size="sm">Pending Review</Badge>
                      </div>
                      <div className="flex items-center gap-4 text-sm text-neutral-500">
                        <span>
                          <span className="font-medium">Source:</span> {business.source}
                        </span>
                        {business.rating !== null && (
                          <span>
                            <span className="font-medium">Rating:</span> {business.rating.toFixed(1)}
                          </span>
                        )}
                        <span>
                          <span className="font-medium">Submitted:</span> {formatDate(business.createdAt.timestamp)}
                        </span>
                      </div>
                      <p className="text-sm text-neutral-600 mt-2">
                        <span className="font-medium">Address:</span> {business.address}
                      </p>
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
    </main>
  );
}
