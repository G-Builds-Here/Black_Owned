'use client';

import React, { useState } from 'react';
import { Navigation } from '@/components/ui/Navigation';
import { Card, Badge, Button, Tabs, Input, Table, TableHeader, TableColumn, TableBody, TableRow, TableCell, Dropdown, DropdownItem } from '@/components/ui';

/**
 * Business review entry for the admin review queue
 */
interface ReviewBusiness {
  id: string;
  name: string;
  address: string;
  source: string;
  rating: number;
  submittedAt: string;
}

/**
 * Mock data for businesses pending review
 * In production, this would come from a GraphQL query or API call
 */
const MOCK_PENDING_REVIEWS: ReviewBusiness[] = [
  { id: '1', name: 'Soul Food Kitchen', address: '123 Main St, Atlanta GA', source: 'Direct Submission', rating: 0, submittedAt: '2026-07-14' },
  { id: '2', name: 'Afro Threads', address: '456 Oak Ave, Houston TX', source: 'Partner Referral', rating: 0, submittedAt: '2026-07-14' },
  { id: '3', name: 'Heritage Wellness Center', address: '789 Pine Rd, Dallas TX', source: 'Direct Submission', rating: 0, submittedAt: '2026-07-13' },
  { id: '4', name: 'Golden Era Barbershop', address: '321 Elm St, Atlanta GA', source: 'Community Nomination', rating: 0, submittedAt: '2026-07-11' },
  { id: '5', name: 'Rhythm & Blues Records', address: '654 Cedar Ln, Houston TX', source: 'Direct Submission', rating: 0, submittedAt: '2026-07-10' },
];

export default function BusinessReviewPage() {
  const [selectedPeriod, setSelectedPeriod] = useState('week');
  const [searchQuery, setSearchQuery] = useState('');

  const filteredBusinesses = MOCK_PENDING_REVIEWS.filter((business) =>
    business.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    business.address.toLowerCase().includes(searchQuery.toLowerCase()) ||
    business.source.toLowerCase().includes(searchQuery.toLowerCase())
  );

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
                  <TableRow key={business.id}>
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
                        <Button variant="primary" size="sm">Review</Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </Card>
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
