'use client';

import React, { useState } from 'react';
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import { Navigation } from '@/components/ui/Navigation';
import { Review, ReviewList } from '@/components/ui/Review';

// Mock dashboard data for business owner
const MOCK_DASHBOARD_DATA = {
  businessName: 'Cozy Corner Cafe',
  weeklyViews: 150,
  unreadChats: 3,
  verificationStatus: 'verified' as const,
  recentReviews: [
    {
      id: '1',
      reviewerName: 'Marcus Johnson',
      rating: 5,
      date: '2026-07-20',
      title: 'Great atmosphere and food!',
      content: 'Love coming here for brunch on weekends. The staff is friendly and the food is always delicious.',
      isVerifiedPurchase: true,
      helpfulCount: 5,
    },
    {
      id: '2',
      reviewerName: 'Sarah Williams',
      rating: 4,
      date: '2026-07-18',
      title: 'Solid choice',
      content: 'Good food and reasonable prices. Would recommend trying their specials.',
      isVerifiedPurchase: true,
      helpfulCount: 3,
    },
    {
      id: '3',
      reviewerName: 'James Peterson',
      rating: 5,
      date: '2026-07-15',
      title: 'Best in the neighborhood',
      content: 'Been a regular for over a year now. Never disappoints!',
      isVerifiedPurchase: true,
      helpfulCount: 8,
    },
    {
      id: '4',
      reviewerName: 'Emily Davis',
      rating: 4,
      date: '2026-07-12',
      title: 'Nice experience',
      content: 'Clean place with good service. The menu has nice variety.',
      isVerifiedPurchase: true,
      helpfulCount: 2,
    },
    {
      id: '5',
      reviewerName: 'Michael Brown',
      rating: 5,
      date: '2026-07-10',
      title: 'Highly recommend',
      content: 'Outstanding food and service. Will definitely be back!',
      isVerifiedPurchase: true,
      helpfulCount: 6,
    },
  ] as Review[],
};

export default function BusinessDashboardPage() {
  const [timeRange, setTimeRange] = useState<'week' | 'month'>('week');

  const dashboardData = MOCK_DASHBOARD_DATA;

  const handleChatClick = () => {
    console.log('Navigate to chat');
  };

  return (
    <main className="min-h-screen bg-neutral-50">
      {/* Navigation */}
      <Navigation
        onNavigate={(section) => {
          console.log('Navigate to:', section);
        }}
      />

      {/* Dashboard Header */}
      <section className="bg-white border-b border-neutral-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2 mb-2">
                {dashboardData.verificationStatus === 'verified' && (
                  <Badge variant="success" size="sm" className="bg-green-600 text-white">
                    Verified
                  </Badge>
                )}
                <Badge variant="primary" size="sm">
                  Business Owner Dashboard
                </Badge>
              </div>
              <h1 className="text-3xl font-bold text-neutral-900">
                {dashboardData.businessName}
              </h1>
            </div>
          </div>
        </div>
      </section>

      {/* Dashboard Stats */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
          {/* Views Card */}
          <Card variant="elevated" padding="lg">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-neutral-500 mb-1">
                  {timeRange === 'week' ? 'Weekly' : 'Monthly'} Views
                </p>
                <p className="text-3xl font-bold text-neutral-900">
                  {timeRange === 'week' ? dashboardData.weeklyViews : 'N/A'}
                </p>
                <p className="text-sm text-neutral-600 mt-1">
                  {timeRange === 'week'
                    ? `${dashboardData.weeklyViews} views this week`
                    : 'Switch to week view for data'}
                </p>
              </div>
              <div className="text-4xl text-heritage-ochre">
                👁️
              </div>
            </div>
          </Card>

          {/* Unread Chats Card */}
          <Card variant="elevated" padding="lg">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-neutral-500 mb-1">Unread Messages</p>
                <p className="text-3xl font-bold text-neutral-900">
                  {dashboardData.unreadChats}
                </p>
                <button
                  onClick={handleChatClick}
                  className="text-sm text-heritage-ochre hover:underline mt-1 flex items-center gap-1"
                >
                  {dashboardData.unreadChats} unread →
                </button>
              </div>
              <div className="text-4xl text-heritage-ochre">
                💬
              </div>
            </div>
          </Card>

          {/* Verification Status Card */}
          <Card variant="elevated" padding="lg">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-neutral-500 mb-1">Verification Status</p>
                <div className="flex items-center gap-2 mt-2">
                  {dashboardData.verificationStatus === 'verified' && (
                    <Badge variant="success" size="md" className="bg-green-600 text-white">
                      ✓ Verified
                    </Badge>
                  )}
                </div>
                <p className="text-sm text-neutral-600 mt-2">
                  Your business is verified
                </p>
              </div>
              <div className="text-4xl text-green-600">
                ✓
              </div>
            </div>
          </Card>
        </div>

        {/* Recent Reviews Section */}
        <div className="mt-8">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-2xl font-bold text-neutral-800">Recent Reviews</h2>
            <div className="flex gap-2">
              <button
                onClick={() => setTimeRange('week')}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                  timeRange === 'week'
                    ? 'bg-heritage-ochre text-white'
                    : 'bg-neutral-200 text-neutral-700 hover:bg-neutral-300'
                }`}
              >
                Week
              </button>
              <button
                onClick={() => setTimeRange('month')}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                  timeRange === 'month'
                    ? 'bg-heritage-ochre text-white'
                    : 'bg-neutral-200 text-neutral-700 hover:bg-neutral-300'
                }`}
              >
                Month
              </button>
            </div>
          </div>
          <ReviewList
            reviews={dashboardData.recentReviews.slice(0, 5)}
            averageRating={
              dashboardData.recentReviews.reduce((sum, r) => sum + r.rating, 0) /
              dashboardData.recentReviews.length
            }
            totalReviews={dashboardData.recentReviews.length}
          />
        </div>
      </section>
    </main>
  );
}
