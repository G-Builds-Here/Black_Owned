import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import BusinessDashboardPage from './page';

// Mock the Navigation component
jest.mock('@/components/ui/Navigation', () => {
  const MockNavigation = ({ onNavigate }: { onNavigate: (section: string) => void }) => (
    <nav data-testid="navigation" onClick={() => onNavigate('test')}>Navigation</nav>
  );
  return { Navigation: MockNavigation };
});

// Mock the ReviewList component
jest.mock('@/components/ui/Review', () => {
  const MockReviewList = ({ reviews, averageRating, totalReviews }: {
    reviews: unknown[];
    averageRating: number;
    totalReviews: number;
  }) => (
    <div data-testid="review-list">
      <div data-testid="rating-summary">
        Rating: {averageRating.toFixed(1)} out of {totalReviews} reviews
      </div>
      {reviews.map((review: Record<string, unknown>) => (
        <div key={review.id} data-testid="review-item">
          <span>{review.reviewerName}</span>
          <span>Rating: {review.rating}</span>
        </div>
      ))}
    </div>
  );
  return { ReviewList: MockReviewList };
});

describe('BusinessDashboardPage', () => {
  it('displays the business name', () => {
    render(<BusinessDashboardPage />);
    expect(screen.getByText('Cozy Corner Cafe')).toBeInTheDocument();
  });

  it('displays weekly views count', () => {
    render(<BusinessDashboardPage />);
    expect(screen.getByText('150 views this week')).toBeInTheDocument();
  });

  it('displays unread chats count with chat link', () => {
    render(<BusinessDashboardPage />);
    // Check for the unread count
    expect(screen.getByText('3')).toBeInTheDocument();
    // Check for the chat link button
    const chatLink = screen.getByRole('button', { name: /3 unread/i });
    expect(chatLink).toBeInTheDocument();
  });

  it('displays verification status with green Verified badge', () => {
    render(<BusinessDashboardPage />);
    const verifiedBadge = screen.getByText('Verified');
    expect(verifiedBadge).toBeInTheDocument();
    // Check that the badge has green styling (via class)
    expect(verifiedBadge).toHaveClass('bg-green-600');
  });

  it('displays exactly 5 recent reviews', () => {
    render(<BusinessDashboardPage />);
    const reviewList = screen.getByTestId('review-list');
    const reviewItems = reviewList.querySelectorAll('[data-testid="review-item"]');
    expect(reviewItems.length).toBe(5);
  });

  it('displays reviewer name and star rating for each review', () => {
    render(<BusinessDashboardPage />);
    const reviewList = screen.getByTestId('review-list');

    // Check for first review
    expect(screen.getByText('Marcus Johnson')).toBeInTheDocument();
    expect(reviewList.querySelector('[data-testid="review-item"]')).toHaveTextContent('Rating: 5');

    // Check for other reviewers
    expect(screen.getByText('Sarah Williams')).toBeInTheDocument();
    expect(screen.getByText('James Peterson')).toBeInTheDocument();
    expect(screen.getByText('Emily Davis')).toBeInTheDocument();
    expect(screen.getByText('Michael Brown')).toBeInTheDocument();
  });

  it('displays week/month toggle buttons', () => {
    render(<BusinessDashboardPage />);
    const weekButton = screen.getByText('Week');
    const monthButton = screen.getByText('Month');
    expect(weekButton).toBeInTheDocument();
    expect(monthButton).toBeInTheDocument();
  });

  it('highlights week button as active by default', () => {
    render(<BusinessDashboardPage />);
    const weekButton = screen.getByText('Week');
    expect(weekButton).toHaveClass('bg-heritage-ochre');
    expect(weekButton).toHaveClass('text-white');
  });

  it('switches to month view when month button clicked', () => {
    render(<BusinessDashboardPage />);
    const monthButton = screen.getByText('Month');
    fireEvent.click(monthButton);

    // After clicking month, month button should be active
    expect(monthButton).toHaveClass('bg-heritage-ochre');
    expect(monthButton).toHaveClass('text-white');
  });

  it('displays views panel with views count', () => {
    render(<BusinessDashboardPage />);
    expect(screen.getByText('Weekly Views')).toBeInTheDocument();
    expect(screen.getByText('150')).toBeInTheDocument();
  });

  it('displays unread chats panel', () => {
    render(<BusinessDashboardPage />);
    expect(screen.getByText('Unread Messages')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('displays verification status panel', () => {
    render(<BusinessDashboardPage />);
    expect(screen.getByText('Verification Status')).toBeInTheDocument();
  });

  it('displays Recent Reviews section header', () => {
    render(<BusinessDashboardPage />);
    expect(screen.getByText('Recent Reviews')).toBeInTheDocument();
  });
});
