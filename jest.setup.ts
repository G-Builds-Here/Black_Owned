import '@testing-library/jest-dom';

// Polyfill for TextEncoder/TextDecoder (required by some Node.js modules in Jest)
import { TextEncoder, TextDecoder } from 'util';
// @ts-ignore - type compatibility issue with Node.js polyfills
global.TextEncoder = TextEncoder;
// @ts-ignore - type compatibility issue with Node.js polyfills
global.TextDecoder = TextDecoder;

// Polyfill for Response (required by Next.js API routes in jsdom environment)
// Define a minimal mock Response class for testing API routes
class MockResponse {
  status: number;
  statusText: string;
  headers: Headers;
  body: string;

  constructor(body: string | null, init?: { status?: number; statusText?: string; headers?: Record<string, string> }) {
    this.status = init?.status ?? 200;
    this.statusText = init?.statusText ?? 'OK';
    this.headers = new Headers(init?.headers);
    this.body = body ?? '';
  }

  static json(data: unknown, init?: { status?: number; statusText?: string; headers?: Record<string, string> }) {
    return new MockResponse(JSON.stringify(data), {
      ...init,
      headers: { 'Content-Type': 'application/json', ...init?.headers },
    });
  }

  async json() {
    return JSON.parse(this.body);
  }

  async text() {
    return this.body;
  }
}

global.Response = MockResponse as unknown as typeof Response;

// Polyfill for Request (required by Next.js API route tests in jsdom environment)
// The jsdom test environment does not expose the Web `Request` constructor, but the
// API-route specs build requests with `new Request(url, { method, headers, body })`
// and the route handlers call `request.json()` / `request.text()`.
class MockRequest {
  url: string;
  method: string;
  body: string;
  headers: Record<string, string>;

  constructor(
    input: string,
    init?: { method?: string; headers?: Record<string, string>; body?: string }
  ) {
    this.url = input;
    this.method = init?.method ?? 'GET';
    this.headers = init?.headers ?? {};
    this.body = init?.body ?? '';
  }

  async json(): Promise<unknown> {
    return this.body ? JSON.parse(this.body) : {};
  }

  async text(): Promise<string> {
    return this.body;
  }
}

global.Request = MockRequest as unknown as typeof Request;
