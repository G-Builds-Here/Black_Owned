'use client';

import React from 'react';
import Card from './Card';
import Badge from './Badge';

export interface BusinessDetail {
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

export interface BusinessDetailPanelProps {
  business: BusinessDetail | null;
  isOpen: boolean;
  onClose: () => void;
}

export const BusinessDetailPanel: React.FC<BusinessDetailPanelProps> = ({
  business,
  isOpen,
  onClose,
}) => {
  if (!isOpen || !business) return null;

  const getSourceDisplayName = (source: string) => {
    return source
      .split('_')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  };

  const formatJsonData = (data: Record<string, unknown> | undefined) => {
    if (!data) return 'No additional data';
    return JSON.stringify(data, null, 2);
  };

  return (
    <div className="mt-6">
      <Card variant="elevated" padding="lg">
        <div className="flex items-start justify-between mb-6">
          <div>
            <h3 className="text-xl font-bold text-neutral-800">{business.name}</h3>
            <div className="flex items-center gap-2 mt-2">
              <Badge variant="default" size="sm">
                {getSourceDisplayName(business.source)}
              </Badge>
              <Badge variant="warning" size="sm">
                {business.status.replace('_', ' ').charAt(0).toUpperCase() + business.status.slice(1).replace('_', ' ')}
              </Badge>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-neutral-400 hover:text-neutral-600 transition-colors"
            aria-label="Close detail panel"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Basic Information */}
          <div className="space-y-4">
            <h4 className="font-semibold text-neutral-700 border-b border-neutral-200 pb-2">
              Basic Information
            </h4>

            <div>
              <p className="text-sm text-neutral-500 mb-1">Address</p>
              <p className="text-neutral-800">{business.address}</p>
            </div>

            <div>
              <p className="text-sm text-neutral-500 mb-1">Rating</p>
              <p className="text-neutral-800">
                {business.rating !== null ? (
                  <span className="text-heritage-ochre">
                    {'★'.repeat(business.rating)}
                    {'☆'.repeat(5 - business.rating)}
                  </span>
                ) : (
                  <span className="text-neutral-400">N/A</span>
                )}
              </p>
            </div>

            <div>
              <p className="text-sm text-neutral-500 mb-1">Category ID</p>
              <p className="text-neutral-800">{business.categoryId || 'N/A'}</p>
            </div>

            <div>
              <p className="text-sm text-neutral-500 mb-1">Status</p>
              <p className="text-neutral-800">{business.status}</p>
            </div>

            <div>
              <p className="text-sm text-neutral-500 mb-1">Created At</p>
              <p className="text-neutral-800">{new Date(business.createdAt).toLocaleString()}</p>
            </div>
          </div>

          {/* Description */}
          {business.description && (
            <div className="space-y-4">
              <h4 className="font-semibold text-neutral-700 border-b border-neutral-200 pb-2">
                Description
              </h4>
              <p className="text-neutral-800">{business.description}</p>
            </div>
          )}

          {/* Original Scraped Data */}
          <div className="space-y-4 md:col-span-2">
            <h4 className="font-semibold text-neutral-700 border-b border-neutral-200 pb-2">
              Original Scraped Data
            </h4>
            <pre className="bg-neutral-50 p-4 rounded-lg overflow-x-auto text-sm text-neutral-700">
              {formatJsonData(business.sourceData)}
            </pre>
          </div>
        </div>
      </Card>
    </div>
  );
};

export default BusinessDetailPanel;
