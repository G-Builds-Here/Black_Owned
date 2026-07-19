/**
 * Mock for next/server to avoid Node.js global API issues in tests
 */

export class NextRequest {
  constructor(url: string, init?: RequestInit) {
    this.url = url;
    this.headers = new Headers(init?.headers);
  }

  url: string;
  headers: Headers;

  nextUrl = {
    pathname: "",
    search: "",
    hostname: "localhost",
  };
}

export class NextResponse {
  static json(data: unknown, init?: ResponseInit) {
    const response = new Response(JSON.stringify(data), {
      ...init,
      headers: { "Content-Type": "application/json", ...init?.headers },
    });
    return response;
  }

  static redirect(url: string, status = 307) {
    return new Response(null, {
      status,
      headers: { Location: url },
    });
  }

  static notFound() {
    return new Response(null, { status: 404 });
  }
}
