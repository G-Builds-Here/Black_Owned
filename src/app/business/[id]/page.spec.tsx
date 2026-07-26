import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { useRouter } from 'next/navigation';
import BusinessDetailPage from './page';

// Mock Next.js router
jest.mock('next/navigation', () => ({
  useRouter: jest.fn(),
  notFound: jest.fn(),
}));

// Mock the UI components
jest.mock('@/components/ui/Carousel', () => ({
  Carousel: ({ images }: { images: string[] }) => (
    <div data-testid="carousel">
      {images.map((img, idx) => (
        <img key={idx} src={img} alt="carousel" data-testid="carousel-image" />
      ))}
    </div>
  ),
}));

jest.mock('@/components/ui/Review', () => ({
  ReviewList: ({ reviews }: { reviews: unknown[] }) => (
    <div data-testid="review-list">
      {reviews.map((r, idx) => (
        <div key={idx} data-testid="review-item">{JSON.stringify(r)}</div>
      ))}
    </div>
  ),
}));

jest.mock('@/components/ui', () => ({
  Button: ({ children, onClick, 'data-testid': testId }: { children: React.ReactNode; onClick?: () => void; 'data-testid'?: string }) => (
    <button data-testid={testId || 'button'} onClick={onClick}>{children}</button>
  ),
  Badge: ({ children }: { children: React.ReactNode }) => (
    <span data-testid="badge">{children}</span>
  ),
  Card: ({ children, className = '' }: { children: React.ReactNode; className?: string }) => (
    <div data-testid="card" className={className}>{children}</div>
  ),
}));

jest.mock('@/components/ui/Navigation', () => ({
  Navigation: ({ onNavigate }: { onNavigate: (section: string) => void }) => (
    <nav data-testid="navigation" onClick={() => onNavigate('test')} />
  ),
}));

jest.mock('@/components/ui/Tabs', () => ({
  Tabs: ({ tabs, selectedKey, onSelectionChange }: { tabs: { key: string; label: string }[]; selectedKey: string; onSelectionChange: (key: string) => void }) => (
    <div data-testid="tabs">
      {tabs.map((tab) => (
        <button
          key={tab.key}
          data-testid={`tab-${tab.key}`}
          onClick={() => onSelectionChange(tab.key)}
          aria-selected={tab.key === selectedKey}
        >
          {tab.label}
        </button>
      ))}
    </div>
  ),
  TabPanel: ({ value, children }: { value: string; children: React.ReactNode }) => (
    <div data-testid="tab-panel" role="tabpanel">{children}</div>
  ),
}));

jest.mock('@/components/ui/Toast', () => ({
  useToast: () => ({
    addToast: jest.fn(),
  }),
  Toast: ({ children }: { children: React.ReactNode }) => <div data-testid="toast">{children}</div>,
}));

jest.mock('@/components/ui/VerifiedBadge', () => ({
  VerifiedBadge: ({ label }: { label: string }) => (
    <span data-testid="verified-badge">{label}</span>
  ),
}));

const mockParams = { id: '1' };

describe('BusinessDetailPage', () => {
  const mockRouter = {
    push: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (useRouter as jest.Mock).mockReturnValue(mockRouter);
  });

  it('renders the business name in an h1 element', () => {
    render(<BusinessDetailPage params={Promise.resolve(mockParams)} />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Soul Food Kitchen');
  });

  it('renders the gallery carousel with up to 5 images', () => {
    render(<BusinessDetailPage params={Promise.resolve(mockParams)} />);
    expect(screen.getByTestId('carousel')).toBeInTheDocument();
    expect(screen.getAllByTestId('carousel-image')).toHaveLength(4);
  });

  it('renders the business description', () => {
    render(<BusinessDetailPage params={Promise.resolve(mockParams)} />);
    expect(screen.getByText(/Authentic Southern cuisine/)).toBeInTheDocument();
  });

  it('renders the category as a clickable tag', () => {
    render(<BusinessDetailPage params={Promise.resolve(mockParams)} />);
    const categoryBadge = screen.getByText('Food & Dining');
    expect(categoryBadge).toBeInTheDocument();
  });

  it('renders the Google Maps embed', () => {
    render(<BusinessDetailPage params={Promise.resolve(mockParams)} />);
    const iframe = screen.getByTitle('Map for Soul Food Kitchen');
    expect(iframe).toBeInTheDocument();
    expect(iframe).toHaveAttribute('src', expect.stringContaining('google.com/maps/embed'));
  });

  it('renders the star rating', () => {
    render(<BusinessDetailPage params={Promise.resolve(mockParams)} />);
    expect(screen.getByText('4.8')).toBeInTheDocument();
  });

  it('renders the verified badge with correct tooltip text', () => {
    render(<BusinessDetailPage params={Promise.resolve(mockParams)} />);
    expect(screen.getByTestId('verified-badge')).toHaveTextContent('Claimed & Verified');
  });

  it('renders the Chat button', () => {
    render(<BusinessDetailPage params={Promise.resolve(mockParams)} />);
    expect(screen.getByText(/Chat/)).toBeInTheDocument();
  });

  it('renders the Claim button when business is unclaimed', () => {
    render(<BusinessDetailPage params={Promise.resolve(mockParams)} />);
    const claimButton = screen.getByRole('button', { name: /Claim/i });
    expect(claimButton).toBeInTheDocument();
  });

  it('navigates to chat page when Chat button is clicked', () => {
    render(<BusinessDetailPage params={Promise.resolve(mockParams)} />);
    const chatButton = screen.getByRole('button', { name: /Chat/i });
    fireEvent.click(chatButton);
    expect(mockRouter.push).toHaveBeenCalledWith('/chat?businessId=1');
  });

  it('navigates to claim page when Claim button is clicked', () => {
    render(<BusinessDetailPage params={Promise.resolve(mockParams)} />);
    const claimButton = screen.getByRole('button', { name: /Claim/i });
    fireEvent.click(claimButton);
    expect(mockRouter.push).toHaveBeenCalledWith('/claim?businessId=1');
  });

  it('renders the reviews list', () => {
    render(<BusinessDetailPage params={Promise.resolve(mockParams)} />);
    expect(screen.getByTestId('review-list')).toBeInTheDocument();
    expect(screen.getAllByTestId('review-item')).toHaveLength(3);
  });

  it('renders JSON-LD structured data', () => {
    render(<BusinessDetailPage params={Promise.resolve(mockParams)} />);
    const script = document.querySelector('script[type="application/ld+json"]');
    expect(script).toBeInTheDocument();
    expect(script?.textContent).toContain('LocalBusiness');
  });

  it('renders the address', () => {
    render(<BusinessDetailPage params={Promise.resolve(mockParams)} />);
    const addresses = screen.getAllByText(/123 Malcolm X Blvd/);
    expect(addresses.length).toBeGreaterThan(0);
  });

  it('renders the category tag', () => {
    render(<BusinessDetailPage params={Promise.resolve(mockParams)} />);
    const categoryTag = screen.getByText('Food & Dining');
    expect(categoryTag).toBeInTheDocument();
  });
});
