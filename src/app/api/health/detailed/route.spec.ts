/**
 * Detailed Health Check API Route Tests
 *
 * Tests for /api/health/detailed endpoint
 */

import { GET, POST, PUT, DELETE } from "./route";

describe("GET /api/health/detailed", () => {
  it("should return 200 with overall status", async () => {
    const request = new Request("http://localhost/api/health/detailed", {
      method: "GET",
    });

    const response = await GET(request);
    const json = await response.json();

    expect(response.status).toBe(200);
    // Status is "healthy" only if all services are healthy; otherwise "unhealthy"
    expect(["healthy", "unhealthy"]).toContain(json.status);
  });

  it("should return JSON Content-Type header", async () => {
    const request = new Request("http://localhost/api/health/detailed", {
      method: "GET",
    });

    const response = await GET(request);

    expect(response.headers.get("content-type")).toContain("application/json");
  });

  it("should include timestamp in response", async () => {
    const request = new Request("http://localhost/api/health/detailed", {
      method: "GET",
    });

    const response = await GET(request);
    const json = await response.json();

    expect(json.timestamp).toBeDefined();
    expect(() => new Date(json.timestamp)).not.toThrow();
  });

  it("should include uptime_seconds as a number", async () => {
    const request = new Request("http://localhost/api/health/detailed", {
      method: "GET",
    });

    const response = await GET(request);
    const json = await response.json();

    expect(json.uptime_seconds).toBeDefined();
    expect(typeof json.uptime_seconds).toBe("number");
    expect(json.uptime_seconds).toBeGreaterThanOrEqual(0);
  });

  it("should include version string", async () => {
    const request = new Request("http://localhost/api/health/detailed", {
      method: "GET",
    });

    const response = await GET(request);
    const json = await response.json();

    expect(json.version).toBeDefined();
    expect(typeof json.version).toBe("string");
  });

  it("should include services array", async () => {
    const request = new Request("http://localhost/api/health/detailed", {
      method: "GET",
    });

    const response = await GET(request);
    const json = await response.json();

    expect(json.services).toBeDefined();
    expect(Array.isArray(json.services)).toBe(true);
    expect(json.services.length).toBeGreaterThan(0);
  });

  it("should include service status objects with name and status fields", async () => {
    const request = new Request("http://localhost/api/health/detailed", {
      method: "GET",
    });

    const response = await GET(request);
    const json = await response.json();

    for (const service of json.services) {
      expect(service.name).toBeDefined();
      expect(["healthy", "unhealthy", "unknown"]).toContain(service.status);
    }
  });
});

describe("POST /api/health/detailed", () => {
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

describe("PUT /api/health/detailed", () => {
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

describe("DELETE /api/health/detailed", () => {
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
