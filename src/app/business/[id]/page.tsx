'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { useParams, notFound } from 'next/navigation';
import { BusinessDetail, Business as BusinessData } from '@/components/BusinessDetail';
import { fetchBusinessById } from '@/lib/graphql/graphql-client';
import { verifyToken } from '@/lib/auth/auth-service';

/**
 * Business Detail Page
 *
 * Fetches and displays a single business by ID using the GraphQL API.
 * Shows loading, error, and not-found states appropriately.
 * Business owners can edit their profile. Verified businesses show a Chat button.
 */
export default function BusinessDetailPage() {
  const params = useParams();
  const businessId = useMemo(() => params?.id as string, [params]);

  const [business, setBusiness] = useState<BusinessData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isOwner, setIsOwner] = useState(false);

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

        // Check if user is authenticated and is the owner
        const authHeader = typeof window !== 'undefined' ? localStorage.getItem('auth_token') : null;
        let currentUserId: string | null = null;

        if (authHeader && authHeader.startsWith('Bearer ')) {
          try {
            const token = authHeader.substring(7);
            const payload = verifyToken(token);
            currentUserId = payload.userId;
          } catch {
            // Invalid token, user not authenticated
          }
        }

        const result = await fetchBusinessById(businessId);
        setBusiness(result);

        // Check if current user is the owner
        if (currentUserId && result) {
          setIsOwner(result.ownerId === currentUserId);
        }
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
      isOwner={isOwner}
    />
  );
}
