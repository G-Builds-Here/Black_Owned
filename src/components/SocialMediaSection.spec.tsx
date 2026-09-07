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
  it('renders a compact chip per platform', () => {
    render(<SocialMediaSection business={{ name: 'Maple Street Bakery', socialUrls }} />);
    expect(screen.getByRole('heading', { name: 'Follow Maple Street Bakery' })).toBeInTheDocument();
    expect(screen.getByText('Instagram')).toBeInTheDocument();
    expect(screen.getByText('YouTube')).toBeInTheDocument();
    expect(screen.getByText('Twitter / X')).toBeInTheDocument();
    expect(screen.getByText('maple_bakery')).toBeInTheDocument();
  });

  it('links each chip to the platform URL in a new tab', () => {
    render(<SocialMediaSection business={{ name: 'Maple Street Bakery', socialUrls }} />);
    const ig = screen.getByRole('link', { name: /instagram/i });
    expect(ig).toHaveAttribute('href', 'https://instagram.com/maple_bakery');
    expect(ig).toHaveAttribute('target', '_blank');
    expect(ig).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('exposes confidence and source in the tooltip', () => {
    render(<SocialMediaSection business={{ name: 'Maple Street Bakery', socialUrls }} />);
    const ig = screen.getByRole('link', { name: /instagram/i });
    expect(ig).toHaveAttribute('title', expect.stringContaining('95%'));
    expect(ig).toHaveAttribute('title', expect.stringContaining('google search'));
  });

  it('renders no embeds or iframes', () => {
    const { container } = render(
      <SocialMediaSection business={{ name: 'Maple Street Bakery', socialUrls }} />
    );
    expect(container.querySelector('iframe')).toBeNull();
    expect(container.querySelector('blockquote')).toBeNull();
    expect(container.querySelector('script')).toBeNull();
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
