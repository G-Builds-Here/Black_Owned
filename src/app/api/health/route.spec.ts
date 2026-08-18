/**
 * Health Check API Route Tests
 *
 * Tests for /api/health endpoint
 */

import { GET, POST, PUT, DELETE } from "./route";

describe("GET /api/health", () => {
  it("should return 200 with healthy status", async () => {
    const request = new Request("http://localhost/api/health", {
      method: "GET",
    });

    const response = await GET(request);
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.status).toBe("healthy");
  });

  it("should return JSON Content-Type header", async () => {
    const request = new Request("http://localhost/api/health", {
      method: "GET",
    });

    const response = await GET(request);

    expect(response.headers.get("content-type")).toContain("application/json");
  });

  it("should include timestamp in response", async () => {
    const request = new Request("http://localhost/api/health", {
      method: "GET",
    });

    const response = await GET(request);
    const json = await response.json();

    expect(json.timestamp).toBeDefined();
    expect(() => new Date(json.timestamp)).not.toThrow();
  });
});

describe("POST /api/health", () => {
  it("should return 405 Method Not Allowed", async () => {
    const response = await POST();

    expect(response.status).toBe(405);
  });

  it("should return error message", async () => {
    const response = await POST();
    const json = await response.json();

    expect(json.error).toBe("Method not allowed");
  });
});

describe("PUT /api/health", () => {
  it("should return 405 Method Not Allowed", async () => {
    const response = await PUT();

    expect(response.status).toBe(405);
  });

  it("should return error message", async () => {
    const response = await PUT();
    const json = await response.json();

    expect(json.error).toBe("Method not allowed");
  });
});

describe("DELETE /api/health", () => {
  it("should return 405 Method Not Allowed", async () => {
    const response = await DELETE();

    expect(response.status).toBe(405);
  });

  it("should return error message", async () => {
    const response = await DELETE();
    const json = await response.json();

    expect(json.error).toBe("Method not allowed");
  });
});
