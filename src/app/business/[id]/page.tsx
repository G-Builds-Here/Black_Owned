'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { BusinessDetail, Business as BusinessData } from '@/components/BusinessDetail';

/**
 * Business Detail Page
 *
 * Fetches and displays a single business by ID from the GraphQL API.
 */
export default function BusinessDetailPage() {
  const params = useParams();
  const router = useRouter();
  const businessId = useMemo(() => params?.id as string, [params]);

  const [business, setBusiness] = useState<BusinessData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!businessId) {
      setError('Invalid business ID');
      setLoading(false);
      return;
    }

    const fetchBusiness = async () => {
      try {
        const response = await fetch('/api/graphql', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            query: `
              query GetBusiness($id: String!) {
                business(id: $id) {
                  id
                  name
                  categoryId
                  verified
                  createdAt { timestamp }
                  description
                  location
                  rating
                  reviewCount
                  imageUrl
                  tags
                }
              }
            `,
            variables: { id: businessId },
          }),
        });

        const { data, errors } = await response.json();

        if (errors) {
          setError(errors[0].message);
        } else if (data?.business) {
          setBusiness({
            id: data.business.id,
            name: data.business.name,
            categoryId: data.business.categoryId,
            verified: data.business.verified,
            createdAt: data.business.createdAt,
            rating: data.business.rating || 0,
            reviewCount: data.business.reviewCount || 0,
            location: data.business.location || '',
            isVerified: data.business.verified,
            imageUrl: data.business.imageUrl || '',
            description: data.business.description || '',
            tags: data.business.tags || [],
          });
          setError(null);
        } else {
          setError('Business not found');
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to fetch business');
      } finally {
        setLoading(false);
      }
    };

    fetchBusiness();
  }, [businessId]);

  const handleBack = () => {
    router.push('/directory');
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-neutral-500">Loading...</div>
      </div>
    );
  }

  if (error || !business) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-neutral-800 mb-4">Business Not Found</h1>
          <p className="text-neutral-600 mb-6">{error}</p>
          <button
            onClick={handleBack}
            className="px-6 py-3 bg-heritage-ochre text-white rounded-lg hover:bg-heritage-ochre/90"
          >
            Back to Directory
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="relative">
      {/* Kente-inspired top border */}
      <div className="h-1 bg-gradient-to-r from-heritage-ochre via-heritage-gold to-heritage-forest" />
      <BusinessDetail
        business={business}
        loading={false}
        error={null}
        onBack={handleBack}
      />
    </div>
  );
}
