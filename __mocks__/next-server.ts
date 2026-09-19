/**
 * Mock for next/server to avoid Node.js global API issues in tests
 *
 * Cookies support (added for LOC-0092): NextResponse instances expose a
 * minimal cookies API that serializes set()/delete() into `set-cookie`
 * response headers, mirroring the real NextResponse.cookies surface just
 * enough for route/middleware specs. NextRequest parses the `cookie`
 * request header into cookies.get(). One cookie per response in practice --
 * headers.get("set-cookie") comma-joins multiples under undici.
 */

interface NextRequestInit {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
}

interface CookieAttributes {
  httpOnly?: boolean;
  path?: string;
  sameSite?: "lax" | "strict" | "none";
  maxAge?: number;
  [key: string]: unknown;
}

interface MockCookieStore {
  set(name: string, value: string, attributes?: CookieAttributes): void;
  delete(name: string): void;
}

export type MockNextResponse = Response & { cookies: MockCookieStore };

function serializeCookie(name: string, value: string, attributes: CookieAttributes): string {
  const parts = [`${name}=${value}`];
  if (attributes.path) parts.push(`Path=${attributes.path}`);
  if (attributes.sameSite) {
    parts.push(`SameSite=${attributes.sameSite[0].toUpperCase()}${attributes.sameSite.slice(1)}`);
  }
  if (attributes.httpOnly) parts.push("HttpOnly");
  if (attributes.maxAge !== undefined) parts.push(`Max-Age=${attributes.maxAge}`);
  return parts.join("; ");
}

function withCookies(response: Response): MockNextResponse {
  const r = response as MockNextResponse;
  r.cookies = {
    set(name: string, value: string, attributes: CookieAttributes = {}) {
      r.headers.append("set-cookie", serializeCookie(name, value, attributes));
    },
    delete(name: string) {
      r.headers.append("set-cookie", serializeCookie(name, "", { maxAge: 0 }));
    },
  };
  return r;
}

export class NextRequest {
  constructor(url: string, init?: NextRequestInit) {
    this.url = url;
    this.headers = new Headers(init?.headers);
    this._body = init?.body;
    this.method = init?.method || "GET";

    const parsed = new URL(url);
    this.nextUrl = {
      pathname: parsed.pathname,
      search: parsed.search,
      hostname: parsed.hostname,
    };
  }

  url: string;
  headers: Headers;
  method: string;
  private _body?: string;

  nextUrl: { pathname: string; search: string; hostname: string };

  // Arrow function: the field initializer captures the NextRequest `this`.
  // A method shorthand would bind `this` to the cookies object instead and
  // crash on this.headers (LOC-0092 debugging).
  cookies = {
    get: (name: string): { name: string; value: string } | undefined => {
      const raw = this.headers.get("cookie");
      if (!raw) return undefined;
      for (const pair of raw.split(";")) {
        const [key, ...rest] = pair.trim().split("=");
        if (key === name) return { name, value: rest.join("=") };
      }
      return undefined;
    },
  };

  async json(): Promise<unknown> {
    if (this._body) {
      return JSON.parse(this._body);
    }
    throw new Error("No body provided");
  }
}

export class NextResponse {
  static json(data: unknown, init?: ResponseInit): MockNextResponse {
    const response = new Response(JSON.stringify(data), {
      ...init,
      headers: { "Content-Type": "application/json", ...init?.headers },
    });
    return withCookies(response);
  }

  static redirect(url: string, status = 307): MockNextResponse {
    const response = new Response(null, {
      status,
      headers: { Location: url },
    });
    return withCookies(response);
  }

  static next(init?: ResponseInit): MockNextResponse {
    const response = new Response(null, {
      ...init,
      headers: { "x-middleware-next": "1", ...init?.headers },
    });
    return withCookies(response);
  }

  static notFound(): MockNextResponse {
    return withCookies(new Response(null, { status: 404 }));
  }
}
