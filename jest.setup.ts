import '@testing-library/jest-dom';

// Polyfill for TextEncoder/TextDecoder (required by some Node.js modules in Jest)
import { TextEncoder, TextDecoder } from 'util';
global.TextEncoder = TextEncoder;
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

// Polyfill for Request (required by Next.js API routes in jsdom environment)
class MockRequest {
  url: string;
  method: string;
  headers: Headers;
  body: string;

  constructor(input: string | MockRequest, init?: { method?: string; headers?: Record<string, string>; body?: string }) {
    if (typeof input === 'string') {
      this.url = input;
    } else {
      this.url = input.url;
    }
    this.method = (init?.method || 'GET').toUpperCase();
    this.headers = new Headers(init?.headers || {});
    this.body = init?.body || '';
  }

  async json() {
    return JSON.parse(this.body);
  }

  async text() {
    return this.body;
  }
}

global.Request = MockRequest as unknown as typeof Request;
