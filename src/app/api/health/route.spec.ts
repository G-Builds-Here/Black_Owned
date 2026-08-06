/**
 * Health Check API Route Tests
 *
 * Tests for /api/health endpoint
 */

import { NextRequest } from "next/server";
import { GET, POST, PUT, DELETE } from "./route";

// Mock the database module
jest.mock("../../../lib/db/user-repository", () => ({
  getPool: jest.fn(),
}));

const { getPool } = require("../../../lib/db/user-repository");

describe("GET /api/health", () => {
  const mockPool = {
    connect: jest.fn(),
  };

  const mockClient = {
    query: jest.fn(),
    release: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    getPool.mockReturnValue(mockPool);
  });

  it("should return 200 with healthy status when database is reachable", async () => {
    // Setup mock to simulate successful database connection
    mockPool.connect.mockResolvedValue(mockClient);
    mockClient.query.mockResolvedValue({ rows: [] });

    const request = new NextRequest("http://localhost/api/health", {
      method: "GET",
    });

    const response = await GET(request);
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.status).toBe("healthy");
    expect(json.database.status).toBe("healthy");
  });

  it("should return 503 with unhealthy status when database is unreachable", async () => {
    // Setup mock to simulate failed database connection
    mockPool.connect.mockRejectedValue(new Error("Connection refused"));

    const request = new NextRequest("http://localhost/api/health", {
      method: "GET",
    });

    const response = await GET(request);
    const json = await response.json();

    expect(response.status).toBe(503);
    expect(json.status).toBe("unhealthy");
    expect(json.database.status).toBe("unhealthy");
  });

  it("should return JSON Content-Type header", async () => {
    mockPool.connect.mockResolvedValue(mockClient);
    mockClient.query.mockResolvedValue({ rows: [] });

    const request = new NextRequest("http://localhost/api/health", {
      method: "GET",
    });

    const response = await GET(request);

    expect(response.headers.get("content-type")).toContain("application/json");
  });

  it("should include timestamp in response", async () => {
    mockPool.connect.mockResolvedValue(mockClient);
    mockClient.query.mockResolvedValue({ rows: [] });

    const request = new NextRequest("http://localhost/api/health", {
      method: "GET",
    });

    const response = await GET(request);
    const json = await response.json();

    expect(json.timestamp).toBeDefined();
    expect(() => new Date(json.timestamp)).not.toThrow();
  });

  it("should include database status object in response", async () => {
    mockPool.connect.mockResolvedValue(mockClient);
    mockClient.query.mockResolvedValue({ rows: [] });

    const request = new NextRequest("http://localhost/api/health", {
      method: "GET",
    });

    const response = await GET(request);
    const json = await response.json();

    expect(json.database).toBeDefined();
    expect(json.database.status).toBeDefined();
    expect(["healthy", "unhealthy"]).toContain(json.database.status);
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
