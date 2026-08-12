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
 * Mock data for businesses pending review
 * In production, this would come from a GraphQL query or API call
 */
const MOCK_PENDING_REVIEWS: ReviewBusiness[] = [
  {
    id: 'biz-001',
    name: 'Soul Food Kitchen',
    address: '123 Main St, Harlem, NY',
    source: 'Google Maps',
    rating: 4.5,
    submittedAt: '2026-08-09',
    description: 'Authentic soul food restaurant serving traditional Southern cuisine with a modern twist.',
    category: 'Food & Dining',
    phone: '(555) 123-4567',
    website: 'https://soulfoodkitchen.com',
    hours: 'Mon-Sun: 11:00 AM - 10:00 PM',
    priceRange: '$$',
    originalData: {
      id: 'biz-001',
      name: 'Soul Food Kitchen',
      address: '123 Main St, Harlem, NY',
      source: 'Google Maps',
      rating: 4.5,
      category: 'Food & Dining',
      phone: '(555) 123-4567',
      website: 'https://soulfoodkitchen.com',
      scraper: 'DirectSubmission',
      submittedBy: 'business_owner',
      verificationStatus: 'pending',
      documents: ['business_license.pdf', 'food_safety_cert.pdf'],
    }
  },
  {
    id: 'biz-002',
    name: 'Black Diamond Consulting',
    address: '456 Business Ave, Atlanta, GA',
    source: 'Bing Maps',
    rating: 5.0,
    submittedAt: '2026-08-08',
    description: 'Professional consulting services for small businesses.',
    category: 'Professional Services',
    phone: '(555) 987-6543',
    website: 'https://blackdiamondconsulting.com',
    hours: 'Mon-Fri: 9:00 AM - 6:00 PM',
    priceRange: '$$$',
    originalData: {
      id: 'biz-002',
      name: 'Black Diamond Consulting',
      address: '456 Business Ave, Atlanta, GA',
      source: 'Bing Maps',
      rating: 5.0,
      category: 'Professional Services',
      phone: '(555) 987-6543',
      website: 'https://blackdiamondconsulting.com',
      scraper: 'PartnerAPI',
      referredBy: 'AtlantaChamber',
      verificationStatus: 'pending',
    }
  },
];

export default function BusinessReviewPage() {
  const [selectedPeriod, setSelectedPeriod] = useState('week');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedBusiness, setSelectedBusiness] = useState<ReviewBusiness | null>(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [selectedBusinessIds, setSelectedBusinessIds] = useState<Set<string>>(new Set());
  const [bulkApproveLoading, setBulkApproveLoading] = useState(false);
  const [bulkApproveResult, setBulkApproveResult] = useState<{ success: boolean; message: string } | null>(null);
  const [businesses, setBusinesses] = useState<ReviewBusiness[]>(MOCK_PENDING_REVIEWS);

  React.useEffect(() => {
    const fetchBusinesses = async () => {
      try {
        const response = await fetch('/api/businesses/pending');
        if (response.ok) {
          const data = await response.json();
          setBusinesses(data.data?.pendingBusinesses || MOCK_PENDING_REVIEWS);
        }
      } catch (error) {
        console.error('Failed to fetch businesses:', error);
      }
    };
    fetchBusinesses();
  }, []);

  const filteredBusinesses = businesses.filter((business) =>
    business.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    business.address.toLowerCase().includes(searchQuery.toLowerCase()) ||
    business.source.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleCardClick = (business: ReviewBusiness) => {
    setSelectedBusiness(business);
    setIsDetailModalOpen(true);
  };

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

  const handleRowClick = (business: ReviewBusiness) => {
    setSelectedBusiness(business);
    setIsDetailModalOpen(true);
  };

  const handleCloseDetail = () => {
    setIsDetailModalOpen(false);
    setSelectedBusiness(null);
  };

  const renderRating = (rating: number) => {
    if (rating === 0) {
      return <span className="text-neutral-400 text-sm">Pending</span>;
    }
    return (
      <span className="text-heritage-ochre">
        {'★'.repeat(rating)}
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
        </Card>

        {/* Review Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredBusinesses.length === 0 ? (
            <div className="col-span-full text-center py-8 text-neutral-500">
              No businesses found matching your search
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

            {/* Action Buttons */}
            <div className="flex justify-end gap-3 pt-4 border-t border-neutral-200">
              <Button variant="secondary" onClick={handleCloseDetail}>
                Close
              </Button>
              <Button variant="primary" onClick={handleCloseDetail}>
                Approve
              </Button>
              <Button variant="danger" onClick={handleCloseDetail}>
                Reject
              </Button>
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
