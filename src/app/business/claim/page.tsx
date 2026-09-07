'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import Input from '@/components/ui/Input';
import Navigation from '@/components/ui/Navigation';
import {
  ClientSession,
  authHeaders,
  clearSession,
  getSession,
} from '@/lib/auth/client-session';

interface CategoryOption {
  id: string;
  name: string;
}

const STEPS = ['Business', 'Ownership', 'Account'] as const;

export default function ClaimBusinessPage() {
  const router = useRouter();
  const handleNavigate = (section: 'directory' | 'admin' | 'user' | 'home') => {
    if (section === 'directory') {
      router.push('/directory');
    } else if (section === 'admin') {
      router.push('/admin');
    } else if (section === 'home') {
      router.push('/');
    }
  };

  const [step, setStep] = useState(0);
  const [form, setForm] = useState({
    name: '',
    description: '',
    categoryId: '',
    location: '',
    website: '',
  });
  const [confirmed, setConfirmed] = useState(false);
  const [categories, setCategories] = useState<CategoryOption[]>([]);
  const [categoriesError, setCategoriesError] = useState(false);
  const [session, setSession] = useState<ClientSession | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [claimed, setClaimed] = useState<{ id: string; name: string } | null>(null);

  useEffect(() => {
    setSession(getSession());
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/categories')
      .then((res) => res.json())
      .then((body) => {
        if (cancelled) return;
        if (body?.success && Array.isArray(body.data?.categories)) {
          setCategories(body.data.categories);
        } else {
          setCategoriesError(true);
        }
      })
      .catch(() => {
        if (!cancelled) setCategoriesError(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const step1Valid = useMemo(
    () => form.name.trim().length > 0 && form.name.trim().length <= 255 && form.categoryId !== '',
    [form.name, form.categoryId]
  );

  const handleSubmit = async () => {
    if (!session) return;
    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch('/api/businesses/claim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({
          name: form.name.trim(),
          description: form.description.trim() || undefined,
          categoryId: form.categoryId,
          location: form.location.trim() || undefined,
          website: form.website.trim() || undefined,
        }),
      });
      const body = await response.json();
      if (response.status === 401) {
        clearSession();
        setSession(null);
        setStep(2);
        setError('Your session expired. Please sign in to submit your claim.');
        return;
      }
      if (body?.success && body.data?.business) {
        setClaimed({ id: body.data.business.id, name: body.data.business.name });
      } else {
        setError(body?.error || 'Failed to submit your business. Please try again.');
      }
    } catch {
      setError('Failed to submit your business. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  if (claimed) {
    return (
      <div className="min-h-screen bg-white dark:bg-neutral-900">
        <Navigation onNavigate={handleNavigate} />
        <div className="py-12 px-4">
          <div className="flex items-center justify-center">
            <Card variant="elevated" padding="lg" className="max-w-md text-center bg-white dark:bg-neutral-800">
              <h1 className="text-2xl font-bold text-neutral-900 dark:text-white mb-4">
                {claimed.name} has been claimed!
              </h1>
              <p className="text-neutral-600 dark:text-neutral-300 mb-6">
                Your listing is now <span className="font-medium">unverified</span>. Our team will review it, and you can track its status from your dashboard.
              </p>
              <div className="flex flex-col gap-3">
                <Link href="/owner" className="block">
                  <Button variant="primary" className="w-full">
                    Go to My Dashboard
                  </Button>
                </Link>
                <Link href="/directory" className="block">
                  <Button variant="secondary" className="w-full">
                    Browse Businesses
                  </Button>
                </Link>
              </div>
            </Card>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white dark:bg-neutral-900">
      <Navigation onNavigate={handleNavigate} />
      <div className="py-8 px-4">
        <div className="max-w-2xl mx-auto">
          <h1 className="text-3xl font-bold text-neutral-900 dark:text-white mb-4">
            Claim Your Business
          </h1>
          <p className="text-neutral-600 dark:text-neutral-300 mb-8">
            Claim your Black-owned business in three quick steps. New claims start as unverified and are reviewed by our team.
          </p>

          <ol className="flex items-center gap-2 mb-8" aria-label="Claim progress">
            {STEPS.map((label, i) => (
              <li key={label} className="flex items-center gap-2">
                <span
                  className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold ${
                    i < step
                      ? 'bg-heritage-ochre text-white'
                      : i === step
                        ? 'bg-neutral-900 dark:bg-white text-white dark:text-neutral-900'
                        : 'bg-neutral-200 dark:bg-neutral-700 text-neutral-500 dark:text-neutral-300'
                  }`}
                >
                  {i + 1}
                </span>
                <span className="text-sm font-medium text-neutral-700 dark:text-neutral-300">{label}</span>
                {i < STEPS.length - 1 && <span className="w-8 h-px bg-neutral-300 dark:bg-neutral-600" aria-hidden="true" />}
              </li>
            ))}
          </ol>

          {error && (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 px-4 py-3 rounded-lg mb-6" role="alert">
              {error}
            </div>
          )}

          <Card variant="elevated" padding="lg" className="bg-white dark:bg-neutral-800">
            {step === 0 && (
              <div className="space-y-6">
                <div>
                  <label htmlFor="name" className="block text-sm font-medium text-neutral-700 dark:text-neutral-200 mb-2">
                    Business Name *
                  </label>
                  <Input
                    id="name"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    placeholder="Enter your business name"
                    maxLength={255}
                    required
                  />
                </div>

                <div>
                  <label htmlFor="category" className="block text-sm font-medium text-neutral-700 dark:text-neutral-200 mb-2">
                    Category *
                  </label>
                  {categoriesError ? (
                    <p className="text-sm text-red-600 dark:text-red-400">
                      Couldn&apos;t load categories. Refresh the page to try again.
                    </p>
                  ) : (
                    <select
                      id="category"
                      value={form.categoryId}
                      onChange={(e) => setForm({ ...form, categoryId: e.target.value })}
                      className="w-full px-3 py-2 border border-neutral-300 dark:border-neutral-600 rounded-lg bg-white dark:bg-neutral-700 text-neutral-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-neutral-900 dark:focus:ring-white"
                      required
                    >
                      <option value="">Select a category</option>
                      {categories.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  )}
                </div>

                <div>
                  <label htmlFor="description" className="block text-sm font-medium text-neutral-700 dark:text-neutral-200 mb-2">
                    Description (optional)
                  </label>
                  <textarea
                    id="description"
                    value={form.description}
                    onChange={(e) => setForm({ ...form, description: e.target.value })}
                    placeholder="Tell us about your business..."
                    rows={4}
                    maxLength={2000}
                    className="w-full px-3 py-2 border border-neutral-300 dark:border-neutral-600 rounded-lg bg-white dark:bg-neutral-700 text-neutral-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-neutral-900 dark:focus:ring-white"
                  />
                </div>

                <div>
                  <label htmlFor="location" className="block text-sm font-medium text-neutral-700 dark:text-neutral-200 mb-2">
                    Location (optional)
                  </label>
                  <Input
                    id="location"
                    value={form.location}
                    onChange={(e) => setForm({ ...form, location: e.target.value })}
                    placeholder="City, State"
                    maxLength={255}
                  />
                </div>

                <div>
                  <label htmlFor="website" className="block text-sm font-medium text-neutral-700 dark:text-neutral-200 mb-2">
                    Website (optional)
                  </label>
                  <Input
                    id="website"
                    type="url"
                    value={form.website}
                    onChange={(e) => setForm({ ...form, website: e.target.value })}
                    placeholder="https://yourbusiness.com"
                    maxLength={500}
                  />
                </div>

                <div className="flex justify-end">
                  <Button variant="primary" disabled={!step1Valid} onClick={() => setStep(1)}>
                    Next
                  </Button>
                </div>
              </div>
            )}

            {step === 1 && (
              <div className="space-y-6">
                <div>
                  <h2 className="text-lg font-semibold text-neutral-900 dark:text-white mb-3">
                    Confirm Ownership
                  </h2>
                  <label htmlFor="ownership" className="flex items-start gap-3 text-sm text-neutral-700 dark:text-neutral-300">
                    <input
                      id="ownership"
                      type="checkbox"
                      checked={confirmed}
                      onChange={(e) => setConfirmed(e.target.checked)}
                      className="mt-0.5 h-4 w-4 rounded border-neutral-300 dark:border-neutral-600"
                    />
                    <span>
                      I confirm that I own or operate &ldquo;{form.name.trim() || 'this business'}&rdquo; and that the information provided is accurate.
                    </span>
                  </label>
                </div>

                <div className="flex justify-between">
                  <Button variant="secondary" onClick={() => setStep(0)}>
                    Back
                  </Button>
                  <Button variant="primary" disabled={!confirmed} onClick={() => setStep(2)}>
                    Next
                  </Button>
                </div>
              </div>
            )}

            {step === 2 && (
              <div className="space-y-6">
                <div>
                  <h2 className="text-lg font-semibold text-neutral-900 dark:text-white mb-3">
                    Sign In to Submit
                  </h2>
                  {session ? (
                    <p className="text-sm text-neutral-700 dark:text-neutral-300">
                      Signing in as <span className="font-medium">{session.user.email}</span>. Your claim will be listed under your account.
                    </p>
                  ) : (
                    <div className="text-sm text-neutral-700 dark:text-neutral-300 space-y-4">
                      <p>
                        Claiming a business requires an account so you can manage and verify your listing.
                      </p>
                      <div className="flex flex-wrap gap-3">
                        <Link href="/login" className="block">
                          <Button variant="primary">Sign In</Button>
                        </Link>
                        <Link href="/register" className="block">
                          <Button variant="secondary">Create Account</Button>
                        </Link>
                      </div>
                    </div>
                  )}
                </div>

                <div className="flex justify-between">
                  <Button variant="secondary" onClick={() => setStep(1)}>
                    Back
                  </Button>
                  {session && (
                    <Button variant="primary" disabled={submitting} onClick={handleSubmit}>
                      {submitting ? 'Submitting...' : 'Submit Claim'}
                    </Button>
                  )}
                </div>
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
