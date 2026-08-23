import { render, screen } from '@testing-library/react';
import { SocialMediaSection } from './SocialMediaSection';
import { SocialUrls } from '@/services/social-discovery';

const socialUrls: SocialUrls = {
  instagram: {
    url: 'https://instagram.com/maple_bakery',
    handle: 'maple_bakery',
    confidence: 0.95,
    verified: true,
    source: 'google_search',
  },
  youtube: {
    url: 'https://www.youtube.com/@maplebakery',
    handle: 'maplebakery',
    confidence: 0.85,
    verified: false,
    source: 'direct_probe',
  },
  twitter: {
    url: 'https://twitter.com/maplebakery',
    handle: 'maplebakery',
    confidence: 0.6,
    verified: false,
    source: 'direct_probe',
  },
};

describe('SocialMediaSection', () => {
  it('renders the Follow Us heading and a card per platform', () => {
    render(<SocialMediaSection business={{ name: 'Maple Street Bakery', socialUrls }} />);
    expect(screen.getByRole('heading', { name: 'Follow Us' })).toBeInTheDocument();
    expect(screen.getByText('Instagram')).toBeInTheDocument();
    expect(screen.getByText('YouTube')).toBeInTheDocument();
    expect(screen.getByText('Twitter / X')).toBeInTheDocument();
    expect(screen.getByText('@maple_bakery')).toBeInTheDocument();
  });

  it('renders the confidence and source in the card header', () => {
    render(<SocialMediaSection business={{ name: 'Maple Street Bakery', socialUrls }} />);
    expect(screen.getByText('95%')).toBeInTheDocument();
    expect(screen.getByText('google search')).toBeInTheDocument();
    // both the youtube and twitter fixtures use the direct_probe source
    expect(screen.getAllByText('direct probe')).toHaveLength(2);
  });

  it('renders an iframe for youtube', () => {
    const { container } = render(
      <SocialMediaSection business={{ name: 'Maple Street Bakery', socialUrls }} />
    );
    const iframe = container.querySelector('iframe');
    expect(iframe?.getAttribute('src')).toBe(
      'https://www.youtube.com/embed/maplebakery/videos'
    );
  });

  it('renders an instagram placeholder permalink blockquote', () => {
    const { container } = render(
      <SocialMediaSection business={{ name: 'Maple Street Bakery', socialUrls }} />
    );
    const blockquote = container.querySelector('blockquote.instagram-media');
    expect(blockquote?.getAttribute('data-instgrm-permalink')).toBe(
      'https://instagram.com/maple_bakery/'
    );
  });

  it('renders a link card (no embed) for twitter', () => {
    render(<SocialMediaSection business={{ name: 'Maple Street Bakery', socialUrls }} />);
    const link = screen.getByRole('link', { name: /Visit Twitter \/ X Profile/i });
    expect(link).toHaveAttribute('href', 'https://twitter.com/maplebakery');
    expect(screen.getByText(/Follow Maple Street Bakery on Twitter \/ X/)).toBeInTheDocument();
  });

  it('renders nothing when socialUrls is empty', () => {
    const { container } = render(
      <SocialMediaSection business={{ name: 'Maple Street Bakery', socialUrls: {} }} />
    );
    expect(container.querySelector('h2')).toBeNull();
  });

  it('renders nothing when socialUrls is missing', () => {
    const { container } = render(<SocialMediaSection business={{ name: 'Maple Street Bakery' }} />);
    expect(container.querySelector('h2')).toBeNull();
  });

  it('skips platforms whose entry is null', () => {
    const { container } = render(
      <SocialMediaSection
        business={{
          name: 'Maple Street Bakery',
          socialUrls: { instagram: null, youtube: socialUrls.youtube },
        }}
      />
    );
    expect(container.textContent).not.toContain('Instagram');
    expect(container.textContent).toContain('YouTube');
  });
});
