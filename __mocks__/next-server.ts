/**
 * Mock for next/server to avoid Node.js global API issues in tests
 */

interface NextRequestInit {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
}

export class NextRequest {
  constructor(url: string, init?: NextRequestInit) {
    this.url = url;
    this.headers = new Headers(init?.headers);
    this._body = init?.body;
    this.method = init?.method || "GET";
  }

  url: string;
  headers: Headers;
  method: string;
  private _body?: string;

  nextUrl = {
    pathname: "",
    search: "",
    hostname: "localhost",
  };

  async json(): Promise<unknown> {
    if (this._body) {
      return JSON.parse(this._body);
    }
    throw new Error("No body provided");
  }
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
