/**
 * Health Check API Route Tests
 *
 * Tests for /api/health endpoint
 */

// Mock the database module before importing the route
const mockQuery = jest.fn();
const mockRelease = jest.fn();
const mockPool = {
  connect: jest.fn(() => ({
    query: mockQuery,
    release: mockRelease,
  })),
};

jest.mock("../../../lib/db/user-repository", () => ({
  getPool: jest.fn(() => mockPool),
}));

import { GET, POST, PUT, DELETE } from "./route";
import { getPool } from "../../../lib/db/user-repository";

describe("GET /api/health", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("should return 200 with healthy status when database is reachable", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });

    const request = new Request("http://localhost/api/health", {
      method: "GET",
    });

    const response = await GET(request);
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.status).toBe("healthy");
    expect(json.database).toBe("connected");
  });

  it("should return 503 with unhealthy status when database is unreachable", async () => {
    mockQuery.mockRejectedValueOnce(new Error("Connection refused"));

    const request = new Request("http://localhost/api/health", {
      method: "GET",
    });

    const response = await GET(request);
    const json = await response.json();

    expect(response.status).toBe(503);
    expect(json.status).toBe("unhealthy");
    expect(json.database).toBe("unreachable");
  });

  it("should return JSON Content-Type header", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });

    const request = new Request("http://localhost/api/health", {
      method: "GET",
    });

    const response = await GET(request);

    expect(response.headers.get("content-type")).toContain("application/json");
  });

  it("should include timestamp in response", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });

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
