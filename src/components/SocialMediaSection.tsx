'use client';

import { Platform, SocialUrls } from '@/services/social-discovery';

interface SocialMediaSectionProps {
  business: {
    name: string;
    socialUrls?: SocialUrls | null;
  };
}

const PLATFORM_CONFIG: Record<
  Platform,
  { icon: string; color: string; label: string }
> = {
  instagram: { icon: '📷', color: '#E4405F', label: 'Instagram' },
  facebook: { icon: '📘', color: '#1877F2', label: 'Facebook' },
  tiktok: { icon: '🎵', color: '#000000', label: 'TikTok' },
  twitter: { icon: '🐦', color: '#1DA1F2', label: 'Twitter / X' },
  linkedin: { icon: '💼', color: '#0A66C2', label: 'LinkedIn' },
  youtube: { icon: '▶️', color: '#FF0000', label: 'YouTube' },
};

/**
 * SocialMediaSection - compact row of platform profile links.
 *
 * Each platform renders as a small avatar chip (icon on the platform brand
 * color, profile-picture style) plus label and handle. Discovery confidence
 * and source are exposed via the tooltip.
 */
export function SocialMediaSection({ business }: SocialMediaSectionProps) {
  const socialUrls = business.socialUrls ?? {};
  const platforms = (Object.keys(PLATFORM_CONFIG) as Platform[]).filter((p) => {
    const url = socialUrls[p]?.url;
    return typeof url === 'string' && /^https?:\/\//i.test(url);
  });

  if (platforms.length === 0) return null;

  return (
    <section className="mt-8">
      <h2 className="mb-3 text-lg font-semibold text-neutral-900">Follow {business.name}</h2>
      <div className="flex flex-wrap gap-2">
        {platforms.map((platform) => {
          const entry = socialUrls[platform];
          if (!entry) return null;
          const config = PLATFORM_CONFIG[platform];
          return (
            <a
              key={platform}
              href={entry.url}
              target="_blank"
              rel="noopener noreferrer"
              title={`${Math.round(entry.confidence * 100)}% confidence · ${entry.source.replace(/_/g, ' ')}`}
              className="flex items-center gap-2 rounded-full border border-neutral-200 bg-white py-1 pl-1 pr-3 transition-colors hover:bg-neutral-100"
              style={{ textDecoration: 'none' }}
            >
              <span
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-base leading-none"
                style={{ backgroundColor: config.color }}
                aria-hidden="true"
              >
                {config.icon}
              </span>
              <span className="text-sm font-medium text-neutral-800">{config.label}</span>
              <span className="max-w-[180px] truncate text-xs text-neutral-500">{entry.handle}</span>
            </a>
          );
        })}
      </div>
    </section>
  );
}

export default SocialMediaSection;
