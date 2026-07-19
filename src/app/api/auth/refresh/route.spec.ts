/**
 * Token Refresh API Route Tests
 *
 * Tests for /api/auth/refresh endpoint
 */

import { POST } from "./route";
import { refreshAccessToken } from "@/lib/auth/token-refresh";

// Mock the token refresh service
jest.mock("@/lib/auth/token-refresh", () => ({
  refreshAccessToken: jest.fn(),
}));

describe("POST /api/auth/refresh", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  it("should return 400 when refresh token is missing", async () => {
    const request = new Request("http://localhost/api/auth/refresh", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    const response = await POST(request);
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.success).toBe(false);
    expect(json.error).toBe("Refresh token is required");
  });

  it("should return 500 when request body is invalid JSON", async () => {
    const request = new Request("http://localhost/api/auth/refresh", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "invalid json",
    });

    const response = await POST(request);
    expect(response.status).toBe(500);
  });

  it("should return 401 when refresh token is invalid", async () => {
    (refreshAccessToken as jest.Mock).mockResolvedValue({
      success: false,
      error: "Invalid or expired refresh token",
    });

    const request = new Request("http://localhost/api/auth/refresh", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken: "invalid-token" }),
    });

    const response = await POST(request);
    const json = await response.json();

    expect(response.status).toBe(401);
    expect(json.success).toBe(false);
    expect(json.error).toBe("Invalid or expired refresh token");
  });

  it("should return 200 with new token pair on successful refresh", async () => {
    const mockTokens = {
      accessToken: "new-access-token",
      refreshToken: "new-refresh-token",
    };

    (refreshAccessToken as jest.Mock).mockResolvedValue({
      success: true,
      tokens: mockTokens,
    });

    const request = new Request("http://localhost/api/auth/refresh", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken: "valid-refresh-token" }),
    });

    const response = await POST(request);
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.tokens).toEqual(mockTokens);
  });

  it("should call refreshAccessToken with the provided refresh token", async () => {
    const testToken = "test-refresh-token-123";

    (refreshAccessToken as jest.Mock).mockResolvedValue({
      success: true,
      tokens: {
        accessToken: "access",
        refreshToken: "refresh",
      },
    });

    const request = new Request("http://localhost/api/auth/refresh", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken: testToken }),
    });

    await POST(request);

    expect(refreshAccessToken).toHaveBeenCalledWith(testToken);
  });

  it("should return 500 on internal server error", async () => {
    (refreshAccessToken as jest.Mock).mockRejectedValue(new Error("Database error"));

    const request = new Request("http://localhost/api/auth/refresh", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken: "test-token" }),
    });

    const response = await POST(request);
    const json = await response.json();

    expect(response.status).toBe(500);
    expect(json.success).toBe(false);
    expect(json.error).toBe("Internal server error");
  });
});
