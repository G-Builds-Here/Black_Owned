/**
 * @jest-environment node
 */

/**
 * POST /api/graphql resolver-context acceptance tests (LOC-0093)
 *
 * AC1: the resolver context carries the caller's real claims (built from the
 * bw-session cookie via verifySessionCookie) -- and the hardcoded
 * 'Bearer token' string is gone from the request path.
 * AC2: public queries stay anonymous -- 200 with unchanged data.
 * AC3: private queries require authentication -- error envelope with code
 * UNAUTHENTICATED / message "Authentication required" and null private data;
 * a valid admin session returns data normally.
 *
 * Resolver boundary mocked (login route.spec.ts precedent): the seam under
 * test is context construction at the route, not the DB layer. The real
 * session-cookie helper signs tokens with an env key pair, so the
 * cookie->claims path is end-to-end honest.
 */

import { NextRequest } from "next/server";
import { POST, buildGraphQLContext } from "./route";
import { createSessionToken } from "@/lib/auth/session-cookie";
import { generateTestRsaPemPair } from "@/lib/auth/jwt-test-fixtures";

jest.mock("@/lib/graphql/resolvers", () => ({
  resolvers: {
    Query: {
      health: jest.fn(),
      searchBusinesses: jest.fn(),
      business: jest.fn(),
    },
    Mutation: {
      register: jest.fn(),
      createBusiness: jest.fn(),
      submitVerification: jest.fn(),
      updateBusiness: jest.fn(),
    },
  },
}));

import { resolvers } from "@/lib/graphql/resolvers";
const mockedCreateBusiness = jest.mocked(resolvers.Mutation.createBusiness);
const mockedSearchBusinesses = jest.mocked(resolvers.Query.searchBusinesses);

const { privateKey, publicKey } = generateTestRsaPemPair();

const ADMIN_TOKEN_FOR_TESTS = "user-admin-1";
const REGULAR_USER_ID = "user-regular-1";

const CREATE_BUSINESS_MUTATION =
  'mutation { createBusiness(input: { name: "Jazz Cafe", description: "live music", categoryId: "cat-jazz" }) { success } }';

const SEARCH_QUERY =
  'query { searchBusinesses(query: "jazz", page: 1, pageSize: 10) { total } }';

const SEARCH_RESULTS = {
  businesses: [],
  total: 0,
  page: 1,
  pageSize: 10,
  totalPages: 0,
  facets: [],
};

function graphqlRequest(
  query: string,
  headers: Record<string, string> = {}
): NextRequest {
  return new NextRequest("http://localhost/api/graphql", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify({ query, variables: {} }),
  });
}

async function sessionCookieHeader(
  id: string,
  role: string
): Promise<Record<string, string>> {
  const token = await createSessionToken({ id, role });
  return { cookie: `bw-session=${token}` };
}

beforeEach(() => {
  jest.clearAllMocks();
  process.env.JWT_PRIVATE_KEY = privateKey;
  process.env.JWT_PUBLIC_KEY = publicKey;
});

afterAll(() => {
  delete process.env.JWT_PRIVATE_KEY;
  delete process.env.JWT_PUBLIC_KEY;
});

describe("POST /api/graphql resolver context (AC1)", () => {
  it("PrivateMutation_ValidAdminSession_ResolverContextCarriesCallerClaims", async () => {
    mockedCreateBusiness.mockResolvedValue({ success: true });

    const res = await POST(
      graphqlRequest(
        CREATE_BUSINESS_MUTATION,
        await sessionCookieHeader(ADMIN_TOKEN_FOR_TESTS, "admin")
      )
    );

    expect(res.status).toBe(200);
    expect(mockedCreateBusiness).toHaveBeenCalledTimes(1);
    const context = mockedCreateBusiness.mock.calls[0][2] as {
      user?: { id: string; role: string };
      headers?: { authorization?: string };
    };
    // Claims the resolver reads (context.user.id convention, resolvers.ts)
    expect(context.user).not.toBeNull();
    expect(context.user?.id).toBe("user-admin-1");
    expect(context.user?.role).toBe("admin");
    // The hardcoded fake must be gone from the request path: a cookie-only
    // request carries no authorization header, so the context must not
    // fabricate one.
    expect(context.headers?.authorization).toBeUndefined();
  });

  it("PerRequestIdentity_TwoSequentialRequests_EachSeesOwnClaims", async () => {
    mockedCreateBusiness.mockResolvedValue({ success: true });

    await POST(
      graphqlRequest(
        CREATE_BUSINESS_MUTATION,
        await sessionCookieHeader("user-admin-1", "admin")
      )
    );
    await POST(
      graphqlRequest(
        CREATE_BUSINESS_MUTATION,
        await sessionCookieHeader(REGULAR_USER_ID, "user")
      )
    );

    expect(mockedCreateBusiness).toHaveBeenCalledTimes(2);
    const adminCtx = mockedCreateBusiness.mock.calls[0][2] as {
      user?: { id: string };
    };
    const regularCtx = mockedCreateBusiness.mock.calls[1][2] as {
      user?: { id: string };
    };
    expect(adminCtx.user?.id).toBe("user-admin-1");
    expect(regularCtx.user?.id).toBe("user-regular-1");
  });
});

describe("POST /api/graphql public queries (AC2)", () => {
  it("PublicQuery_NoCookieNoAuthHeader_Returns200WithExpectedData", async () => {
    mockedSearchBusinesses.mockResolvedValue(SEARCH_RESULTS);

    const res = await POST(graphqlRequest(SEARCH_QUERY));

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      data: { searchBusinesses: SEARCH_RESULTS },
    });
    expect(mockedSearchBusinesses).toHaveBeenCalledTimes(1);
  });
});

describe("POST /api/graphql private queries (AC3)", () => {
  const UNAUTHENTICATED_ENVELOPE = {
    data: { createBusiness: null },
    errors: [
      {
        message: "Authentication required",
        extensions: { code: "UNAUTHENTICATED" },
      },
    ],
  };

  it("PrivateMutation_Anonymous_ReturnsUnauthenticatedErrorWithNullData", async () => {
    const res = await POST(graphqlRequest(CREATE_BUSINESS_MUTATION));

    await expect(res.json()).resolves.toEqual(UNAUTHENTICATED_ENVELOPE);
    // Guard short-circuits: the private resolver is never consulted.
    expect(mockedCreateBusiness).not.toHaveBeenCalled();
  });

  it("PrivateMutation_GarbageBearerHeader_ReturnsUnauthenticatedErrorWithNullData", async () => {
    const res = await POST(
      graphqlRequest(CREATE_BUSINESS_MUTATION, {
        authorization: "Bearer not-a-real-token",
      })
    );

    await expect(res.json()).resolves.toEqual(UNAUTHENTICATED_ENVELOPE);
    expect(mockedCreateBusiness).not.toHaveBeenCalled();
  });

  it("PrivateMutation_ValidAdminSession_ReturnsDataNormally", async () => {
    const created = { id: "biz-1", name: "Jazz Cafe", success: true };
    mockedCreateBusiness.mockResolvedValue(created);

    const res = await POST(
      graphqlRequest(
        CREATE_BUSINESS_MUTATION,
        await sessionCookieHeader("user-admin-1", "admin")
      )
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: Record<string, unknown> };
    expect(body.errors).toBeUndefined();
    expect(body.data.createBusiness).toEqual(created);
  });
});

describe("buildGraphQLContext (unit)", () => {
  it("BuildContext_AnonymousRequest_NoUserAndNoFabricatedAuthorization", async () => {
    const ctx = await buildGraphQLContext(graphqlRequest(SEARCH_QUERY));

    expect(ctx.user).toBeNull();
    expect(ctx.headers.authorization).toBeUndefined();
  });

  it("BuildContext_GarbageSessionCookieValue_FailsClosedToNull", async () => {
    const ctx = await buildGraphQLContext(
      graphqlRequest(SEARCH_QUERY, { cookie: "bw-session=not-a-jwt" })
    );

    expect(ctx.user).toBeNull();
  });

  it("BuildContext_CookieSignedWithForeignKey_FailsClosedToNull", async () => {
    // Issue with an unrelated key pair; verification uses this suite's
    // public key, so the signature must be rejected.
    const foreign = generateTestRsaPemPair();
    const savedPrivate = process.env.JWT_PRIVATE_KEY;
    process.env.JWT_PRIVATE_KEY = foreign.privateKey;
    const token = await createSessionToken({ id: "attacker", role: "admin" });
    process.env.JWT_PRIVATE_KEY = savedPrivate;

    const ctx = await buildGraphQLContext(
      graphqlRequest(SEARCH_QUERY, { cookie: `bw-session=${token}` })
    );

    expect(ctx.user).toBeNull();
  });

  it("BuildContext_ValidCookieWithBearerHeader_CarriesClaimsAndRealHeader", async () => {
    const ctx = await buildGraphQLContext(
      graphqlRequest(CREATE_BUSINESS_MUTATION, {
        ...(await sessionCookieHeader("user-admin-1", "admin")),
        authorization: "Bearer real-access-token",
      })
    );

    expect(ctx.user).toEqual({ id: "user-admin-1", role: "admin" });
    expect(ctx.headers.authorization).toBe("Bearer real-access-token");
  });
});
