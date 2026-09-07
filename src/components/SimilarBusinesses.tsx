'use client';

import { useEffect, useState } from 'react';

interface SimilarBusiness {
  id: string;
  name: string;
  category: string;
  location: string;
  rating: number | null;
  reviewCount: number | null;
  imageUrl?: string | null;
}

interface SimilarBusinessesProps {
  category?: string | null;
  excludeId: string;
  limit?: number;
}

/**
 * SimilarBusinesses - "More in {category}" strip below the detail page.
 *
 * Client-side lookup against /api/directory: same category, not this
 * business, best rated first. Renders nothing when there are no matches
 * (and in test environments without a working fetch).
 */
export function SimilarBusinesses({
  category,
  excludeId,
  limit = 3,
}: SimilarBusinessesProps) {
  const [similar, setSimilar] = useState<SimilarBusiness[]>([]);

  useEffect(() => {
    if (typeof fetch !== 'function' || !category) {
      setSimilar([]);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/directory');
        const json = await res.json();
        if (cancelled || !json?.success) return;
        const items: SimilarBusiness[] = json.data?.businesses ?? [];
        const matches = items
          .filter((b) => b.id !== excludeId && b.category === category)
          .sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0))
          .slice(0, limit);
        if (!cancelled) setSimilar(matches);
      } catch {
        if (!cancelled) setSimilar([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [category, excludeId, limit]);

  if (similar.length === 0) return null;

  return (
    <section className="mt-10">
      <h2 className="text-xl font-bold text-neutral-900">More in {category}</h2>
      <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {similar.map((s) => (
          <a
            key={s.id}
            href={`/business/${s.id}`}
            className="flex gap-3 rounded-xl border border-neutral-200 bg-white p-3 transition-shadow hover:shadow-md"
            style={{ textDecoration: 'none' }}
          >
            <div className="flex h-20 w-24 flex-shrink-0 items-center justify-center overflow-hidden rounded-lg bg-neutral-200 text-2xl">
              {s.imageUrl ? (
                <img src={s.imageUrl} alt="" className="h-full w-full object-cover" />
              ) : (
                <span aria-hidden="true">🏪</span>
              )}
            </div>
            <div className="min-w-0">
              <p className="truncate font-semibold text-neutral-900">{s.name}</p>
              <p className="text-sm text-neutral-600">
                {s.rating != null ? `★ ${s.rating.toFixed(1)} · ` : ''}
                {s.reviewCount ?? 0} {s.reviewCount === 1 ? 'review' : 'reviews'}
              </p>
              {s.location && <p className="truncate text-sm text-neutral-500">{s.location}</p>}
            </div>
          </a>
        ))}
      </div>
    </section>
  );
}

export default SimilarBusinesses;
