/**
 * POST /api/businesses/[id]/view tests
 */

import { NextRequest } from "next/server";
import { getPool } from "@/lib/db/user-repository";
import { POST } from "./route";

jest.mock("@/lib/db/user-repository", () => ({
  getPool: jest.fn(),
}));

const mockedGetPool = jest.mocked(getPool);

const BIZ_ID = "11111111-2222-3333-4444-555555555555";

function mockPoolClient(query: jest.Mock) {
  mockedGetPool.mockReturnValue({
    connect: jest.fn().mockResolvedValue({ query, release: jest.fn() }),
  } as unknown as ReturnType<typeof getPool>);
}

describe("POST /api/businesses/[id]/view", () => {
  it("returns 400 for an invalid business ID", async () => {
    const res = await POST(
      new NextRequest("http://localhost/api/businesses/nope/view"),
      { params: Promise.resolve({ id: "not-a-uuid" }) }
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe("INVALID_ID");
  });

  it("returns 404 when the business does not exist", async () => {
    const query = jest.fn().mockResolvedValue({ rows: [] });
    mockPoolClient(query);

    const res = await POST(
      new NextRequest(`http://localhost/api/businesses/${BIZ_ID}/view`),
      { params: Promise.resolve({ id: BIZ_ID }) }
    );
    expect(res.status).toBe(404);
    expect(query).toHaveBeenCalledTimes(1);
  });

  it("records a view and returns 201", async () => {
    const query = jest.fn()
      .mockResolvedValueOnce({ rows: [{ id: BIZ_ID }] })
      .mockResolvedValueOnce({ rows: [] });
    mockPoolClient(query);

    const res = await POST(
      new NextRequest(`http://localhost/api/businesses/${BIZ_ID}/view`),
      { params: Promise.resolve({ id: BIZ_ID }) }
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(query).toHaveBeenLastCalledWith(
      "INSERT INTO business_views (business_id) VALUES ($1)",
      [BIZ_ID]
    );
  });

  it("returns 500 on database error", async () => {
    const query = jest.fn().mockRejectedValue(new Error("db down"));
    mockPoolClient(query);

    const res = await POST(
      new NextRequest(`http://localhost/api/businesses/${BIZ_ID}/view`),
      { params: Promise.resolve({ id: BIZ_ID }) }
    );
    expect(res.status).toBe(500);
  });
});
