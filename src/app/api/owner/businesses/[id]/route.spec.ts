/**
 * PATCH /api/owner/businesses/[id] tests
 */

import { NextRequest, NextResponse } from "next/server";
import { getPool } from "@/lib/db/user-repository";
import { updateNameById, updateDescriptionById } from "@/lib/db/business-repository";
import { createAuthErrorResponse } from "@/lib/auth/jwt-middleware";
import { PATCH } from "./route";

jest.mock("@/lib/db/user-repository", () => ({
  getPool: jest.fn(),
}));

jest.mock("@/lib/db/business-repository", () => ({
  updateNameById: jest.fn(),
  updateDescriptionById: jest.fn(),
}));

jest.mock("@/lib/auth/jwt-middleware", () => ({
  createAuthMiddleware: jest.fn(),
  createAuthErrorResponse: jest.fn(),
}));

import { createAuthMiddleware } from "@/lib/auth/jwt-middleware";

const mockedGetPool = jest.mocked(getPool);
const mockedCreateAuth = jest.mocked(createAuthMiddleware);
const mockedAuthError = jest.mocked(createAuthErrorResponse);
const mockedUpdateName = jest.mocked(updateNameById);
const mockedUpdateDescription = jest.mocked(updateDescriptionById);

const BIZ_ID = "11111111-2222-3333-4444-555555555555";
const AUTH_OK = {
  authenticated: true,
  user: { userId: "u-1", email: "owner@example.com", role: "user" },
  statusCode: 200,
};
const AUTH_FAIL = {
  authenticated: false,
  errorType: "NO_AUTH_HEADER",
  errorMessage: "Authorization header is required",
  statusCode: 401,
};

function patchRequest(body?: unknown) {
  return new NextRequest(`http://localhost/api/owner/businesses/${BIZ_ID}`, {
    method: "PATCH",
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

function mockClient() {
  mockedGetPool.mockReturnValue({
    connect: jest.fn().mockResolvedValue({
      query: jest.fn(),
      release: jest.fn(),
    }),
  } as unknown as ReturnType<typeof getPool>);
}

const BIZ = {
  id: BIZ_ID,
  ownerId: "u-1",
  name: "Soul Kitchen",
  description: "Southern soul food",
  categoryId: "c7e04c6a",
  verificationStatus: "unverified" as const,
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe("PATCH /api/owner/businesses/[id]", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedCreateAuth.mockReturnValue(jest.fn(async () => AUTH_OK) as never);
    mockedAuthError.mockReturnValue(
      NextResponse.json({ success: false, error: "unauthenticated" }, { status: 401 })
    );
    mockClient();
  });

  it("returns 401 when unauthenticated", async () => {
    mockedCreateAuth.mockReturnValue(jest.fn(async () => AUTH_FAIL) as never);

    const res = await PATCH(patchRequest({ name: "X" }), {
      params: Promise.resolve({ id: BIZ_ID }),
    });
    expect(res.status).toBe(401);
    expect(mockedGetPool).not.toHaveBeenCalled();
  });

  it("returns 400 for an invalid business ID", async () => {
    const res = await PATCH(patchRequest({ name: "X" }), {
      params: Promise.resolve({ id: "nope" }),
    });
    expect(res.status).toBe(400);
  });

  it("returns 400 for a missing or malformed JSON body", async () => {
    const noBody = await PATCH(new NextRequest(`http://localhost/api/owner/businesses/${BIZ_ID}`), {
      params: Promise.resolve({ id: BIZ_ID }),
    });
    expect(noBody.status).toBe(400);

    const empty = await PATCH(patchRequest({}), {
      params: Promise.resolve({ id: BIZ_ID }),
    });
    expect(empty.status).toBe(400);
  });

  it("rejects an empty or oversized name", async () => {
    const emptyName = await PATCH(patchRequest({ name: "   " }), {
      params: Promise.resolve({ id: BIZ_ID }),
    });
    expect(emptyName.status).toBe(400);

    const longName = await PATCH(
      patchRequest({ name: "x".repeat(256) }),
      { params: Promise.resolve({ id: BIZ_ID }) }
    );
    expect(longName.status).toBe(400);
    expect(mockedUpdateName).not.toHaveBeenCalled();
  });

  it("updates the name and scopes the write to the owner", async () => {
    mockedUpdateName.mockResolvedValue({ ...BIZ, name: "New Name" });

    const res = await PATCH(patchRequest({ name: "New Name" }), {
      params: Promise.resolve({ id: BIZ_ID }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.name).toBe("New Name");
    expect(mockedUpdateName).toHaveBeenCalledWith(
      expect.anything(),
      BIZ_ID,
      "New Name",
      "u-1"
    );
    expect(mockedUpdateDescription).not.toHaveBeenCalled();
  });

  it("clears the description when sent as null", async () => {
    mockedUpdateDescription.mockResolvedValue({ ...BIZ, description: undefined });

    const res = await PATCH(patchRequest({ description: null }), {
      params: Promise.resolve({ id: BIZ_ID }),
    });
    expect(res.status).toBe(200);
    expect(mockedUpdateName).not.toHaveBeenCalled();
    expect(mockedUpdateDescription).toHaveBeenCalledWith(
      expect.anything(),
      BIZ_ID,
      null,
      "u-1"
    );
    const body = await res.json();
    expect(body.data.description).toBeNull();
  });

  it("applies both name and description in one request", async () => {
    mockedUpdateName.mockResolvedValue({ ...BIZ, name: "New Name" });
    mockedUpdateDescription.mockResolvedValue({
      ...BIZ,
      name: "New Name",
      description: "New description",
    });

    const res = await PATCH(
      patchRequest({ name: "New Name", description: "New description" }),
      { params: Promise.resolve({ id: BIZ_ID }) }
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.name).toBe("New Name");
    expect(body.data.description).toBe("New description");
    expect(mockedUpdateName).toHaveBeenCalled();
    expect(mockedUpdateDescription).toHaveBeenCalled();
  });

  it("returns 404 when the business is not owned by the user", async () => {
    mockedUpdateName.mockResolvedValue(undefined);
    mockedUpdateDescription.mockResolvedValue(undefined);

    const res = await PATCH(patchRequest({ name: "New Name" }), {
      params: Promise.resolve({ id: BIZ_ID }),
    });
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.code).toBe("NOT_FOUND");
  });

  it("returns 500 on database error", async () => {
    mockedUpdateName.mockRejectedValue(new Error("db down"));

    const res = await PATCH(patchRequest({ name: "New Name" }), {
      params: Promise.resolve({ id: BIZ_ID }),
    });
    expect(res.status).toBe(500);
  });
});
