'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import Input from '@/components/ui/Input';
import Badge from '@/components/ui/Badge';
import Navigation from '@/components/ui/Navigation';
import { getSession, authHeaders, clearSession } from '@/lib/auth/client-session';

interface OwnerBusiness {
  id: string;
  name: string;
  description: string | null;
  category: string;
  status: string;
  createdAt: string;
}

interface ViewDay {
  date: string;
  views: number;
}

function statusBadge(status: string): { variant: 'success' | 'warning' | 'info' | 'default'; label: string } {
  switch (status) {
    case 'verified':
      return { variant: 'success', label: 'Verified' };
    case 'pending':
      return { variant: 'warning', label: 'Pending' };
    case 'unverified':
      return { variant: 'info', label: 'Unverified' };
    default:
      return { variant: 'default', label: status };
  }
}

/** Dependency-free bar chart for the last N days of views. */
function ViewsChart({ days }: { days: ViewDay[] }) {
  if (days.length === 0) return null;
  const total = days.reduce((sum, d) => sum + d.views, 0);
  const max = Math.max(...days.map((d) => d.views), 1);
  const width = 300;
  const height = 72;
  const barW = width / days.length;

  return (
    <div>
      <div className="flex items-baseline justify-between mb-1">
        <span className="text-sm font-medium text-neutral-700 dark:text-neutral-200">
          Views, last {days.length} days
        </span>
        <span className="text-sm text-neutral-500 dark:text-neutral-400">{total} total</span>
      </div>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full h-20"
        role="img"
        aria-label={`${total} views in the last ${days.length} days`}
      >
        {days.map((d, i) => {
          const h = Math.max((d.views / max) * (height - 6), d.views > 0 ? 2 : 1);
          return (
            <rect
              key={d.date}
              x={i * barW + 1}
              y={height - h}
              width={barW - 2}
              height={h}
              rx={1.5}
              className="fill-heritage-ochre/70"
            >
              <title>{`${d.date}: ${d.views}`}</title>
            </rect>
          );
        })}
      </svg>
    </div>
  );
}

export default function OwnerDashboardPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [businesses, setBusinesses] = useState<OwnerBusiness[]>([]);
  const [views, setViews] = useState<Record<string, ViewDay[]>>({});
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    if (!getSession()) {
      router.replace('/login');
      return;
    }
    setReady(true);

    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/owner/businesses', { headers: authHeaders() });
        if (res.status === 401) {
          clearSession();
          router.replace('/login');
          return;
        }
        if (!res.ok) throw new Error('Failed to load businesses');
        const body = await res.json();
        const list: OwnerBusiness[] = body.data?.businesses ?? [];
        if (cancelled) return;
        setBusinesses(list);
        setLoading(false);

        const entries = await Promise.all(
          list.map(async (b) => {
            try {
              const v = await fetch(
                `/api/owner/businesses/${b.id}/views?days=30`,
                { headers: authHeaders() }
              );
              if (!v.ok) return [b.id, []] as const;
              const vb = await v.json();
              return [b.id, vb.data?.days ?? []] as const;
            } catch {
              return [b.id, []] as const;
            }
          })
        );
        if (cancelled) return;
        setViews(Object.fromEntries(entries));
      } catch {
        if (!cancelled) {
          setError('Could not load your businesses. Please try again.');
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [router]);

  const startEdit = (b: OwnerBusiness) => {
    setEditingId(b.id);
    setEditName(b.name);
    setEditDescription(b.description ?? '');
    setSaveError(null);
  };

  const saveEdit = async (id: string) => {
    setSaving(true);
    setSaveError(null);
    const payload: { name?: string; description?: string | null } = {};
    const name = editName.trim();
    if (name) payload.name = name;
    payload.description = editDescription === '' ? null : editDescription;

    const res = await fetch(`/api/owner/businesses/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify(payload),
    });
    setSaving(false);
    if (res.ok) {
      const body = await res.json();
      const { id: savedId, name: savedName, description: savedDescription } = body.data;
      setBusinesses((prev) =>
        prev.map((b) =>
          b.id === savedId ? { ...b, name: savedName, description: savedDescription } : b
        )
      );
      setEditingId(null);
    } else {
      const body = await res.json().catch(() => ({}));
      setSaveError(body.error || 'Save failed. Please try again.');
    }
  };

  const signOut = () => {
    clearSession();
    router.replace('/login');
  };

  if (!ready) {
    return (
      <div className="min-h-screen bg-white dark:bg-neutral-900">
        <Navigation />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-neutral-50 dark:bg-neutral-900">
      <Navigation />
      <div className="py-10 px-4">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center justify-between mb-8">
            <div>
              <h1 className="text-2xl font-bold text-neutral-900 dark:text-white">Owner Dashboard</h1>
              <p className="text-neutral-600 dark:text-neutral-300 mt-1">
                Manage the businesses you own and watch how they perform.
              </p>
            </div>
            <Button variant="secondary" onClick={signOut}>
              Sign Out
            </Button>
          </div>

          {error && (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 px-4 py-3 rounded-lg mb-6">
              {error}
            </div>
          )}

          {loading ? (
            <div className="text-neutral-500 dark:text-neutral-400 py-12 text-center">Loading…</div>
          ) : businesses.length === 0 ? (
            <Card padding="lg" className="text-center">
              <h2 className="text-lg font-semibold text-neutral-900 dark:text-white mb-2">
                No businesses yet
              </h2>
              <p className="text-neutral-600 dark:text-neutral-300 mb-6">
                Claim your business to start managing it here.
              </p>
              <Link href="/business/claim">
                <Button variant="primary">Claim a Business</Button>
              </Link>
            </Card>
          ) : (
            <div className="grid gap-6">
              {businesses.map((b) => {
                const badge = statusBadge(b.status);
                const isEditing = editingId === b.id;
                return (
                  <Card key={b.id} padding="lg">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <h2 className="text-xl font-semibold text-neutral-900 dark:text-white">
                          {b.name}
                        </h2>
                        <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-1">
                          {b.category} · listed {new Date(b.createdAt).toLocaleDateString()}
                        </p>
                      </div>
                      <Badge variant={badge.variant} pill>
                        {badge.label}
                      </Badge>
                    </div>

                    {b.description && (
                      <p className="text-neutral-700 dark:text-neutral-300 mt-4 text-sm">
                        {b.description}
                      </p>
                    )}

                    {isEditing ? (
                      <div className="mt-6 space-y-4 border border-neutral-200 dark:border-neutral-700 rounded-lg p-4">
                        {saveError && (
                          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 px-3 py-2 rounded-lg text-sm">
                            {saveError}
                          </div>
                        )}
                        <div>
                          <label
                            htmlFor={`name-${b.id}`}
                            className="block text-sm font-medium text-neutral-700 dark:text-neutral-200 mb-1"
                          >
                            Business name
                          </label>
                          <Input
                            id={`name-${b.id}`}
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            maxLength={255}
                          />
                        </div>
                        <div>
                          <label
                            htmlFor={`description-${b.id}`}
                            className="block text-sm font-medium text-neutral-700 dark:text-neutral-200 mb-1"
                          >
                            Description
                          </label>
                          <textarea
                            id={`description-${b.id}`}
                            value={editDescription}
                            onChange={(e) => setEditDescription(e.target.value)}
                            rows={3}
                            className="w-full rounded-lg border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-heritage-ochre"
                          />
                        </div>
                        <div className="flex gap-3">
                          <Button
                            variant="primary"
                            onClick={() => saveEdit(b.id)}
                            disabled={saving || editName.trim() === ''}
                          >
                            {saving ? 'Saving…' : 'Save'}
                          </Button>
                          <Button variant="secondary" onClick={() => setEditingId(null)}>
                            Cancel
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="mt-5">
                        <ViewsChart days={views[b.id] ?? []} />
                        <div className="mt-4">
                          <Button variant="secondary" size="sm" onClick={() => startEdit(b)}>
                            Edit profile
                          </Button>
                        </div>
                      </div>
                    )}
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
