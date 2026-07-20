'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { useParams, notFound } from 'next/navigation';
import { BusinessDetail, Business as BusinessData } from '@/components/BusinessDetail';
import { fetchBusinessById } from '@/lib/graphql/graphql-client';

/**
 * Business Detail Page
 *
 * Fetches and displays a single business by ID using the GraphQL API.
 * Shows loading, error, and not-found states appropriately.
 */
export default function BusinessDetailPage() {
  const params = useParams();
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

    const loadBusiness = async () => {
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
    };

    loadBusiness();
  }, [businessId]);

  // If businessId is invalid format, show not found
  if (!businessId) {
    notFound();
  }

  return (
    <BusinessDetail
      business={business}
      loading={loading}
      error={error}
    />
  );
}
