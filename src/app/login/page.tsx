'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import Input from '@/components/ui/Input';
import Navigation from '@/components/ui/Navigation';
import { getSession, saveSession } from '@/lib/auth/client-session';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (getSession()) router.replace('/owner');
  }, [router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const body = await res.json();

      if (res.ok && body.success) {
        saveSession({
          accessToken: body.tokens.accessToken,
          refreshToken: body.tokens.refreshToken,
          user: body.user,
        });
        router.replace('/owner');
      } else {
        setError(body.error || 'Sign in failed');
      }
    } catch {
      setError('Sign in failed. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-white dark:bg-neutral-900">
      <Navigation />
      <div className="py-12 px-4">
        <div className="flex items-center justify-center">
          <Card variant="elevated" padding="lg" className="w-full max-w-md bg-white dark:bg-neutral-800">
            <h1 className="text-2xl font-bold text-neutral-900 dark:text-white mb-2">Sign In</h1>
            <p className="text-neutral-600 dark:text-neutral-300 mb-6">
              Sign in to manage your listed businesses.
            </p>

            {error && (
              <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 px-4 py-3 rounded-lg mb-6">
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-6">
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-neutral-700 dark:text-neutral-200 mb-2">
                  Email *
                </label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  required
                />
              </div>

              <div>
                <label htmlFor="password" className="block text-sm font-medium text-neutral-700 dark:text-neutral-200 mb-2">
                  Password *
                </label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Your password"
                  required
                />
              </div>

              <Button type="submit" variant="primary" disabled={submitting} className="w-full">
                {submitting ? 'Signing in...' : 'Sign In'}
              </Button>
            </form>

            <p className="text-sm text-neutral-600 dark:text-neutral-300 mt-6 text-center">
              No account yet?{' '}
              <Link href="/register" className="font-medium text-neutral-900 dark:text-white hover:underline">
                Create one
              </Link>
            </p>
          </Card>
        </div>
      </div>
    </div>
  );
}
