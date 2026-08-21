'use client';

import React, { useState, useEffect } from 'react';
import { Navigation } from '@/components/ui/Navigation';
import { Card, Badge, Button, Input, Tabs, TabPanel } from '@/components/ui';
import { ScrapeJob, ScrapeJobStatus, CreateScrapeJobInput } from '@/types/scrape-job';

interface ScrapeJobFormData {
  source: string;
  query: string;
  location: string;
}

const SOURCE_OPTIONS = ['Google Maps', 'Facebook', 'Yelp'];

export default function ScrapeJobPage() {
  const [activeTab, setActiveTab] = useState<'create' | 'active'>('create');
  const [formData, setFormData] = useState<ScrapeJobFormData>({
    source: '',
    query: '',
    location: '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const [activeJobs, setActiveJobs] = useState<ScrapeJob[]>([]);
  const [isLoadingJobs, setIsLoadingJobs] = useState(false);

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!formData.source || formData.source.trim() === '') {
      newErrors.source = 'Source is required';
    }

    if (!formData.query || formData.query.trim() === '') {
      newErrors.query = 'Query is required';
    }

    if (!formData.location || formData.location.trim() === '') {
      newErrors.location = 'Location is required';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) {
      return;
    }

    setIsSubmitting(true);
    setSubmitSuccess(false);

    try {
      const response = await fetch('/api/scrape-jobs', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData),
      });

      const result = await response.json();

      if (response.ok && result.success) {
        setSubmitSuccess(true);
        setFormData({ source: '', query: '', location: '' });
        setErrors({});
        // Refresh active jobs list
        fetchActiveJobs();
      } else {
        setErrors({ submit: result.error || 'Failed to create scrape job' });
      }
    } catch (error) {
      console.error('Error creating scrape job:', error);
      setErrors({ submit: 'An error occurred while creating the job' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const fetchActiveJobs = async () => {
    setIsLoadingJobs(true);
    try {
      const response = await fetch('/api/scrape-jobs?status=running');
      const result = await response.json();

      if (result.success) {
        setActiveJobs(result.data || []);
      }
    } catch (error) {
      console.error('Error fetching active jobs:', error);
    } finally {
      setIsLoadingJobs(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'active') {
      fetchActiveJobs();
    }
  }, [activeTab]);

  const getStatusBadge = (status: ScrapeJobStatus) => {
    const variants: Record<ScrapeJobStatus, 'default' | 'primary' | 'success' | 'warning'> = {
      pending: 'warning',
      running: 'primary',
      completed: 'success',
      failed: 'default',
      cancelled: 'default',
    };

    const labels: Record<ScrapeJobStatus, string> = {
      pending: 'Pending',
      running: 'Running',
      completed: 'Completed',
      failed: 'Failed',
      cancelled: 'Cancelled',
    };

    return (
      <Badge variant={variants[status]} size="sm">
        {labels[status]}
      </Badge>
    );
  };

  return (
    <main className="min-h-screen bg-neutral-50">
      {/* Navigation */}
      <Navigation
        onNavigate={(section) => {
          console.log('Navigate to:', section);
        }}
      />

      {/* Header */}
      <section className="bg-gradient-to-br from-heritage-midnight via-heritage-royal to-heritage-forest text-white py-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div>
            <h1 className="text-3xl font-bold mb-2">Scraping Console</h1>
            <p className="text-neutral-100">Create and monitor data scraping jobs</p>
          </div>
        </div>
      </section>

      {/* Main Content */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Tabs */}
        <Tabs
          tabs={[
            { key: 'create', label: 'Create Job' },
            { key: 'active', label: `Active Jobs (${activeJobs.length})` },
          ]}
          selectedKey={activeTab}
          onSelectionChange={(key) => setActiveTab(key as typeof activeTab)}
        />

        {/* Create Job Tab */}
        <TabPanel value="create" className="mt-6">
          <Card variant="elevated" padding="lg">
            <h2 className="text-xl font-bold text-neutral-800 mb-6">Create New Scrape Job</h2>

            {submitSuccess && (
              <div className="mb-6 p-4 bg-heritage-jade/10 border border-heritage-jade rounded-lg">
                <p className="text-heritage-forest font-medium">Scrape job created successfully!</p>
              </div>
            )}

            {errors.submit && (
              <div className="mb-6 p-4 bg-heritage-crimson/10 border border-heritage-crimson rounded-lg">
                <p className="text-heritage-crimson font-medium">{errors.submit}</p>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-6">
              <div>
                <label className="block text-sm font-medium mb-1.5 text-neutral-700">
                  Source
                </label>
                <select
                  value={formData.source}
                  onChange={(e) => setFormData({ ...formData, source: e.target.value })}
                  className={`
                    w-full px-4 py-2.5 text-base
                    bg-white border rounded-lg
                    transition-all duration-150
                    focus:outline-none focus:ring-2 focus:ring-offset-2
                    ${errors.source
                      ? 'border-heritage-crimson focus:ring-heritage-crimson text-heritage-crimson'
                      : 'border-neutral-300 focus:border-heritage-ochre focus:ring-heritage-ochre'
                    }
                  `}
                >
                  <option value="">Select a source</option>
                  {SOURCE_OPTIONS.map((source) => (
                    <option key={source} value={source}>
                      {source}
                    </option>
                  ))}
                </select>
                {errors.source && (
                  <p className="mt-1.5 text-sm text-heritage-crimson">{errors.source}</p>
                )}
              </div>

              <Input
                label="Query"
                placeholder="Enter search query (e.g., 'Black owned restaurants')"
                value={formData.query}
                onChange={(e) => setFormData({ ...formData, query: e.target.value })}
                error={errors.query}
                fullWidth
              />

              <Input
                label="Location"
                placeholder="Enter location (e.g., 'Atlanta, GA')"
                value={formData.location}
                onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                error={errors.location}
                fullWidth
              />

              <div className="pt-4">
                <Button
                  type="submit"
                  variant="primary"
                  size="lg"
                  isLoading={isSubmitting}
                  loadingText="Creating job..."
                  fullWidth
                >
                  Start Scraping
                </Button>
              </div>
            </form>
          </Card>
        </TabPanel>

        {/* Active Jobs Tab */}
        <TabPanel value="active" className="mt-6">
          <Card variant="elevated" padding="lg">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-neutral-800">Active Scrape Jobs</h2>
              <Button
                variant="secondary"
                size="sm"
                onClick={fetchActiveJobs}
                isLoading={isLoadingJobs}
              >
                Refresh
              </Button>
            </div>

            {isLoadingJobs ? (
              <div className="text-center py-8">
                <p className="text-neutral-500">Loading jobs...</p>
              </div>
            ) : activeJobs.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-neutral-500">No active jobs at the moment</p>
              </div>
            ) : (
              <div className="space-y-4">
                {activeJobs.map((job) => (
                  <Card key={job.id} variant="outlined" padding="md">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <h3 className="font-semibold text-neutral-800">{job.source}</h3>
                          {getStatusBadge(job.status)}
                        </div>
                        <p className="text-sm text-neutral-600 mb-1">
                          Query: {job.query}
                        </p>
                        <p className="text-sm text-neutral-600 mb-1">
                          Location: {job.location}
                        </p>
                        <p className="text-sm text-neutral-500">
                          Created: {new Date(job.createdAt).toLocaleString()}
                        </p>
                        {job.errorMessage && (
                          <p className="text-sm text-heritage-crimson mt-2">
                            Error: {job.errorMessage}
                          </p>
                        )}
                      </div>
                      {job.status === 'running' && (
                        <div className="flex items-center gap-2">
                          <span className="animate-pulse w-2 h-2 bg-heritage-jade rounded-full"></span>
                          <span className="text-sm text-heritage-forest">Running</span>
                        </div>
                      )}
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </Card>
        </TabPanel>
      </section>

      {/* Footer */}
      <footer className="bg-neutral-950 text-neutral-500 py-12 mt-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center text-sm">
            <p>&copy; 2026 Black Owned Admin Console. All rights reserved.</p>
          </div>
        </div>
      </footer>
    </main>
  );
}
