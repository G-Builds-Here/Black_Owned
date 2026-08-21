'use client';

import React, { useState } from 'react';
import { Navigation } from '@/components/ui/Navigation';
import { Card, Badge, Button, Tabs, Input, Table, TableHeader, TableColumn, TableBody, TableRow, TableCell, Dropdown, DropdownItem, Modal } from '@/components/ui';

/**
 * Scraper source data type
 */
interface ScraperSource {
  type: string;
  url?: string;
  locationId?: string;
  [key: string]: unknown;
}

/**
 * Full business detail for the admin review queue
 */
interface ReviewBusiness {
  id: string;
  name: string;
  address: string;
  source: string;
  rating: number;
  submittedAt: string;
  description?: string;
  category?: string;
  phone?: string;
  website?: string;
  hours?: string;
  priceRange?: string;
  originalData?: Record<string, unknown>;
}

/**
 * Shape returned by GET /api/pending-businesses
 */
interface PendingBusinessApiResponse {
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

/**
 * Map an API response row into the review queue shape
 */
function toReviewBusiness(b: PendingBusinessApiResponse): ReviewBusiness {
  const sd = b.sourceData || {};
  return {
    id: b.id,
    name: b.name,
    address: b.address,
    source: b.source,
    rating: b.rating ?? 0,
    submittedAt: new Date(b.createdAt).toISOString().split('T')[0],
    description: b.description,
    category: b.categoryId,
    phone: typeof sd.phone === 'string' ? sd.phone : undefined,
    website: typeof sd.website === 'string' ? sd.website : undefined,
    originalData: b.sourceData,
  };
}

export default function BusinessReviewPage() {
  const [selectedPeriod, setSelectedPeriod] = useState('week');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedBusiness, setSelectedBusiness] = useState<ReviewBusiness | null>(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [selectedBusinessIds, setSelectedBusinessIds] = useState<Set<string>>(new Set());
  const [bulkApproveLoading, setBulkApproveLoading] = useState(false);
  const [bulkApproveResult, setBulkApproveResult] = useState<{ success: boolean; message: string } | null>(null);
  const [businesses, setBusinesses] = useState<ReviewBusiness[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [decisionState, setDecisionState] = useState<'idle' | 'approving' | 'rejecting'>('idle');
  const [rejectMode, setRejectMode] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [decisionResult, setDecisionResult] = useState<{ success: boolean; message: string } | null>(null);

  React.useEffect(() => {
    const fetchBusinesses = async () => {
      try {
        const response = await fetch('/api/pending-businesses');
        if (response.ok) {
          const data: PendingBusinessApiResponse[] = await response.json();
          setBusinesses((Array.isArray(data) ? data : []).map(toReviewBusiness));
        } else {
          setLoadError('Failed to load pending businesses');
        }
      } catch (error) {
        console.error('Failed to fetch businesses:', error);
        setLoadError('Failed to load pending businesses');
      }
    };
    fetchBusinesses();
  }, []);

  const filteredBusinesses = businesses.filter((business) =>
    business.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    business.address.toLowerCase().includes(searchQuery.toLowerCase()) ||
    business.source.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const openDetail = (business: ReviewBusiness) => {
    setSelectedBusiness(business);
    setRejectMode(false);
    setRejectReason('');
    setIsDetailModalOpen(true);
  };

  const handleCardClick = openDetail;

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedBusinessIds(new Set(filteredBusinesses.map((b) => b.id)));
    } else {
      setSelectedBusinessIds(new Set());
    }
  };

  const handleSelectBusiness = (businessId: string, checked: boolean) => {
    const newSelected = new Set(selectedBusinessIds);
    if (checked) {
      newSelected.add(businessId);
    } else {
      newSelected.delete(businessId);
    }
    setSelectedBusinessIds(newSelected);
  };

  const handleBulkApprove = async () => {
    if (selectedBusinessIds.size === 0) {
      setBulkApproveResult({ success: false, message: 'No businesses selected' });
      return;
    }

    setBulkApproveLoading(true);
    setBulkApproveResult(null);

    try {
      const response = await fetch('/api/businesses/bulk-approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ businessIds: Array.from(selectedBusinessIds) }),
      });

      const result = await response.json();

      if (result.success) {
        setBulkApproveResult({
          success: true,
          message: result.data.approvedCount
            ? `${result.data.approvedCount} businesses approved successfully`
            : 'Businesses approved',
        });
        setSelectedBusinessIds(new Set());
      } else {
        setBulkApproveResult({
          success: false,
          message: result.error || 'Failed to approve businesses',
        });
      }
    } catch (error) {
      setBulkApproveResult({
        success: false,
        message: error instanceof Error ? error.message : 'An unexpected error occurred',
      });
    } finally {
      setBulkApproveLoading(false);
    }
  };

  const handleRowClick = openDetail;

  const handleCloseDetail = () => {
    setIsDetailModalOpen(false);
    setSelectedBusiness(null);
    setRejectMode(false);
    setRejectReason('');
  };

  const finishDecision = (businessId: string) => {
    setBusinesses((prev) => prev.filter((b) => b.id !== businessId));
    setIsDetailModalOpen(false);
    setSelectedBusiness(null);
    setRejectMode(false);
    setRejectReason('');
  };

  const handleApprove = async () => {
    if (!selectedBusiness || decisionState !== 'idle') return;
    const business = selectedBusiness;
    setDecisionState('approving');
    setDecisionResult(null);
    try {
      const response = await fetch(`/api/businesses/${business.id}/approve`, {
        method: 'POST',
      });
      const result = await response.json();
      if (result.success) {
        setDecisionResult({ success: true, message: `${business.name} approved` });
        finishDecision(business.id);
      } else {
        setDecisionResult({ success: false, message: result.error || 'Failed to approve business' });
      }
    } catch (error) {
      setDecisionResult({
        success: false,
        message: error instanceof Error ? error.message : 'An unexpected error occurred',
      });
    } finally {
      setDecisionState('idle');
    }
  };

  const handleRejectToggle = () => {
    setRejectMode((prev) => !prev);
  };

  const handleConfirmReject = async () => {
    if (!selectedBusiness || decisionState !== 'idle' || !rejectReason.trim()) return;
    const business = selectedBusiness;
    const reason = rejectReason.trim();
    setDecisionState('rejecting');
    setDecisionResult(null);
    try {
      const response = await fetch(`/api/businesses/${business.id}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason }),
      });
      const result = await response.json();
      if (result.success) {
        setDecisionResult({ success: true, message: `${business.name} rejected` });
        finishDecision(business.id);
      } else {
        setDecisionResult({ success: false, message: result.error || 'Failed to reject business' });
      }
    } catch (error) {
      setDecisionResult({
        success: false,
        message: error instanceof Error ? error.message : 'An unexpected error occurred',
      });
    } finally {
      setDecisionState('idle');
    }
  };

  const renderRating = (rating: number) => {
    if (!rating || rating <= 0) {
      return <span className="text-neutral-400 text-sm">No rating</span>;
    }
    return (
      <span className="text-heritage-ochre" aria-label={`Rating: ${rating} out of 5 stars`}>
        {'★'.repeat(Math.round(Math.min(5, Math.max(1, rating))))}
        <span className="text-neutral-500 text-xs ml-1">{rating.toFixed(1)}</span>
      </span>
    );
  };

  const getSourceBadge = (source: string) => {
    const variants: Record<string, 'default' | 'primary' | 'success' | 'warning'> = {
      'Direct Submission': 'default',
      'Partner Referral': 'primary',
      'Community Nomination': 'success',
    };
    return (
      <Badge variant={variants[source] || 'default'} size="sm">
        {source}
      </Badge>
    );
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
              <h1 className="text-3xl font-bold mb-2">Business Review Queue</h1>
              <p className="text-neutral-100">Review and moderate pending business submissions</p>
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
                Export List
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={handleBulkApprove}
                disabled={selectedBusinessIds.size === 0 || bulkApproveLoading}
              >
                {bulkApproveLoading ? 'Approving...' : `Approve Selected (${selectedBusinessIds.size})`}
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Main Content */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Filters */}
        <Card variant="elevated" padding="lg" className="mb-6">
          <div className="flex items-center justify-between">
            <div className="flex-1 max-w-md">
              <Input
                placeholder="Search by name, address, or source..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <div className="text-sm text-neutral-500">
              {filteredBusinesses.length} businesses pending review
            </div>
          </div>
          {bulkApproveResult && (
            <div className={`mt-4 p-3 rounded-lg ${bulkApproveResult.success ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
              <p className="text-sm font-medium">{bulkApproveResult.message}</p>
            </div>
          )}
          {decisionResult && (
            <div className={`mt-4 p-3 rounded-lg ${decisionResult.success ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
              <p className="text-sm font-medium">{decisionResult.message}</p>
            </div>
          )}
        </Card>

        {/* Review Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredBusinesses.length === 0 ? (
            <div className="col-span-full text-center py-8 text-neutral-500">
              {loadError ? loadError : searchQuery ? 'No businesses found matching your search' : 'No businesses pending review'}
            </div>
          ) : (
            filteredBusinesses.map((business) => (
              <Card
                key={business.id}
                variant="elevated"
                padding="lg"
                clickable
                onClick={() => handleCardClick(business)}
                className="cursor-pointer hover:shadow-lg transition-shadow"
              >
                <div className="flex flex-col h-full">
                  <div className="flex items-start justify-between mb-3">
                    <h3 className="text-lg font-semibold text-neutral-900">{business.name}</h3>
                    {getSourceBadge(business.source)}
                  </div>
                  <p className="text-sm text-neutral-600 mb-2">{business.address}</p>
                  <div className="flex items-center gap-2 mb-3">
                    <span className="text-sm text-neutral-500">Rating:</span>
                    {renderRating(business.rating)}
                  </div>
                  <div className="mt-auto pt-3 border-t border-neutral-200">
                    <p className="text-xs text-neutral-500">Submitted: {business.submittedAt}</p>
                  </div>
                </div>
              </Card>
            ))
          )}
        </div>
      </section>

      {/* Business Detail Modal */}
      {selectedBusiness && (
        <Modal
          isOpen={isDetailModalOpen}
          onClose={handleCloseDetail}
          title={
            <div className="text-xl font-semibold">
              {selectedBusiness.name}
              <Badge variant="warning" size="sm" className="ml-3">Pending Review</Badge>
            </div>
          }
          size="xl"
          closeOnBackdrop={true}
          closeOnEscape={true}
        >
          <div role="presentation" className="space-y-6">
            {/* Basic Information */}
            <div>
              <h3 className="text-lg font-semibold text-neutral-900 mb-4">Basic Information</h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-neutral-500">Business ID</label>
                  <p className="mt-1 text-neutral-900">{selectedBusiness.id}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-neutral-500">Category</label>
                  <p className="mt-1 text-neutral-900">{selectedBusiness.category || 'N/A'}</p>
                </div>
                <div className="col-span-2">
                  <label className="text-sm font-medium text-neutral-500">Description</label>
                  <p className="mt-1 text-neutral-900">{selectedBusiness.description || 'No description provided'}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-neutral-500">Address</label>
                  <p className="mt-1 text-neutral-900">{selectedBusiness.address}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-neutral-500">Phone</label>
                  <p className="mt-1 text-neutral-900">{selectedBusiness.phone || 'N/A'}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-neutral-500">Website</label>
                  <p className="mt-1 text-neutral-900">
                    {selectedBusiness.website ? (
                      <a href={selectedBusiness.website} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                        {selectedBusiness.website}
                      </a>
                    ) : (
                      'N/A'
                    )}
                  </p>
                </div>
                <div>
                  <label className="text-sm font-medium text-neutral-500">Hours</label>
                  <p className="mt-1 text-neutral-900">{selectedBusiness.hours || 'N/A'}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-neutral-500">Price Range</label>
                  <p className="mt-1 text-neutral-900">{selectedBusiness.priceRange || 'N/A'}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-neutral-500">Rating</label>
                  <p className="mt-1">{renderRating(selectedBusiness.rating)}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-neutral-500">Status</label>
                  <p className="mt-1 text-neutral-900">Pending Review</p>
                </div>
              </div>
            </div>

            {/* Source Information */}
            <div>
              <h3 className="text-lg font-semibold text-neutral-900 mb-4">Source Information</h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-neutral-500">Source</label>
                  <p className="mt-1">
                    <Badge variant="default" size="sm">
                      {selectedBusiness.source}
                    </Badge>
                  </p>
                </div>
                <div>
                  <label className="text-sm font-medium text-neutral-500">Scraped At</label>
                  <p className="mt-1 text-neutral-900">{selectedBusiness.submittedAt}</p>
                </div>
              </div>
            </div>

            {/* Original Scraped Data */}
            {selectedBusiness.originalData && (
              <div>
                <h3 className="text-lg font-semibold text-neutral-900 mb-4">Original Scraped Data</h3>
                <div className="bg-neutral-100 rounded-lg p-4 overflow-x-auto">
                  <pre className="text-sm text-neutral-800 whitespace-pre-wrap">
                    {JSON.stringify(selectedBusiness.originalData, null, 2)}
                  </pre>
                </div>
              </div>
            )}

            {/* Rejection Reason */}
            {rejectMode && (
              <div>
                <h3 className="text-lg font-semibold text-neutral-900 mb-4">Rejection Reason</h3>
                <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                  <Input
                    label="Why is this business being rejected?"
                    placeholder="Enter a rejection reason..."
                    value={rejectReason}
                    onChange={(e) => setRejectReason(e.target.value)}
                    maxLength={500}
                    disabled={decisionState !== 'idle'}
                  />
                </div>
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex justify-end gap-3 pt-4 border-t border-neutral-200">
              <Button variant="secondary" onClick={handleCloseDetail} disabled={decisionState !== 'idle'}>
                Close
              </Button>
              <Button variant="primary" onClick={handleApprove} disabled={decisionState !== 'idle'}>
                {decisionState === 'approving' ? 'Approving...' : 'Approve'}
              </Button>
              {rejectMode ? (
                <>
                  <Button variant="secondary" onClick={handleRejectToggle} disabled={decisionState !== 'idle'}>
                    Cancel Reject
                  </Button>
                  <Button variant="danger" onClick={handleConfirmReject} disabled={decisionState !== 'idle' || !rejectReason.trim()}>
                    {decisionState === 'rejecting' ? 'Rejecting...' : 'Confirm Reject'}
                  </Button>
                </>
              ) : (
                <Button variant="danger" onClick={handleRejectToggle} disabled={decisionState !== 'idle'}>
                  Reject
                </Button>
              )}
            </div>
          </div>
        </Modal>
      )}

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
