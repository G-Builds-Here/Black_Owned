/**
 * Social profile discovery — TypeScript port of
 * black_wall_street/scripts/social-discovery/social-finder.py.
 *
 * Three phases per business:
 *   1. Extract social links from the business website (confidence 0.8) —
 *      short-circuits the rest when anything is found.
 *   2. SearXNG web search + name-match verification (accept >= 0.7).
 *   3. Direct handle probing (accept >= 0.6).
 *
 * The module is pure: no app imports, injectable fetch (defaults to
 * globalThis.fetch) so it runs under Node (CLI) and jest (mocked fetch).
 */

export type Platform =
  | 'instagram'
  | 'facebook'
  | 'tiktok'
  | 'twitter'
  | 'linkedin'
  | 'youtube';

export const PLATFORMS: Platform[] = [
  'instagram',
  'facebook',
  'tiktok',
  'twitter',
  'linkedin',
  'youtube',
];

export type SocialSource = 'website' | 'google_search' | 'direct_probe';

export interface SocialUrlEntry {
  url: string;
  handle: string;
  confidence: number;
  verified: boolean;
  source: SocialSource;
}

export type SocialUrls = Partial<Record<Platform, SocialUrlEntry | null>>;

export type DiscoveryStatus = 'found' | 'partial' | 'failed';

export interface DiscoveryInput {
  name: string;
  location?: string | null;
  website?: string | null;
}

export interface DiscoveryResult {
  socialUrls: SocialUrls;
  status: DiscoveryStatus;
  searchQueriesUsed: string[];
}

export interface DiscoverOptions {
  searxngUrl?: string;
  fetch?: typeof fetch;
  delayMs?: number;
}

export const DEFAULT_SEARXNG_URL = 'http://192.168.68.50:8888/search';

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36';

const HANDLE_PATTERNS: Record<Platform, RegExp> = {
  instagram: /instagram\.com\/([a-zA-Z0-9_.]+)/,
  facebook: /facebook\.com\/([a-zA-Z0-9_.]+)/,
  tiktok: /tiktok\.com\/@([a-zA-Z0-9_.]+)/,
  twitter: /twitter\.com\/([a-zA-Z0-9_.]+)/,
  linkedin: /linkedin\.com\/(company|in)\/([a-zA-Z0-9-]+)/,
  youtube: /youtube\.com\/(@|channel\/)([a-zA-Z0-9_-]+)/,
};

const PROBE_BASE_URLS: Record<Platform, string> = {
  instagram: 'https://www.instagram.com/',
  facebook: 'https://www.facebook.com/',
  tiktok: 'https://www.tiktok.com/@',
  twitter: 'https://www.twitter.com/',
  linkedin: 'https://www.linkedin.com/company/',
  youtube: 'https://www.youtube.com/',
};

const PROFILE_URLS: Record<Platform, (handle: string) => string> = {
  instagram: (h) => `https://instagram.com/${h}`,
  facebook: (h) => `https://facebook.com/${h}`,
  tiktok: (h) => `https://tiktok.com/@${h}`,
  twitter: (h) => `https://twitter.com/${h}`,
  linkedin: (h) => `https://linkedin.com/company/${h}`,
  youtube: (h) => `https://youtube.com/${h}`,
};

const NAME_SUFFIXES = [
  ' llc',
  ' l.l.c.',
  ' inc',
  ' corporation',
  ' corp.',
  ' ltd',
  ' limited',
  ' company',
  ' & co',
  ' partners',
];

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function defaultFetch(): typeof fetch {
  return globalThis.fetch.bind(globalThis);
}

/** Strip common legal suffixes so searches match how people name the business. */
export function cleanName(name: string): string {
  let cleaned = name.toLowerCase().trim();
  for (const suffix of NAME_SUFFIXES) {
    if (cleaned.endsWith(suffix)) {
      cleaned = cleaned.slice(0, -suffix.length);
      break;
    }
  }
  return cleaned.trim();
}

/** `"{clean}" {platform} {location}"`, falling back to an "official" query. */
export function buildSearchQuery(name: string, platform: Platform, location = ''): string {
  const clean = cleanName(name);
  const loc = location.trim();
  if (loc) {
    return `"${clean}" ${platform} ${loc}`;
  }
  return `"${clean}" ${platform} official`;
}

/** Extract the handle from a platform URL. LinkedIn/YouTube keep the handle in group 2. */
export function extractHandle(url: string, platform: Platform): string | null {
  const match = HANDLE_PATTERNS[platform].exec(url);
  if (!match) return null;
  if (platform === 'linkedin' || platform === 'youtube') {
    return match[2] || match[1];
  }
  return match[1];
}

export interface ProfileMatch {
  isMatch: boolean;
  confidence: number;
}

/**
 * Name-match scoring: name in title AND url = 0.95, either = 0.75,
 * city in title adds +0.1 (capped at 1.0), negative markers zero it out.
 * Accept threshold: >= 0.7.
 */
export function verifyProfileMatch(
  businessName: string,
  profileTitle: string,
  profileUrl: string,
  city = ''
): ProfileMatch {
  const clean = cleanName(businessName);
  const titleLower = profileTitle.toLowerCase();
  const urlLower = profileUrl.toLowerCase();

  const nameInTitle = clean ? titleLower.includes(clean) : false;
  const nameInUrl = clean ? urlLower.includes(clean) : false;

  let confidence = 0.0;
  if (nameInTitle && nameInUrl) {
    confidence = 0.95;
  } else if (nameInTitle || nameInUrl) {
    confidence = 0.75;
  }

  if (city && titleLower.includes(city.toLowerCase())) {
    confidence = Math.min(1.0, confidence + 0.1);
  }

  if (titleLower.includes('different') || titleLower.includes('not found')) {
    confidence = 0.0;
  }

  return { isMatch: confidence >= 0.7, confidence };
}

export function makeHandle(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9_-]/g, '');
}

/** Candidate handles for direct probing, capped at 30 chars, deduped in order. */
export function generateHandleVariations(clean: string): string[] {
  const base = makeHandle(clean);
  if (!base) return [];
  const variations = [
    base,
    makeHandle(clean.replace(/ /g, '')),
    makeHandle(clean.replace(/ /g, '_')),
    makeHandle(clean.replace(/ /g, '-')),
    `official${base}`,
    `${base}official`,
    `${base}_`,
    `_${base}`,
  ];
  return [...new Set(variations.filter((h) => h.length > 0).map((h) => h.slice(0, 30)))];
}

/** Phase 1 — pull social links out of the business's own website. */
export async function extractFromWebsite(website: string, fetchFn: typeof fetch): Promise<SocialUrls> {
  const social: SocialUrls = {};
  if (!website) return social;
  try {
    const url = website.startsWith('http') ? website : `https://${website}`;
    const resp = await fetchFn(url, { headers: { 'User-Agent': USER_AGENT } });
    if (!resp.ok) return social;
    const content = await resp.text();
    for (const platform of PLATFORMS) {
      const handle = extractHandle(content, platform);
      if (handle) {
        social[platform] = {
          url: PROFILE_URLS[platform](handle),
          handle,
          confidence: 0.8,
          verified: false,
          source: 'website',
        };
      }
    }
  } catch {
    // website unreachable — nothing to extract
  }
  return social;
}

export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}

/** Phase 2 transport — one SearXNG JSON search. Blocked/malformed responses yield []. */
export async function searchSearxng(
  query: string,
  searxngUrl: string,
  fetchFn: typeof fetch
): Promise<SearchResult[]> {
  const url = `${searxngUrl.replace(/\/$/, '')}?q=${encodeURIComponent(query)}&format=json`;
  try {
    const resp = await fetchFn(url, {
      headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
    });
    if (!resp.ok) return [];
    const data = (await resp.json()) as {
      results?: Array<{ title?: string; url?: string; content?: string }>;
    };
    if (!Array.isArray(data.results)) return [];
    return data.results
      .slice(0, 10)
      .map((r) => ({ title: r.title ?? '', url: r.url ?? '', snippet: r.content ?? '' }))
      .filter((r) => r.url.length > 0);
  } catch {
    return [];
  }
}

export interface ProbedProfile {
  url: string;
  handle: string;
  confidence: number;
}

/** Phase 3 — probe candidate handles directly on each platform. */
export async function probeDirectHandles(
  name: string,
  platform: Platform,
  fetchFn: typeof fetch,
  delayMs: number
): Promise<ProbedProfile[]> {
  const clean = cleanName(name);
  const base = PROBE_BASE_URLS[platform];
  const found: ProbedProfile[] = [];

  for (const handle of generateHandleVariations(clean)) {
    if (!handle || handle.startsWith('_') || handle.startsWith('-')) continue;
    const url = base + handle;
    try {
      const resp = await fetchFn(url, { headers: { 'User-Agent': USER_AGENT } });
      if (resp.status === 200) {
        const content = (await resp.text()).toLowerCase();
        if (content.includes("page isn't available")) continue;
        if (content.includes('no results')) continue;
        if (content.includes('page not found')) continue;

        let confidence = 0.5;
        if (content.replace(/ /g, '').includes(clean.replace(/ /g, ''))) {
          confidence = 0.85;
        } else if (clean.split(' ')[0] && content.includes(clean.split(' ')[0])) {
          confidence = 0.6;
        }
        found.push({ url, handle, confidence });
      }
    } catch {
      // unreachable — skip this handle
    }
    await sleep(delayMs * 0.5);
  }
  return found;
}

/**
 * Run all three discovery phases for one business.
 * Website hits short-circuit (status "found"); otherwise search, then probe,
 * per platform. Status: found >= 2 platforms, partial = 1, failed = 0.
 */
export async function discoverSocialProfiles(
  business: DiscoveryInput,
  options: DiscoverOptions = {}
): Promise<DiscoveryResult> {
  const name = business.name ?? '';
  const location = business.location ?? '';
  const website = business.website ?? '';
  const fetchFn = options.fetch ?? defaultFetch();
  const searxngUrl = options.searxngUrl ?? DEFAULT_SEARXNG_URL;
  const delayMs = options.delayMs ?? 1000;

  const searchQueriesUsed: string[] = [];
  const socialUrls: SocialUrls = {};

  if (!name.trim()) {
    return { socialUrls, status: 'failed', searchQueriesUsed };
  }

  if (website) {
    const fromWebsite = await extractFromWebsite(website, fetchFn);
    if (Object.keys(fromWebsite).length > 0) {
      return { socialUrls: fromWebsite, status: 'found', searchQueriesUsed };
    }
  }

  // Free-text location: the last comma-segment is the best "city" signal
  const city = location.trim().split(',').pop()?.trim() ?? '';

  let foundAny = false;
  for (const platform of PLATFORMS) {
    const query = buildSearchQuery(name, platform, location);
    searchQueriesUsed.push(`${platform}: ${query}`);

    const results = await searchSearxng(query, searxngUrl, fetchFn);
    await sleep(delayMs);
    for (const { title, url } of results) {
      if (!url.toLowerCase().includes(platform)) continue;
      const { isMatch, confidence } = verifyProfileMatch(name, title, url, city);
      if (isMatch) {
        const handle = extractHandle(url, platform);
        if (handle) {
          socialUrls[platform] = {
            url,
            handle,
            confidence,
            verified: true,
            source: 'google_search',
          };
          foundAny = true;
          break;
        }
      }
    }

    if (!socialUrls[platform]) {
      const probed = await probeDirectHandles(name, platform, fetchFn, delayMs);
      for (const { url, handle, confidence } of probed) {
        if (confidence >= 0.6) {
          socialUrls[platform] = {
            url,
            handle,
            confidence,
            verified: false,
            source: 'direct_probe',
          };
          foundAny = true;
          break;
        }
      }
    }
  }

  const status: DiscoveryStatus = foundAny
    ? Object.keys(socialUrls).length >= 2
      ? 'found'
      : 'partial'
    : 'failed';

  return { socialUrls, status, searchQueriesUsed };
}
