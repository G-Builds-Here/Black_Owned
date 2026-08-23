'use client';

import { useEffect } from 'react';
import { Platform, SocialUrls } from '@/services/social-discovery';

declare global {
  interface Window {
    instgrm?: { EmbedsHelper?: { load: () => void } };
  }
}

interface SocialMediaSectionProps {
  business: {
    name: string;
    socialUrls?: SocialUrls | null;
  };
}

const PLATFORM_CONFIG: Record<
  Platform,
  { icon: string; color: string; label: string; canEmbed: boolean }
> = {
  instagram: { icon: '📷', color: '#E4405F', label: 'Instagram', canEmbed: true },
  facebook: { icon: '📘', color: '#1877F2', label: 'Facebook', canEmbed: false },
  tiktok: { icon: '🎵', color: '#000000', label: 'TikTok', canEmbed: true },
  twitter: { icon: '🐦', color: '#1DA1F2', label: 'Twitter / X', canEmbed: false },
  linkedin: { icon: '💼', color: '#0A66C2', label: 'LinkedIn', canEmbed: true },
  youtube: { icon: '▶️', color: '#FF0000', label: 'YouTube', canEmbed: true },
};

function linkCardBody(platform: Platform, url: string, businessName: string) {
  const config = PLATFORM_CONFIG[platform];
  return (
    <div className="flex flex-col items-center gap-3 py-2 text-center">
      <span className="text-4xl leading-none" aria-hidden="true">
        {config.icon}
      </span>
      <p className="text-sm text-neutral-600">
        Follow {businessName} on {config.label}
      </p>
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-block rounded-lg px-4 py-2 text-sm font-medium text-white no-underline transition-opacity hover:opacity-90"
        style={{ backgroundColor: config.color }}
      >
        Visit {config.label} Profile
      </a>
    </div>
  );
}

function embedBody(platform: Platform, url: string, businessName: string) {
  switch (platform) {
    case 'youtube':
      const channelSlug = (url.split('/').pop() ?? '').replace(/^@/, '');
      return (
        <iframe
          src={`https://www.youtube.com/embed/${channelSlug}/videos`}
          title={`YouTube ${businessName}`}
          allowFullScreen
          className="h-[450px] w-full border-0"
        />
      );
    case 'linkedin':
      return (
        <iframe
          src={`https://www.linkedin.com/embed/feed/update?uri=${encodeURIComponent(url)}`}
          title={`LinkedIn ${businessName}`}
          allowFullScreen
          className="h-[450px] w-full overflow-hidden border-0"
        />
      );
    case 'tiktok':
      return (
        <blockquote
          className="tiktok-embed"
          cite={url}
          data-unique-id={url.split('@')[1]?.split('/')[0] || ''}
          data-embed-from="embed_page"
          data-embed-type="creator"
          style={{ maxWidth: '780px', minWidth: '288px', width: '100%' }}
        >
          <a target="_blank" rel="noopener noreferrer" href={url}>
            @{businessName} on TikTok
          </a>
        </blockquote>
      );
    case 'instagram':
      return (
        <div className="flex w-full max-w-[350px] justify-center">
          <blockquote
            className="instagram-media"
            data-instgrm-permalink={url.endsWith('/') ? url : `${url}/`}
            data-instgrm-version="14"
            style={{
              background: '#FFF',
              border: 0,
              borderRadius: 3,
              boxShadow: 'none',
              margin: 0,
              padding: 0,
              width: '100%',
            }}
          >
            <div className="flex flex-col items-center justify-center gap-3 p-8">
              <span className="text-3xl leading-none" aria-hidden="true">
                📷
              </span>
              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm font-medium text-[#3897f0] no-underline"
              >
                View this profile on Instagram
              </a>
            </div>
          </blockquote>
        </div>
      );
    case 'facebook':
      return (
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="relative block aspect-video w-full overflow-hidden rounded-lg shadow-sm no-underline"
        >
          <img
            src={`https://graph.facebook.com/v18.0/${
              url.split('facebook.com/')[1]?.split('/')[0] || 'page'
            }/picture?type=large`}
            alt={`Facebook profile for ${businessName}`}
            className="absolute inset-0 h-full w-full object-cover"
            onError={(e) => {
              e.currentTarget.style.display = 'none';
            }}
          />
          <div className="absolute inset-0 flex items-end bg-gradient-to-t from-black/50 to-transparent p-4">
            <span className="text-sm font-semibold text-white">Visit Facebook Page →</span>
          </div>
        </a>
      );
    default:
      return linkCardBody(platform, url, businessName);
  }
}

export function SocialMediaSection({ business }: SocialMediaSectionProps) {
  const socialUrls = business.socialUrls ?? {};
  const platforms = (Object.keys(PLATFORM_CONFIG) as Platform[]).filter((p) => socialUrls[p]);

  useEffect(() => {
    const instagramScriptId = 'instagram-embed-script';
    if (document.getElementById(instagramScriptId)) {
      setTimeout(() => {
        window.instgrm?.EmbedsHelper?.load();
      }, 100);
    } else {
      const script = document.createElement('script');
      script.id = instagramScriptId;
      script.src = '//www.instagram.com/embed.js';
      script.async = true;
      script.onload = () => {
        window.instgrm?.EmbedsHelper?.load();
      };
      document.body.appendChild(script);
    }

    if (!document.getElementById('tiktok-embed-script')) {
      const script = document.createElement('script');
      script.id = 'tiktok-embed-script';
      script.src = 'https://www.tiktok.com/embed.js';
      script.async = true;
      document.body.appendChild(script);
    }
  }, []);

  if (platforms.length === 0) return null;

  return (
    <div className="mt-8">
      <h2 className="mb-4 text-lg font-semibold text-neutral-800">Follow Us</h2>
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        {platforms.map((platform) => {
          const entry = socialUrls[platform];
          if (!entry) return null;
          const config = PLATFORM_CONFIG[platform];
          const { url, handle, confidence, source } = entry;
          return (
            <div
              key={platform}
              className="overflow-hidden rounded-lg border border-neutral-200 bg-white"
            >
              <div
                className="flex items-center gap-2.5 px-4 py-2.5 text-white"
                style={{ backgroundColor: config.color }}
              >
                <span
                  aria-hidden="true"
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/90 text-xl leading-none"
                >
                  {config.icon}
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-semibold leading-tight">{config.label}</p>
                  <p className="truncate text-xs text-white/80">@{handle}</p>
                </div>
                <span className="ml-auto shrink-0 rounded-full bg-white/20 px-2 py-0.5 text-xs font-medium">
                  {Math.round(confidence * 100)}%
                </span>
                <span className="shrink-0 text-[10px] uppercase tracking-wide text-white/60">
                  {source.replace(/_/g, ' ')}
                </span>
              </div>
              <div className="flex min-h-[120px] items-center justify-center p-4">
                {config.canEmbed
                  ? embedBody(platform, url, business.name)
                  : linkCardBody(platform, url, business.name)}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
