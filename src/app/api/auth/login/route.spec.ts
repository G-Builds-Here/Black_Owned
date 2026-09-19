/**
 * @jest-environment node
 */

/**
 * POST /api/auth/login acceptance tests (LOC-0092 AC1)
 *
 * The AC's contract: success keeps its exact JSON body AND now carries a
 * bw-session cookie (httpOnly, RS256, id+role claims). Failure paths carry
 * no cookie. Resolver boundary mocked; the real session-cookie helper signs
 * with an env key pair so the Set-Cookie assertion is end-to-end honest.
 */

import { NextRequest } from "next/server";
import { jwtVerify, importSPKI } from "jose";
import { POST } from "./route";
import { generateTestRsaPemPair } from "@/lib/auth/jwt-test-fixtures";

jest.mock("@/lib/graphql/login-resolvers", () => ({
  login: jest.fn(),
}));

import { login } from "@/lib/graphql/login-resolvers";
const mockedLogin = jest.mocked(login);

const { privateKey, publicKey } = generateTestRsaPemPair();

const SUCCESS_BODY = {
  success: true as const,
  tokens: { accessToken: "access-token", refreshToken: "refresh-token" },
  user: {
    id: "admin-user-id",
    email: "admin@example.com",
    name: "Admin",
    role: "admin",
    createdAt: "2026-01-01T00:00:00.000Z",
  },
};

function loginRequest(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/auth/login", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.JWT_PRIVATE_KEY = privateKey;
    process.env.JWT_PUBLIC_KEY = publicKey;
  });

  afterAll(() => {
    delete process.env.JWT_PRIVATE_KEY;
    delete process.env.JWT_PUBLIC_KEY;
  });

  it("Login_ValidCredentials_SetsHttponlySessionCookieWithIdRoleClaims", async () => {
    mockedLogin.mockResolvedValue(SUCCESS_BODY);

    const res = await POST(loginRequest({ email: "admin@example.com", password: "pw" }));

    const setCookie = res.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain("bw-session=");
    expect(setCookie).toContain("HttpOnly");
    expect(setCookie).toContain("Path=/");
    expect(setCookie).toContain("SameSite=Lax");

    // Decode the issued token -- claims must carry id and role (not userId)
    const token = setCookie.split(";")[0].slice("bw-session=".length);
    const key = await importSPKI(publicKey, "RS256");
    const { payload } = await jwtVerify(token, key, { algorithms: ["RS256"] });
    expect(payload.id).toBe("admin-user-id");
    expect(payload.role).toBe("admin");
  });

  it("Login_ValidCredentials_ResponseBodyUnchanged", async () => {
    mockedLogin.mockResolvedValue(SUCCESS_BODY);

    const res = await POST(loginRequest({ email: "admin@example.com", password: "pw" }));

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual(SUCCESS_BODY);
  });

  it("Login_InvalidCredentials_Returns401WithoutSetCookie", async () => {
    mockedLogin.mockResolvedValue({ success: false, error: "Invalid credentials" });

    const res = await POST(loginRequest({ email: "nobody@example.com", password: "pw" }));

    expect(res.status).toBe(401);
    expect(res.headers.get("set-cookie")).toBeNull();
  });

  it("Login_MissingFields_Returns400WithoutSetCookie", async () => {
    const res = await POST(loginRequest({ email: "admin@example.com" }));

    expect(res.status).toBe(400);
    expect(res.headers.get("set-cookie")).toBeNull();
    // Resolver must not be consulted for malformed input
    expect(mockedLogin).not.toHaveBeenCalled();
  });
});
