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

// Mock the NATS module
jest.mock("../../../lib/nats/nats-client", () => ({
  checkNatsHealth: jest.fn().mockResolvedValue({ healthy: true, latencyMs: 15 }),
}));

const { getPool } = require("../../../lib/db/user-repository");
const { checkNatsHealth } = require("../../../lib/nats/nats-client");

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
    checkNatsHealth.mockResolvedValue({ healthy: true, latencyMs: 15 });
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

  it("should return 503 with unhealthy NATS status when NATS is unreachable", async () => {
    // Arrange - database healthy, NATS unreachable
    mockPool.connect.mockResolvedValue(mockClient);
    mockClient.query.mockResolvedValue({ rows: [] });
    checkNatsHealth.mockResolvedValue({ healthy: false });

    const request = new NextRequest("http://localhost/api/health", {
      method: "GET",
    });

    // Act
    const response = await GET(request);
    const json = await response.json();

    // Assert
    expect(response.status).toBe(503);
    expect(json.status).toBe("unhealthy");
    expect(json.nats.status).toBe("unhealthy");
  });

  it("should return 503 when NATS health check throws exception", async () => {
    // Arrange - database healthy, NATS throws error
    mockPool.connect.mockResolvedValue(mockClient);
    mockClient.query.mockResolvedValue({ rows: [] });
    checkNatsHealth.mockRejectedValue(new Error("NATS connection failed"));

    const request = new NextRequest("http://localhost/api/health", {
      method: "GET",
    });

    // Act
    const response = await GET(request);
    const json = await response.json();

    // Assert
    expect(response.status).toBe(503);
    expect(json.status).toBe("unhealthy");
    expect(json.nats.status).toBe("unhealthy");
  });

  it("should include nats.latency_ms field when NATS is healthy", async () => {
    mockPool.connect.mockResolvedValue(mockClient);
    mockClient.query.mockResolvedValue({ rows: [] });
    checkNatsHealth.mockResolvedValue({ healthy: true, latencyMs: 35 });

    const request = new NextRequest("http://localhost/api/health", {
      method: "GET",
    });

    const response = await GET(request);
    const json = await response.json();

    expect(json.nats.latency_ms).toBeDefined();
    expect(typeof json.nats.latency_ms).toBe("number");
    expect(json.nats.latency_ms).toBe(35);
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
