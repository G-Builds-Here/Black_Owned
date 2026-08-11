/**
 * NATS Health Check Tests - LOC-0057-AC3
 *
 * Tests for NATS connectivity health check integration
 * Gherkin: Given NATS is unreachable
 *          When a GET request is made to /health
 *          Then the response includes nats status "unhealthy"
 *          And HTTP status code is 503
 */

import { NextRequest } from "next/server";
import { GET } from "./route";

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

describe("GET /api/health - NATS Integration (LOC-0057-AC3)", () => {
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

  it("should return 503 with unhealthy status when NATS is unreachable", async () => {
    // Setup mock to simulate successful database connection
    mockPool.connect.mockResolvedValue(mockClient);
    mockClient.query.mockResolvedValue({ rows: [] });

    // Setup mock to simulate NATS unreachability
    checkNatsHealth.mockResolvedValue({ healthy: false });

    const request = new NextRequest("http://localhost/api/health", {
      method: "GET",
    });

    const response = await GET(request);
    const json = await response.json();

    expect(response.status).toBe(503);
    expect(json.status).toBe("unhealthy");
    expect(json.nats).toBeDefined();
    expect(json.nats.status).toBe("unhealthy");
  });

  it("should return 200 with healthy status when both DB and NATS are healthy", async () => {
    // Setup mock to simulate successful database connection
    mockPool.connect.mockResolvedValue(mockClient);
    mockClient.query.mockResolvedValue({ rows: [] });

    // Setup mock to simulate NATS health
    checkNatsHealth.mockResolvedValue({ healthy: true, latencyMs: 25 });

    const request = new NextRequest("http://localhost/api/health", {
      method: "GET",
    });

    const response = await GET(request);
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.status).toBe("healthy");
    expect(json.database.status).toBe("healthy");
    expect(json.nats).toBeDefined();
    expect(json.nats.status).toBe("healthy");
    expect(json.nats.latency_ms).toBe(25);
  });

  it("should return 503 when DB is healthy but NATS is unhealthy", async () => {
    // Setup mock to simulate successful database connection
    mockPool.connect.mockResolvedValue(mockClient);
    mockClient.query.mockResolvedValue({ rows: [] });

    // Setup mock to simulate NATS unreachability
    checkNatsHealth.mockResolvedValue({ healthy: false });

    const request = new NextRequest("http://localhost/api/health", {
      method: "GET",
    });

    const response = await GET(request);
    const json = await response.json();

    expect(response.status).toBe(503);
    expect(json.status).toBe("unhealthy");
    expect(json.database.status).toBe("healthy");
    expect(json.nats.status).toBe("unhealthy");
  });

  it("should return 503 when DB is unhealthy regardless of NATS status", async () => {
    // Setup mock to simulate database unreachability
    mockPool.connect.mockRejectedValue(new Error("Connection refused"));

    // NATS health should not matter when DB is down
    checkNatsHealth.mockResolvedValue({ healthy: true, latencyMs: 20 });

    const request = new NextRequest("http://localhost/api/health", {
      method: "GET",
    });

    const response = await GET(request);
    const json = await response.json();

    expect(response.status).toBe(503);
    expect(json.status).toBe("unhealthy");
    expect(json.database.status).toBe("unhealthy");
  });

  it("should include timestamp in response with NATS status", async () => {
    mockPool.connect.mockResolvedValue(mockClient);
    mockClient.query.mockResolvedValue({ rows: [] });
    checkNatsHealth.mockResolvedValue({ healthy: true, latencyMs: 18 });

    const request = new NextRequest("http://localhost/api/health", {
      method: "GET",
    });

    const response = await GET(request);
    const json = await response.json();

    expect(json.timestamp).toBeDefined();
    expect(() => new Date(json.timestamp)).not.toThrow();
  });

  it("should include both database and nats status objects in response", async () => {
    mockPool.connect.mockResolvedValue(mockClient);
    mockClient.query.mockResolvedValue({ rows: [] });
    checkNatsHealth.mockResolvedValue({ healthy: false });

    const request = new NextRequest("http://localhost/api/health", {
      method: "GET",
    });

    const response = await GET(request);
    const json = await response.json();

    expect(json.database).toBeDefined();
    expect(json.database.status).toBeDefined();
    expect(json.nats).toBeDefined();
    expect(json.nats.status).toBeDefined();
    expect(["healthy", "unhealthy"]).toContain(json.nats.status);
  });

  it("should include nats.latency_ms field when NATS is healthy", async () => {
    mockPool.connect.mockResolvedValue(mockClient);
    mockClient.query.mockResolvedValue({ rows: [] });
    checkNatsHealth.mockResolvedValue({ healthy: true, latencyMs: 42 });

    const request = new NextRequest("http://localhost/api/health", {
      method: "GET",
    });

    const response = await GET(request);
    const json = await response.json();

    expect(json.nats.latency_ms).toBeDefined();
    expect(typeof json.nats.latency_ms).toBe("number");
    expect(json.nats.latency_ms).toBe(42);
  });

  it("should not include nats.latency_ms field when NATS is unhealthy", async () => {
    mockPool.connect.mockResolvedValue(mockClient);
    mockClient.query.mockResolvedValue({ rows: [] });
    checkNatsHealth.mockResolvedValue({ healthy: false });

    const request = new NextRequest("http://localhost/api/health", {
      method: "GET",
    });

    const response = await GET(request);
    const json = await response.json();

    expect(json.nats.latency_ms).toBeUndefined();
  });
});
