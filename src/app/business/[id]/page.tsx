'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useParams, notFound } from 'next/navigation';
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

  const loadBusiness = useCallback(async () => {
    if (!businessId) return;
    try {
      setLoading(true);
      setError(null);
      const result = await fetchBusinessById(businessId);
      setBusiness(result);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'An unexpected error occurred';
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  }, [businessId]);

  useEffect(() => {
    if (!businessId) {
      setError('Invalid business ID');
      setLoading(false);
      return;
    }
    loadBusiness();
  }, [businessId, loadBusiness]);

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
    <BusinessDetail
      business={business}
      loading={loading}
      error={error}
      onReviewsSubmitted={loadBusiness}
    />
  );
}
