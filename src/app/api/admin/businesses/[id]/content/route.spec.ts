/**
 * Admin Business Content Route Tests — LOC-0080 AC1
 *
 * Covers GET /api/admin/businesses/[id]/content (form pre-fill) and
 * PATCH /api/admin/businesses/[id]/content (save + partial save)
 * against a mocked getPool.
 */

import { NextRequest, NextResponse } from 'next/server';
import { GET, PATCH } from './route';
import { getPool } from '@/lib/db/user-repository';
import {
  createAuthMiddleware,
  createAuthErrorResponse,
} from '@/lib/auth/jwt-middleware';

jest.mock('@/lib/db/user-repository', () => ({
  getPool: jest.fn(),
}));

jest.mock('@/lib/auth/jwt-middleware', () => ({
  createAuthMiddleware: jest.fn(),
  createAuthErrorResponse: jest.fn(),
}));

// Stand-in for business "b-9" (the Gherkin alias) — must be a valid UUID.
const BUSINESS_ID = '6f1e2b3c-4d5e-4f6a-8b7c-9d0e1f2a3b4c';

const AUTH_OK = {
  authenticated: true,
  user: { userId: 'u-admin', email: 'admin@example.com', role: 'admin' },
  statusCode: 200,
};

const mockClient = {
  query: jest.fn(),
  release: jest.fn(),
};
const mockPool = {
  connect: jest.fn().mockResolvedValue(mockClient),
};

/** Row shape as it comes back from the database. */
function b9Row(overrides: Record<string, unknown> = {}) {
  return {
    id: BUSINESS_ID,
    name: 'Blue Door Bakery',
    website: null,
    phone: '+15551112222',
    menu_url: null,
    image_url: null,
    description: null,
    social_urls: null,
    ...overrides,
  };
}

/** Row shape as the route must expose it to the admin form. */
function toApiShape(row: Record<string, unknown>) {
  return {
    id: row.id,
    name: row.name,
    website: row.website,
    phone: row.phone,
    menuUrl: row.menu_url,
    imageUrl: row.image_url,
    description: row.description,
    socialUrls: row.social_urls,
  };
}

function makeRequest(url: string, body?: unknown): NextRequest {
  // Minimal stand-in: the route only reads nextUrl and calls json().
  const standIn = {
    nextUrl: new URL(url, 'http://localhost'),
    json: async (): Promise<unknown> => (body === undefined ? {} : body),
  };
  return standIn as unknown as NextRequest;
}

function makeContext(id: string) {
  return { params: Promise.resolve({ id }) };
}

beforeEach(() => {
  jest.clearAllMocks();
  (createAuthMiddleware as jest.Mock).mockReturnValue(
    jest.fn(async () => AUTH_OK)
  );
  (createAuthErrorResponse as jest.Mock).mockReturnValue(
    NextResponse.json({ success: false, error: 'unauthenticated' }, { status: 401 })
  );
  (getPool as jest.Mock).mockReturnValue(mockPool);
});

describe('GET /api/admin/businesses/[id]/content', () => {
  it('prefills the form with the stored phone and an empty website field', async () => {
    mockClient.query.mockResolvedValue({ rows: [b9Row()] });

    const response = await GET(makeRequest(`/api/admin/businesses/${BUSINESS_ID}/content`), makeContext(BUSINESS_ID));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.business.phone).toBe('+15551112222');
    // website NULL in Postgres -> null in the API -> empty field in the form
    expect(body.data.business.website).toBeNull();
    expect(mockClient.query).toHaveBeenCalledWith(
      expect.stringContaining('FROM businesses WHERE id = $1'),
      [BUSINESS_ID]
    );
    expect(mockClient.release).toHaveBeenCalled();
  });
});

describe('PATCH /api/admin/businesses/[id]/content', () => {
  it('saves website and returns the updated business', async () => {
    mockClient.query.mockResolvedValue({
      rows: [b9Row({ website: 'https://example.com' })],
    });

    const response = await PATCH(
      makeRequest(`/api/admin/businesses/${BUSINESS_ID}/content`, {
        website: 'https://example.com',
      }),
      makeContext(BUSINESS_ID)
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      success: true,
      data: {
        business: toApiShape(b9Row({ website: 'https://example.com' })),
      },
    });

    // b-9.website in Postgres must end up "https://example.com"
    const [sql, params] = mockClient.query.mock.calls[0];
    expect(sql).toContain('UPDATE businesses');
    expect(sql).toContain('WHERE id = $1');
    expect(params[0]).toBe(BUSINESS_ID);
    expect(params).toContain('https://example.com');
    expect(mockClient.release).toHaveBeenCalled();
  });

  it('writes only the provided field and keeps previous values for the rest', async () => {
    const stored = b9Row({
      menu_url: 'https://example.com/menu',
      phone: '+15551112222',
      description: 'Local bakery',
    });
    mockClient.query.mockResolvedValue({ rows: [stored] });

    const response = await PATCH(
      makeRequest(`/api/admin/businesses/${BUSINESS_ID}/content`, {
        menuUrl: 'https://example.com/menu',
      }),
      makeContext(BUSINESS_ID)
    );
    const body = await response.json();

    expect(response.status).toBe(200);

    const [sql, params] = mockClient.query.mock.calls[0];
    // Only menu_url is written; phone and description keep their stored values.
    expect(sql).toContain('menu_url = $2');
    expect(sql).not.toContain('phone =');
    expect(sql).not.toContain('description =');
    expect(params).toEqual([BUSINESS_ID, 'https://example.com/menu']);
    expect(body.data.business.phone).toBe('+15551112222');
    expect(body.data.business.description).toBe('Local bakery');
    expect(body.data.business.menuUrl).toBe('https://example.com/menu');
  });
});
