'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import Input from '@/components/ui/Input';
import Navigation from '@/components/ui/Navigation';

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
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    category: '',
    location: '',
    website: '',
    phone: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    setSubmitting(true);
    setError(null);

    try {
      const response = await fetch('/api/graphql', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query: `
            mutation {
              createBusiness(input: {
                name: "${formData.name}"
                description: "${formData.description}"
                categoryId: "${formData.category}"
                phone: "${formData.phone}"
              }) {
                success
                business {
                  id
                  name
                  phone
                  potentialDuplicateId
                }
                error
                isPotentialDuplicate
                existingBusinessId
              }
            }
          `,
        }),
      });

      const result = await response.json();

      if (result.data?.createBusiness?.success) {
        setSuccess(true);
      } else {
        setError(result.data?.createBusiness?.error || 'Failed to submit business');
      }
    } catch (err) {
      setError('Failed to submit business. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  if (success) {
    return (
      <div className="min-h-screen bg-white dark:bg-neutral-900">
        <Navigation onNavigate={handleNavigate} />
        <div className="py-12 px-4">
          <div className="flex items-center justify-center">
            <Card variant="elevated" padding="lg" className="max-w-md text-center bg-white dark:bg-neutral-800">
              <h1 className="text-2xl font-bold text-neutral-900 dark:text-white mb-4">
                Thank you for your submission!
              </h1>
              <p className="text-neutral-600 dark:text-neutral-300 mb-6">
                Your business listing has been submitted for review. We will contact you within 48 hours.
              </p>
              <Button variant="primary" onClick={() => router.push('/directory')}>
                Browse Businesses
              </Button>
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
            List Your Business
          </h1>
          <p className="text-neutral-600 dark:text-neutral-300 mb-8">
            Join our growing network of Black-owned businesses. Share your story and connect with customers who value authenticity and excellence.
          </p>

          {error && (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 px-4 py-3 rounded-lg mb-6">
              {error}
            </div>
          )}

          <Card variant="elevated" padding="lg" className="bg-white dark:bg-neutral-800">
            <form onSubmit={handleSubmit} className="space-y-6">
              <div>
                <label htmlFor="name" className="block text-sm font-medium text-neutral-700 dark:text-neutral-200 mb-2">
                  Business Name *
                </label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Enter your business name"
                  required
                />
              </div>

              <div>
                <label htmlFor="description" className="block text-sm font-medium text-neutral-700 dark:text-neutral-200 mb-2">
                  Description *
                </label>
                <textarea
                  id="description"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Tell us about your business..."
                  rows={4}
                  className="w-full px-3 py-2 border border-neutral-300 dark:border-neutral-600 rounded-lg bg-white dark:bg-neutral-700 text-neutral-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-neutral-900 dark:focus:ring-white"
                  required
                />
              </div>

              <div>
                <label htmlFor="category" className="block text-sm font-medium text-neutral-700 dark:text-neutral-200 mb-2">
                  Category *
                </label>
                <Input
                  id="category"
                  value={formData.category}
                  onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                  placeholder="e.g., Food & Dining, Professional Services"
                  required
                />
              </div>

              <div>
                <label htmlFor="location" className="block text-sm font-medium text-neutral-700 dark:text-neutral-200 mb-2">
                  Location *
                </label>
                <Input
                  id="location"
                  value={formData.location}
                  onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                  placeholder="City, State"
                  required
                />
              </div>

              <div>
                <label htmlFor="website" className="block text-sm font-medium text-neutral-700 dark:text-neutral-200 mb-2">
                  Website (optional)
                </label>
                <Input
                  id="website"
                  type="url"
                  value={formData.website}
                  onChange={(e) => setFormData({ ...formData, website: e.target.value })}
                  placeholder="https://yourbusiness.com"
                />
              </div>

              <div>
                <label htmlFor="phone" className="block text-sm font-medium text-neutral-700 dark:text-neutral-200 mb-2">
                  Phone (optional)
                </label>
                <Input
                  id="phone"
                  type="tel"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  placeholder="(555) 123-4567"
                />
              </div>

              <Button
                type="submit"
                variant="primary"
                disabled={submitting}
                className="w-full"
              >
                {submitting ? 'Submitting...' : 'Submit Business Listing'}
              </Button>
            </form>
          </Card>
        </div>
      </div>
    </div>
  );
}
