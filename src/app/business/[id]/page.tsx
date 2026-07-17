'use client';

import React, { useState } from 'react';
import { notFound } from 'next/navigation';
import { Carousel } from '@/components/ui/Carousel';
import { ReviewList, Review } from '@/components/ui/Review';
import { Button, Badge, Card } from '@/components/ui';
import { Navigation } from '@/components/ui/Navigation';
import { Tabs, TabPanel } from '@/components/ui/Tabs';
import { Toast, useToast } from '@/components/ui/Toast';

// Mock business data - in production this would come from an API
const MOCK_BUSINESS = {
  id: '1',
  name: 'Soul Food Kitchen',
  category: 'Food & Dining',
  rating: 4.8,
  reviewCount: 156,
  location: 'Harlem, NY',
  isVerified: true,
  description: 'Authentic Southern cuisine with a modern twist. Family-owned since 1985.',
  phone: '(212) 555-0123',
  website: 'https://soulfoodkitchen.example.com',
  address: '123 Malcolm X Blvd, Harlem, NY 10026',
  hours: {
    monday: '11:00 AM - 10:00 PM',
    tuesday: '11:00 AM - 10:00 PM',
    wednesday: '11:00 AM - 10:00 PM',
    thursday: '11:00 AM - 10:00 PM',
    friday: '11:00 AM - 11:00 PM',
    saturday: '10:00 AM - 11:00 PM',
    sunday: '10:00 AM - 9:00 PM',
  },
  images: [
    'https://images.unsplash.com/photo-1555939594-58d7cb561ad1?w=800&q=80',
    'https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=800&q=80',
    'https://images.unsplash.com/photo-1559339352-11d035aa65de?w=800&q=80',
    'https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?w=800&q=80',
  ],
  tags: ['Southern', 'Family-Friendly', 'Takeout', 'Dine-in'],
  amenities: ['Wheelchair Accessible', 'Free WiFi', 'Outdoor Seating', 'Parking Available'],
  reviews: [
    {
      id: '1',
      reviewerName: 'Marcus Johnson',
      rating: 5,
      date: '2026-07-10',
      title: 'Best soul food in the city!',
      content: 'The fried chicken is absolutely incredible - crispy on the outside, juicy on the inside. The mac and cheese is creamy perfection. This place truly captures the essence of Southern hospitality.',
      isVerifiedPurchase: true,
      helpfulCount: 24,
    },
    {
      id: '2',
      reviewerName: 'Tamara Williams',
      rating: 5,
      date: '2026-07-05',
      title: 'A Harlem institution',
      content: 'Been coming here for years and it never disappoints. The staff treats you like family and the portions are generous. The peach cobbler is a must-try!',
      isVerifiedPurchase: true,
      helpfulCount: 18,
    },
    {
      id: '3',
      reviewerName: 'James Peterson',
      rating: 4,
      date: '2026-06-28',
      title: 'Great food, can get crowded',
      content: 'The food is outstanding - definitely some of the best soul food I have had. Just be prepared to wait during peak hours. Worth it though!',
      isVerifiedPurchase: true,
      helpfulCount: 12,
    },
  ] as Review[],
};

export default function BusinessDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const [activeTab, setActiveTab] = useState<'overview' | 'reviews' | 'reserve'>('overview');
  const [isSaved, setIsSaved] = useState(false);
  const { addToast } = useToast();

  // In a real app, you would fetch the business data here
  const business = MOCK_BUSINESS;

  const handleSave = () => {
    setIsSaved(!isSaved);
    addToast(
      isSaved ? 'Removed from saved' : 'Business saved!',
      { variant: isSaved ? 'default' : 'success' },
    );
  };

  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: business.name,
          text: `Check out ${business.name} on Black Owned`,
          url: window.location.href,
        });
      } catch (err) {
        console.log('Share cancelled');
      }
    } else {
      navigator.clipboard.writeText(window.location.href);
      addToast(
        'Link copied!',
        { variant: 'success' as const },
      );
    }
  };

  const handleCall = () => {
    window.location.href = `tel:${business.phone}`;
  };

  const handleDirections = () => {
    const query = encodeURIComponent(`${business.name} ${business.address}`);
    window.open(`https://maps.google.com/?q=${query}`, '_blank');
  };

  const handleReserve = () => {
    addToast(
      'Reservation requested!',
      { variant: 'success' as const },
    );
  };

  const renderStars = (rating: number) => {
    const fullStars = Math.floor(rating);
    const hasHalfStar = rating % 1 >= 0.5;

    return (
      <div className="flex items-center gap-0.5" aria-label={`Rating: ${rating} out of 5 stars`}>
        {[...Array(5)].map((_, index) => {
          if (index < fullStars) {
            return (
              <span key={index} className="text-heritage-ochre" aria-hidden="true">
                ★
              </span>
            );
          }
          if (index === fullStars && hasHalfStar) {
            return (
              <span key={index} className="text-heritage-ochre/50" aria-hidden="true">
                ★
              </span>
            );
          }
          return (
            <span key={index} className="text-neutral-300" aria-hidden="true">
              ★
            </span>
          );
        })}
      </div>
    );
  };

  const getCurrentDayHours = () => {
    const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    const today = days[new Date().getDay()];
    return business.hours[today as keyof typeof business.hours];
  };

  return (
    <main className="min-h-screen bg-neutral-50">
      {/* Navigation */}
      <Navigation
        onNavigate={(section) => {
          console.log('Navigate to:', section);
        }}
      />

      {/* Hero Image Gallery */}
      <section className="bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <Carousel
            images={business.images}
            altPrefix={business.name}
          />
        </div>
      </section>

      {/* Business Header */}
      <section className="bg-white border-b border-neutral-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="flex flex-col lg:flex-row gap-8">
            {/* Main Info */}
            <div className="flex-1">
              <div className="flex items-start justify-between flex-wrap gap-4">
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    {business.isVerified && (
                      <Badge variant="secondary" size="sm" className="bg-green-600 text-white">
                        ✓ Verified Business
                      </Badge>
                    )}
                    <Badge variant="primary" size="sm">
                      {business.category}
                    </Badge>
                  </div>
                  <h1 className="text-4xl font-bold text-neutral-900 mb-2">{business.name}</h1>
                  <div className="flex items-center gap-4 flex-wrap">
                    <div className="flex items-center gap-2">
                      {renderStars(business.rating)}
                      <span className="text-neutral-700 font-medium">{business.rating.toFixed(1)}</span>
                      <span className="text-neutral-500">({business.reviewCount} reviews)</span>
                    </div>
                    <span className="text-neutral-400">•</span>
                    <span className="text-neutral-600">{business.location}</span>
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="flex gap-2 flex-wrap">
                  <Button variant="primary" size="md" onClick={handleCall}>
                    📞 Call
                  </Button>
                  <Button variant="secondary" size="md" onClick={handleDirections}>
                    🗺️ Directions
                  </Button>
                  <Button
                    variant={isSaved ? 'primary' : 'secondary'}
                    size="md"
                    onClick={handleSave}
                  >
                    {isSaved ? '💾 Saved' : '💾 Save'}
                  </Button>
                  <Button variant="ghost" size="md" onClick={handleShare}>
                    🔗 Share
                  </Button>
                </div>
              </div>

              {/* Quick Info */}
              <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <h3 className="font-semibold text-neutral-800 mb-2">Hours</h3>
                  <p className="text-neutral-600">{getCurrentDayHours()}</p>
                  <p className="text-sm text-neutral-500 mt-1">
                    Open today • See all hours for the week
                  </p>
                </div>
                <div>
                  <h3 className="font-semibold text-neutral-800 mb-2">Contact</h3>
                  <p className="text-neutral-600">{business.phone}</p>
                  <a href={business.website} className="text-sm text-heritage-ochre hover:underline">
                    {business.website}
                  </a>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Main Content */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid lg:grid-cols-3 gap-8">
          {/* Left Column - Main Content */}
          <div className="lg:col-span-2">
            <Tabs
              tabs={[
                { key: 'overview', label: 'Overview' },
                { key: 'reviews', label: `Reviews (${business.reviewCount})` },
                { key: 'reserve', label: 'Reserve / Inquire' },
              ]}
              selectedKey={activeTab}
              onSelectionChange={(key) => setActiveTab(key as 'overview' | 'reviews' | 'reserve')}
            />

            <TabPanel value="overview" className="mt-6">
              <Card variant="elevated" padding="lg">
                <h2 className="text-2xl font-bold text-neutral-800 mb-4">About {business.name}</h2>
                <p className="text-neutral-600 text-lg leading-relaxed">{business.description}</p>

                <div className="mt-6">
                  <h3 className="font-semibold text-neutral-800 mb-3">Tags</h3>
                  <div className="flex flex-wrap gap-2">
                    {business.tags.map((tag) => (
                      <Badge key={tag} variant="default" size="md">
                        {tag}
                      </Badge>
                    ))}
                  </div>
                </div>

                {business.amenities.length > 0 && (
                  <div className="mt-6">
                    <h3 className="font-semibold text-neutral-800 mb-3">Amenities</h3>
                    <div className="grid grid-cols-2 gap-3">
                      {business.amenities.map((amenity) => (
                        <div key={amenity} className="flex items-center gap-2 text-neutral-600">
                          <span className="text-heritage-ochre">✓</span>
                          {amenity}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="mt-6">
                  <h3 className="font-semibold text-neutral-800 mb-3">Location</h3>
                  <p className="text-neutral-600">{business.address}</p>
                  <Button variant="ghost" size="sm" onClick={handleDirections} className="mt-2">
                    Get Directions →
                  </Button>
                </div>
              </Card>
            </TabPanel>

            <TabPanel value="reviews" className="mt-6">
              <ReviewList
                reviews={business.reviews}
                averageRating={business.rating}
                totalReviews={business.reviewCount}
              />
            </TabPanel>

            <TabPanel value="reserve" className="mt-6">
              <Card variant="elevated" padding="lg">
                <h2 className="text-2xl font-bold text-neutral-800 mb-4">
                  {business.category === 'Food & Dining' ? 'Make a Reservation' : 'Send an Inquiry'}
                </h2>
                <p className="text-neutral-600 mb-6">
                  {business.category === 'Food & Dining'
                    ? 'Reserve a table at ' + business.name + '.'
                    : 'Send a message to ' + business.name + ' to inquire about their services.'}
                </p>

                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    handleReserve();
                  }}
                  className="space-y-4"
                >
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label htmlFor="name" className="block text-sm font-medium text-neutral-700 mb-1">
                        Name *
                      </label>
                      <input
                        type="text"
                        id="name"
                        required
                        className="w-full px-4 py-2 border border-neutral-300 rounded-lg focus:ring-2 focus:ring-heritage-ochre focus:border-transparent"
                      />
                    </div>
                    <div>
                      <label htmlFor="email" className="block text-sm font-medium text-neutral-700 mb-1">
                        Email *
                      </label>
                      <input
                        type="email"
                        id="email"
                        required
                        className="w-full px-4 py-2 border border-neutral-300 rounded-lg focus:ring-2 focus:ring-heritage-ochre focus:border-transparent"
                      />
                    </div>
                  </div>

                  {business.category === 'Food & Dining' && (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div>
                        <label htmlFor="date" className="block text-sm font-medium text-neutral-700 mb-1">
                          Date *
                        </label>
                        <input
                          type="date"
                          id="date"
                          required
                          className="w-full px-4 py-2 border border-neutral-300 rounded-lg focus:ring-2 focus:ring-heritage-ochre focus:border-transparent"
                        />
                      </div>
                      <div>
                        <label htmlFor="time" className="block text-sm font-medium text-neutral-700 mb-1">
                          Time *
                        </label>
                        <input
                          type="time"
                          id="time"
                          required
                          className="w-full px-4 py-2 border border-neutral-300 rounded-lg focus:ring-2 focus:ring-heritage-ochre focus:border-transparent"
                        />
                      </div>
                      <div>
                        <label htmlFor="guests" className="block text-sm font-medium text-neutral-700 mb-1">
                          Guests *
                        </label>
                        <select
                          id="guests"
                          required
                          className="w-full px-4 py-2 border border-neutral-300 rounded-lg focus:ring-2 focus:ring-heritage-ochre focus:border-transparent"
                        >
                          {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
                            <option key={n} value={n}>
                              {n} {n === 1 ? 'Guest' : 'Guests'}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  )}

                  <div>
                    <label htmlFor="message" className="block text-sm font-medium text-neutral-700 mb-1">
                      Message
                    </label>
                    <textarea
                      id="message"
                      rows={4}
                      className="w-full px-4 py-2 border border-neutral-300 rounded-lg focus:ring-2 focus:ring-heritage-ochre focus:border-transparent"
                      placeholder="Any special requests or notes?"
                    />
                  </div>

                  <Button type="submit" variant="primary" size="lg" className="w-full">
                    {business.category === 'Food & Dining' ? 'Request Reservation' : 'Send Inquiry'}
                  </Button>
                </form>
              </Card>
            </TabPanel>
          </div>

          {/* Right Column - Sidebar */}
          <div className="lg:col-span-1">
            <div className="sticky top-24 space-y-6">
              {/* Quick Actions Card */}
              <Card variant="elevated" padding="lg">
                <h3 className="font-semibold text-neutral-800 mb-4">Quick Actions</h3>
                <div className="space-y-3">
                  <Button variant="primary" size="md" onClick={handleCall} className="w-full">
                    📞 {business.phone}
                  </Button>
                  <Button variant="secondary" size="md" onClick={handleDirections} className="w-full">
                    🗺️ Get Directions
                  </Button>
                  <Button
                    variant={isSaved ? 'primary' : 'secondary'}
                    size="md"
                    onClick={handleSave}
                    className="w-full"
                  >
                    {isSaved ? '✓ Saved' : '💾 Save Business'}
                  </Button>
                </div>
              </Card>

              {/* Info Card */}
              <Card variant="elevated" padding="lg">
                <h3 className="font-semibold text-neutral-800 mb-4">Information</h3>
                <div className="space-y-4">
                  <div>
                    <h4 className="text-sm font-medium text-neutral-500 mb-1">Address</h4>
                    <p className="text-neutral-700">{business.address}</p>
                  </div>
                  <div>
                    <h4 className="text-sm font-medium text-neutral-500 mb-1">Hours Today</h4>
                    <p className="text-neutral-700">{getCurrentDayHours()}</p>
                  </div>
                  <div>
                    <h4 className="text-sm font-medium text-neutral-500 mb-1">Website</h4>
                    <a
                      href={business.website}
                      className="text-heritage-ochre hover:underline"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {business.website}
                    </a>
                  </div>
                </div>
              </Card>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-neutral-950 text-neutral-400 py-12 mt-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid md:grid-cols-4 gap-8">
            <div>
              <h4 className="text-white font-semibold mb-4">Black Owned</h4>
              <p className="text-sm">
                Celebrating and supporting Black-owned businesses across the nation.
              </p>
            </div>
            <div>
              <h4 className="text-white font-semibold mb-4">Explore</h4>
              <ul className="space-y-2 text-sm">
                <li><a href="#" className="hover:text-white">Businesses</a></li>
                <li><a href="#" className="hover:text-white">Categories</a></li>
                <li><a href="#" className="hover:text-white">Featured</a></li>
              </ul>
            </div>
            <div>
              <h4 className="text-white font-semibold mb-4">Support</h4>
              <ul className="space-y-2 text-sm">
                <li><a href="#" className="hover:text-white">Help Center</a></li>
                <li><a href="#" className="hover:text-white">Contact</a></li>
                <li><a href="#" className="hover:text-white">FAQ</a></li>
              </ul>
            </div>
            <div>
              <h4 className="text-white font-semibold mb-4">Legal</h4>
              <ul className="space-y-2 text-sm">
                <li><a href="#" className="hover:text-white">Privacy Policy</a></li>
                <li><a href="#" className="hover:text-white">Terms of Service</a></li>
              </ul>
            </div>
          </div>
          <div className="border-t border-neutral-800 mt-8 pt-8 text-center text-sm">
            <p>&copy; 2026 Black Owned. All rights reserved.</p>
          </div>
        </div>
      </footer>

    </main>
  );
}
