/**
 * Token Refresh Service Tests
 *
 * Tests for token-refresh.ts
 */

import { refreshAccessToken, RefreshTokenResult } from "./token-refresh";
import * as authService from "./auth-service";
import * as valkeyClient from "../valkey/valkey-client";

// Mock the dependencies
jest.mock("./auth-service", () => ({
  verifyToken: jest.fn(),
  generateAccessToken: jest.fn(),
  generateRefreshToken: jest.fn(),
}));

jest.mock("../valkey/valkey-client", () => ({
  getRefreshTokenUserId: jest.fn(),
  storeRefreshToken: jest.fn(),
  revokeRefreshToken: jest.fn(),
}));

describe("Token Refresh Service", () => {
  const mockUserId = "user-123";
  const mockEmail = "test@example.com";
  const mockRefreshToken = "mock-refresh-token-jwt";
  const mockAccessToken = "mock-access-token-jwt";
  const mockNewRefreshToken = "new-refresh-token-jwt";

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  describe("refreshAccessToken", () => {
    it("should successfully refresh tokens when refresh token is valid", async () => {
      // Setup mocks
      (valkeyClient.getRefreshTokenUserId as jest.Mock).mockResolvedValue(mockUserId);
      (authService.verifyToken as jest.Mock).mockReturnValue({
        userId: mockUserId,
        email: mockEmail,
        iat: Date.now() / 1000,
        exp: Date.now() / 1000 + 7 * 24 * 60 * 60,
      });
      (authService.generateAccessToken as jest.Mock).mockReturnValue(mockAccessToken);
      (authService.generateRefreshToken as jest.Mock).mockReturnValue(mockNewRefreshToken);

      const result = await refreshAccessToken(mockRefreshToken);

      // Verify success
      expect(result.success).toBe(true);
      expect(result.tokens).toBeDefined();
      expect(result.tokens?.accessToken).toBe(mockAccessToken);
      expect(result.tokens?.refreshToken).toBe(mockNewRefreshToken);

      // Verify Valkey operations
      expect(valkeyClient.getRefreshTokenUserId).toHaveBeenCalledWith(mockRefreshToken);
      expect(valkeyClient.revokeRefreshToken).toHaveBeenCalledWith(mockRefreshToken);
      expect(valkeyClient.storeRefreshToken).toHaveBeenCalledWith(mockNewRefreshToken, mockUserId);

      // Verify token generation
      expect(authService.generateAccessToken).toHaveBeenCalled();
      expect(authService.generateRefreshToken).toHaveBeenCalled();
    });

    it("should fail when refresh token does not exist in Valkey", async () => {
      // Setup mocks
      (valkeyClient.getRefreshTokenUserId as jest.Mock).mockResolvedValue(null);

      const result = await refreshAccessToken(mockRefreshToken);

      // Verify failure
      expect(result.success).toBe(false);
      expect(result.error).toBe("Invalid or expired refresh token");
      expect(result.tokens).toBeUndefined();

      // Verify no token operations were performed
      expect(authService.generateAccessToken).not.toHaveBeenCalled();
      expect(authService.generateRefreshToken).not.toHaveBeenCalled();
      expect(valkeyClient.revokeRefreshToken).not.toHaveBeenCalled();
    });

    it("should fail when JWT signature is invalid", async () => {
      // Setup mocks
      (valkeyClient.getRefreshTokenUserId as jest.Mock).mockResolvedValue(mockUserId);
      (authService.verifyToken as jest.Mock).mockImplementation(() => {
        throw new Error("Invalid token signature");
      });

      const result = await refreshAccessToken(mockRefreshToken);

      // Verify failure
      expect(result.success).toBe(false);
      expect(result.error).toBe("Invalid refresh token signature or expiry");

      // Verify no token rotation occurred
      expect(valkeyClient.revokeRefreshToken).not.toHaveBeenCalled();
    });

    it("should fail when JWT is expired", async () => {
      // Setup mocks
      (valkeyClient.getRefreshTokenUserId as jest.Mock).mockResolvedValue(mockUserId);
      (authService.verifyToken as jest.Mock).mockImplementation(() => {
        throw new Error("Token expired");
      });

      const result = await refreshAccessToken(mockRefreshToken);

      // Verify failure
      expect(result.success).toBe(false);
      expect(result.error).toBe("Invalid refresh token signature or expiry");
    });

    it("should fail when token user ID does not match Valkey record", async () => {
      // Setup mocks
      (valkeyClient.getRefreshTokenUserId as jest.Mock).mockResolvedValue(mockUserId);
      (authService.verifyToken as jest.Mock).mockReturnValue({
        userId: "different-user-id",
        email: mockEmail,
        iat: Date.now() / 1000,
        exp: Date.now() / 1000 + 7 * 24 * 60 * 60,
      });

      const result = await refreshAccessToken(mockRefreshToken);

      // Verify failure
      expect(result.success).toBe(false);
      expect(result.error).toBe("Token user ID mismatch");

      // Verify no token rotation occurred
      expect(valkeyClient.revokeRefreshToken).not.toHaveBeenCalled();
    });

    it("should revoke old refresh token before storing new one", async () => {
      // Setup mocks
      (valkeyClient.getRefreshTokenUserId as jest.Mock).mockResolvedValue(mockUserId);
      (authService.verifyToken as jest.Mock).mockReturnValue({
        userId: mockUserId,
        email: mockEmail,
        iat: Date.now() / 1000,
        exp: Date.now() / 1000 + 7 * 24 * 60 * 60,
      });
      (authService.generateAccessToken as jest.Mock).mockReturnValue(mockAccessToken);
      (authService.generateRefreshToken as jest.Mock).mockReturnValue(mockNewRefreshToken);

      await refreshAccessToken(mockRefreshToken);

      // Verify revoke was called before store
      const revokeCallIndex = (valkeyClient.revokeRefreshToken as jest.Mock).mock.invocationCallOrder[0];
      const storeCallIndex = (valkeyClient.storeRefreshToken as jest.Mock).mock.invocationCallOrder[0];

      expect(revokeCallIndex).toBeLessThan(storeCallIndex);
    });

    it("should handle Valkey connection errors gracefully", async () => {
      // Setup mocks
      (valkeyClient.getRefreshTokenUserId as jest.Mock).mockRejectedValue(
        new Error("Valkey connection failed")
      );

      const result = await refreshAccessToken(mockRefreshToken);

      // Verify graceful failure
      expect(result.success).toBe(false);
      expect(result.error).toBe("Internal server error during token refresh");
    });
  });
});
