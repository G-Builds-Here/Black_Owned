import {
  PLATFORMS,
  cleanName,
  buildSearchQuery,
  extractHandle,
  verifyProfileMatch,
  makeHandle,
  generateHandleVariations,
  extractFromWebsite,
  searchSearxng,
  probeDirectHandles,
  discoverSocialProfiles,
} from './social-discovery';

function fakeResponse(body: { json?: unknown; text?: string }, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body.json,
    text: async () => (typeof body.text === 'string' ? body.text : JSON.stringify(body.json ?? '')),
  } as unknown as Response;
}

function makeFetch(handler: (url: string) => Response): jest.Mock {
  return jest.fn(async (input: RequestInfo | URL) => handler(String(input)));
}

function asFetch(mock: jest.Mock): typeof fetch {
  return mock as unknown as typeof fetch;
}

describe('cleanName', () => {
  it('strips legal suffixes and lowercases', () => {
    expect(cleanName('Maple Street Bakery LLC')).toBe('maple street bakery');
    expect(cleanName('X L.L.C.')).toBe('x');
    expect(cleanName('Acme Corp.')).toBe('acme');
    expect(cleanName('Doe & Co')).toBe('doe');
  });

  it('leaves plain names alone (lowercased)', () => {
    expect(cleanName('Plain Name')).toBe('plain name');
  });
});

describe('buildSearchQuery', () => {
  it('uses the location when present', () => {
    expect(buildSearchQuery('Maple Street Bakery LLC', 'instagram', '123 Main St, Springfield')).toBe(
      '"maple street bakery" instagram 123 Main St, Springfield'
    );
  });

  it('falls back to an official query without a location', () => {
    expect(buildSearchQuery('Maple Street Bakery', 'facebook')).toBe('"maple street bakery" facebook official');
  });
});

describe('extractHandle', () => {
  it.each([
    ['instagram', 'https://www.instagram.com/maple_bakery/', 'maple_bakery'],
    ['facebook', 'https://www.facebook.com/MapleStreetBakery', 'MapleStreetBakery'],
    ['tiktok', 'https://www.tiktok.com/@maple.bakery', 'maple.bakery'],
    ['twitter', 'https://twitter.com/maplebakery', 'maplebakery'],
    ['linkedin', 'https://www.linkedin.com/company/maple-street-bakery/about', 'maple-street-bakery'],
    ['linkedin', 'https://www.linkedin.com/in/jane-doe', 'jane-doe'],
    ['youtube', 'https://www.youtube.com/@MapleBakery', 'MapleBakery'],
    ['youtube', 'https://www.youtube.com/channel/UCabc123/videos', 'UCabc123'],
  ] as const)('extracts %s handles', (platform, url, expected) => {
    expect(extractHandle(url, platform)).toBe(expected);
  });

  it('returns null when the url is not on that platform', () => {
    expect(extractHandle('https://example.com/instagram', 'instagram')).toBeNull();
    expect(extractHandle('https://www.linkedin.com', 'linkedin')).toBeNull();
  });
});

describe('verifyProfileMatch', () => {
  it('scores 0.95 when the name is in both title and url', () => {
    // the check is a literal substring test on the raw url (same as the source),
    // so use a url that literally contains the spaced name
    const m = verifyProfileMatch(
      'Maple Street Bakery',
      'Maple Street Bakery | Instagram',
      'https://instagram.com/maple street bakery'
    );
    expect(m).toEqual({ isMatch: true, confidence: 0.95 });
  });

  it('scores 0.75 when the name is in only one place', () => {
    expect(
      verifyProfileMatch('Maple Street Bakery', 'Maple Street Bakery | News', 'https://news.site/article')
    ).toEqual({ isMatch: true, confidence: 0.75 });
    expect(
      verifyProfileMatch('Maple Street Bakery', 'Local bakery review', 'https://instagram.com/maple street bakery')
    ).toEqual({ isMatch: true, confidence: 0.75 });
  });

  it('boosts +0.1 (capped at 1.0) when the city is in the title', () => {
    expect(
      verifyProfileMatch('Maple Street Bakery', 'Maple Street Bakery in Springfield', 'https://x.site', 'Springfield')
    ).toEqual({ isMatch: true, confidence: 0.85 });
  });

  it('zeros out on negative markers', () => {
    const m = verifyProfileMatch(
      'Maple Street Bakery',
      'Maple Street Bakery - not found different location',
      'https://instagram.com/maplestreetbakery'
    );
    expect(m).toEqual({ isMatch: false, confidence: 0 });
  });

  it('rejects when the name is absent', () => {
    expect(verifyProfileMatch('Maple Street Bakery', 'Totally Unrelated', 'https://x.site')).toEqual({
      isMatch: false,
      confidence: 0,
    });
  });
});

describe('makeHandle / generateHandleVariations', () => {
  it('keeps only [a-z0-9_-]', () => {
    expect(makeHandle('Maple & Bakery #1')).toBe('maplebakery1');
  });

  it('generates the documented variations, deduped in order', () => {
    expect(generateHandleVariations('maple street bakery')).toEqual([
      'maplestreetbakery',
      'maple_street_bakery',
      'maple-street-bakery',
      'officialmaplestreetbakery',
      'maplestreetbakeryofficial',
      'maplestreetbakery_',
      '_maplestreetbakery',
    ]);
  });

  it('caps every variation at 30 characters', () => {
    const long = 'this is a very very long business name that will exceed the cap';
    for (const v of generateHandleVariations(long)) {
      expect(v.length).toBeLessThanOrEqual(30);
    }
  });

  it('returns [] for an empty name', () => {
    expect(generateHandleVariations('')).toEqual([]);
  });
});

describe('extractFromWebsite', () => {
  const html =
    '<html><body><a href="https://www.instagram.com/maple_bakery">IG</a>' +
    '<p>Find us on tiktok.com/@maple.bakery</p></body></html>';

  it('extracts platform links with confidence 0.8', async () => {
    const fetchMock = makeFetch(() => fakeResponse({ text: html }));
    const social = await extractFromWebsite('https://maplebakery.example', asFetch(fetchMock));
    expect(social.instagram).toEqual({
      url: 'https://instagram.com/maple_bakery',
      handle: 'maple_bakery',
      confidence: 0.8,
      verified: false,
      source: 'website',
    });
    expect(social.tiktok?.url).toBe('https://tiktok.com/@maple.bakery');
    expect(Object.keys(social).sort()).toEqual(['instagram', 'tiktok']);
  });

  it('prepends https:// when the website has no scheme', async () => {
    const fetchMock = makeFetch(() => fakeResponse({ text: '<html></html>' }));
    await extractFromWebsite('example.com', asFetch(fetchMock));
    expect(String(fetchMock.mock.calls[0][0])).toBe('https://example.com');
  });

  it('returns {} for an empty website without calling fetch', async () => {
    const fetchMock = makeFetch(() => fakeResponse({ text: html }));
    await expect(extractFromWebsite('', asFetch(fetchMock))).resolves.toEqual({});
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns {} on non-200 responses', async () => {
    const fetchMock = makeFetch(() => fakeResponse({ text: 'nope' }, 500));
    await expect(extractFromWebsite('https://x.example', asFetch(fetchMock))).resolves.toEqual({});
  });

  it('returns {} when fetch rejects', async () => {
    const fetchMock = jest.fn(async () => {
      throw new Error('network down');
    });
    await expect(extractFromWebsite('https://x.example', asFetch(fetchMock))).resolves.toEqual({});
  });
});

describe('searchSearxng', () => {
  const searxng = 'http://192.168.68.50:8888/search';

  it('maps SearXNG results to {title, url, snippet}', async () => {
    const fetchMock = makeFetch((url) => {
      expect(url).toContain('format=json');
      expect(url).toContain(encodeURIComponent('"maple" instagram'));
      return fakeResponse({
        json: {
          results: [
            { title: 'T1', url: 'https://instagram.com/a', content: 'c1' },
            { title: 'T2', url: 'https://facebook.com/b', content: 'c2' },
          ],
        },
      });
    });
    const results = await searchSearxng('"maple" instagram', searxng, asFetch(fetchMock));
    expect(results).toEqual([
      { title: 'T1', url: 'https://instagram.com/a', snippet: 'c1' },
      { title: 'T2', url: 'https://facebook.com/b', snippet: 'c2' },
    ]);
  });

  it('caps results at 10', async () => {
    const results = Array.from({ length: 12 }, (_, i) => ({
      title: `t${i}`,
      url: `https://instagram.com/h${i}`,
      content: 'c',
    }));
    const fetchMock = makeFetch(() => fakeResponse({ json: { results } }));
    expect(await searchSearxng('q', searxng, asFetch(fetchMock))).toHaveLength(10);
  });

  it('returns [] on rate-limited responses', async () => {
    const fetchMock = makeFetch(() => fakeResponse({ json: {} }, 429));
    await expect(searchSearxng('q', searxng, asFetch(fetchMock))).resolves.toEqual([]);
  });

  it('returns [] when the response body is not parseable JSON', async () => {
    const resp = {
      ok: true,
      status: 200,
      json: async () => {
        throw new Error('bad json');
      },
      text: async () => 'oops',
    } as unknown as Response;
    const failingFetch = jest.fn(async () => resp) as unknown as typeof fetch;
    await expect(searchSearxng('q', searxng, failingFetch)).resolves.toEqual([]);
  });

  it('returns [] when results is not an array', async () => {
    const fetchMock = makeFetch(() => fakeResponse({ json: { results: 'nope' } }));
    await expect(searchSearxng('q', searxng, asFetch(fetchMock))).resolves.toEqual([]);
  });

  it('drops entries without a url', async () => {
    const fetchMock = makeFetch(() =>
      fakeResponse({ json: { results: [{ title: 'x' }, { title: 'y', url: 'https://instagram.com/y' }] } })
    );
    const results = await searchSearxng('q', searxng, asFetch(fetchMock));
    expect(results).toHaveLength(1);
    expect(results[0].url).toBe('https://instagram.com/y');
  });
});

describe('probeDirectHandles', () => {
  it('finds the underscored handle and scores it 0.85 on a full-name body', async () => {
    const fetchMock = makeFetch((url) => {
      if (url === 'https://www.instagram.com/maple_bakery') {
        return fakeResponse({ text: 'Maple Bakery - best cookies in town' });
      }
      return fakeResponse({ text: 'not found' }, 404);
    });
    const found = await probeDirectHandles('Maple Bakery', 'instagram', asFetch(fetchMock), 0);
    expect(found).toEqual([
      { url: 'https://www.instagram.com/maple_bakery', handle: 'maple_bakery', confidence: 0.85 },
    ]);
    // handles that start with "_" are never probed
    expect(fetchMock.mock.calls.some(([u]) => String(u).includes('/_maplebakery'))).toBe(false);
  });

  it('scores 0.6 when only the first word matches', async () => {
    const fetchMock = makeFetch((url) => {
      if (url === 'https://www.instagram.com/maplebakery') {
        return fakeResponse({ text: 'maple coffee reviews' });
      }
      return fakeResponse({ text: 'not found' }, 404);
    });
    const found = await probeDirectHandles('Maple Bakery', 'instagram', asFetch(fetchMock), 0);
    expect(found).toEqual([
      { url: 'https://www.instagram.com/maplebakery', handle: 'maplebakery', confidence: 0.6 },
    ]);
  });

  it('skips pages advertising that they do not exist', async () => {
    const fetchMock = makeFetch((url) => {
      if (url === 'https://www.instagram.com/maplebakery') {
        return fakeResponse({ text: "Sorry, this page isn't available" });
      }
      return fakeResponse({ text: 'not found' }, 404);
    });
    await expect(probeDirectHandles('Maple Bakery', 'instagram', asFetch(fetchMock), 0)).resolves.toEqual([]);
  });

  it('uses platform-specific base urls', async () => {
    const fetchMock = makeFetch((url) => {
      if (url === 'https://www.linkedin.com/company/maplebakery') {
        return fakeResponse({ text: 'maple bakery company page' });
      }
      return fakeResponse({ text: 'not found' }, 404);
    });
    const found = await probeDirectHandles('Maple Bakery', 'linkedin', asFetch(fetchMock), 0);
    expect(found[0].url).toBe('https://www.linkedin.com/company/maplebakery');
  });
});

describe('discoverSocialProfiles', () => {
  const searxng = 'http://192.168.68.50:8888/search';

  function searxngResultsFetch(resultsFor: (query: string) => unknown[] = () => []) {
    return makeFetch((url) => {
      if (url.includes('192.168.68.50')) {
        const m = /q=([^&]+)/.exec(url);
        const query = m ? decodeURIComponent(m[1]) : '';
        return fakeResponse({ json: { results: resultsFor(query) } });
      }
      return fakeResponse({ text: 'not found' }, 404);
    });
  }

  it('fails fast on an empty name', async () => {
    const fetchMock = searxngResultsFetch();
    const result = await discoverSocialProfiles({ name: '' }, { fetch: asFetch(fetchMock), delayMs: 0 });
    expect(result.status).toBe('failed');
    expect(result.socialUrls).toEqual({});
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('short-circuits when the website yields links', async () => {
    const fetchMock = makeFetch((url) => {
      if (url === 'https://maplebakery.example') {
        return fakeResponse({ text: '<a href="https://www.instagram.com/maple_bakery">IG</a>' });
      }
      return fakeResponse({ text: 'not found' }, 404);
    });
    const result = await discoverSocialProfiles(
      { name: 'Maple Bakery', website: 'https://maplebakery.example' },
      { fetch: asFetch(fetchMock), delayMs: 0, searxngUrl: searxng }
    );
    expect(result.status).toBe('found');
    expect(result.socialUrls.instagram?.source).toBe('website');
    expect(result.searchQueriesUsed).toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('finds all platforms via search when names verify', async () => {
    const fetchMock = searxngResultsFetch((query) => {
      const platform = PLATFORMS.find((p) => query.includes(` ${p} `));
      if (!platform) return [];
      const profileUrls: Record<string, string> = {
        instagram: 'https://instagram.com/maplestreetbakery',
        facebook: 'https://facebook.com/maplestreetbakery',
        tiktok: 'https://tiktok.com/@maplestreetbakery',
        twitter: 'https://twitter.com/maplestreetbakery',
        linkedin: 'https://www.linkedin.com/company/maplestreetbakery',
        youtube: 'https://www.youtube.com/@maplestreetbakery',
      };
      return [
        {
          title: `Maple Street Bakery official ${platform} page`,
          url: profileUrls[platform],
          content: 'snip',
        },
        { title: 'Unrelated', url: 'https://example.com', content: 'x' },
      ];
    });
    const result = await discoverSocialProfiles(
      { name: 'Maple Street Bakery' },
      { fetch: asFetch(fetchMock), delayMs: 0, searxngUrl: searxng }
    );
    expect(result.status).toBe('found');
    for (const platform of PLATFORMS) {
      const entry = result.socialUrls[platform];
      expect(entry?.verified).toBe(true);
      expect(entry?.source).toBe('google_search');
      expect(entry?.confidence).toBe(0.75);
    }
    // search only — no probe requests ever made
    expect(fetchMock).toHaveBeenCalledTimes(6);
  });

  it('falls back to direct probing and reports partial for one platform', async () => {
    const fetchMock = makeFetch((url) => {
      if (url.includes('192.168.68.50')) return fakeResponse({ json: { results: [] } });
      if (url === 'https://www.instagram.com/maplebakery') {
        return fakeResponse({ text: 'maple coffee reviews' });
      }
      return fakeResponse({ text: 'not found' }, 404);
    });
    const result = await discoverSocialProfiles(
      { name: 'Maple Bakery' },
      { fetch: asFetch(fetchMock), delayMs: 0, searxngUrl: searxng }
    );
    expect(result.status).toBe('partial');
    expect(result.socialUrls.instagram).toEqual({
      url: 'https://www.instagram.com/maplebakery',
      handle: 'maplebakery',
      confidence: 0.6,
      verified: false,
      source: 'direct_probe',
    });
    expect(result.socialUrls.facebook).toBeUndefined();
  });

  it('boosts the search score with the city from a free-text location', async () => {
    const fetchMock = searxngResultsFetch((query) => {
      if (!query.includes(' instagram ')) return [];
      return [
        {
          title: 'Maple Street Bakery in Springfield',
          url: 'https://instagram.com/maplestreetbakery',
          content: 'snip',
        },
      ];
    });
    const result = await discoverSocialProfiles(
      { name: 'Maple Street Bakery', location: '123 Main St, Springfield' },
      { fetch: asFetch(fetchMock), delayMs: 0, searxngUrl: searxng }
    );
    expect(result.socialUrls.instagram?.confidence).toBe(0.85);
    expect(result.searchQueriesUsed[0]).toBe(
      'instagram: "maple street bakery" instagram 123 Main St, Springfield'
    );
  });

  it('fails when nothing is found anywhere', async () => {
    const fetchMock = searxngResultsFetch();
    const result = await discoverSocialProfiles(
      { name: 'Nobody Inc' },
      { fetch: asFetch(fetchMock), delayMs: 0, searxngUrl: searxng }
    );
    expect(result.status).toBe('failed');
    expect(result.socialUrls).toEqual({});
    expect(result.searchQueriesUsed).toHaveLength(PLATFORMS.length);
  });
});
