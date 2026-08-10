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
    id: '1',
    name: 'Soul Food Kitchen',
    address: '123 Main St, Atlanta GA',
    source: 'Direct Submission',
    rating: 0,
    submittedAt: '2026-07-14',
    description: 'Authentic soul food restaurant serving traditional Southern cuisine with a modern twist.',
    category: 'Restaurant',
    phone: '(404) 555-0123',
    website: 'https://soulfoodkitchen.example.com',
    hours: 'Mon-Sun: 11:00 AM - 10:00 PM',
    priceRange: '$$',
    originalData: {
      scraper: 'DirectSubmission',
      submittedBy: 'business_owner',
      verificationStatus: 'pending',
      documents: ['business_license.pdf', 'food_safety_cert.pdf'],
    }
  },
  {
    id: '2',
    name: 'Afro Threads',
    address: '456 Oak Ave, Houston TX',
    source: 'Partner Referral',
    rating: 0,
    submittedAt: '2026-07-14',
    description: 'Boutique clothing store specializing in African-inspired fashion and accessories.',
    category: 'Retail',
    phone: '(713) 555-0456',
    website: 'https://afrothreads.example.com',
    hours: 'Mon-Sat: 10:00 AM - 8:00 PM, Sun: 12:00 PM - 6:00 PM',
    priceRange: '$$$',
    originalData: {
      scraper: 'PartnerAPI',
      referredBy: 'HoustonBlackChamber',
      referralDate: '2026-07-10',
      partnerId: 'HBC-2024-001',
    }
  },
  {
    id: '3',
    name: 'Heritage Wellness Center',
    address: '789 Pine Rd, Dallas TX',
    source: 'Direct Submission',
    rating: 0,
    submittedAt: '2026-07-13',
    description: 'Comprehensive wellness center offering holistic health services and community programs.',
    category: 'Health & Wellness',
    phone: '(214) 555-0789',
    website: 'https://heritagewellness.example.com',
    hours: 'Mon-Fri: 8:00 AM - 8:00 PM, Sat: 9:00 AM - 5:00 PM',
    priceRange: '$$',
    originalData: {
      scraper: 'DirectSubmission',
      submittedBy: 'admin_nominated',
      nominationCount: 15,
      communitySupport: true,
    }
  },
  {
    id: '4',
    name: 'Golden Era Barbershop',
    address: '321 Elm St, Atlanta GA',
    source: 'Community Nomination',
    rating: 0,
    submittedAt: '2026-07-11',
    description: 'Classic barbershop providing premium haircuts and grooming services in a welcoming atmosphere.',
    category: 'Personal Services',
    phone: '(404) 555-0321',
    hours: 'Tue-Sat: 9:00 AM - 7:00 PM',
    priceRange: '$$',
    originalData: {
      scraper: 'CommunityNomination',
      nominatedBy: 'AtlantaCommunityBoard',
      nominationDate: '2026-06-28',
      supporterCount: 23,
    }
  },
  {
    id: '5',
    name: 'Rhythm & Blues Records',
    address: '654 Cedar Ln, Houston TX',
    source: 'Direct Submission',
    rating: 0,
    submittedAt: '2026-07-10',
    description: 'Independent music store specializing in vinyl records, rare finds, and local artist merchandise.',
    category: 'Retail',
    phone: '(713) 555-0654',
    website: 'https://rhythmbluesrecords.example.com',
    hours: 'Mon-Sat: 11:00 AM - 9:00 PM, Sun: 12:00 PM - 6:00 PM',
    priceRange: '$$$',
    originalData: {
      scraper: 'DirectSubmission',
      submittedBy: 'business_owner',
      yearsInBusiness: 25,
      localArtistSupport: true,
    }
  },
];

export default function BusinessReviewPage() {
  const [selectedPeriod, setSelectedPeriod] = useState('week');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedBusiness, setSelectedBusiness] = useState<ReviewBusiness | null>(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);

  const filteredBusinesses = MOCK_PENDING_REVIEWS.filter((business) =>
    business.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    business.address.toLowerCase().includes(searchQuery.toLowerCase()) ||
    business.source.toLowerCase().includes(searchQuery.toLowerCase())
  );

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
        </Card>

        {/* Review Table */}
        <Card variant="elevated" padding="0" className="overflow-hidden">
          <Table
            aria-label="Business review queue"
            className="w-full"
          >
            <TableHeader>
              <TableRow>
                <TableColumn className="w-1/3">Business Name</TableColumn>
                <TableColumn className="w-1/4">Address</TableColumn>
                <TableColumn>Source</TableColumn>
                <TableColumn>Rating</TableColumn>
                <TableColumn>Submitted</TableColumn>
                <TableColumn className="w-32">Actions</TableColumn>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredBusinesses.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-neutral-500">
                    No businesses found matching your search
                  </TableCell>
                </TableRow>
              ) : (
                filteredBusinesses.map((business) => (
                  <TableRow key={business.id} className="cursor-pointer hover:bg-neutral-50" onClick={() => handleRowClick(business)}>
                    <TableCell>
                      <div>
                        <p className="font-medium text-neutral-800">{business.name}</p>
                        <p className="text-sm text-neutral-500">ID: {business.id}</p>
                      </div>
                    </TableCell>
                    <TableCell className="text-neutral-600">{business.address}</TableCell>
                    <TableCell>{getSourceBadge(business.source)}</TableCell>
                    <TableCell>{renderRating(business.rating)}</TableCell>
                    <TableCell className="text-neutral-600">{business.submittedAt}</TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        <Button variant="primary" size="sm">View Details</Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </Card>
      </section>

      {/* Business Detail Modal */}
      {selectedBusiness && (
        <Modal
          isOpen={isDetailModalOpen}
          onClose={handleCloseDetail}
          title="Business Details"
          size="xl"
          closeOnBackdrop={true}
          closeOnEscape={true}
        >
          <div className="space-y-6">
            {/* Basic Information */}
            <div>
              <h3 className="text-lg font-semibold text-neutral-900 mb-4">Basic Information</h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-neutral-500">Business Name</label>
                  <p className="mt-1 text-neutral-900">{selectedBusiness.name}</p>
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
              </div>
            </div>

            {/* Source Information */}
            <div>
              <h3 className="text-lg font-semibold text-neutral-900 mb-4">Source Information</h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-neutral-500">Submission Source</label>
                  <p className="mt-1">
                    <Badge variant="default" size="sm">
                      {selectedBusiness.source}
                    </Badge>
                  </p>
                </div>
                <div>
                  <label className="text-sm font-medium text-neutral-500">Submitted Date</label>
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
              <Button variant="primary">
                Approve Business
              </Button>
              <Button variant="danger">
                Reject Business
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
