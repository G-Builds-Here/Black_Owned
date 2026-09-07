/**
 * GET /api/categories tests
 */

import { NextRequest } from "next/server";
import { getPool } from "@/lib/db/user-repository";
import { GET } from "./route";

jest.mock("@/lib/db/user-repository", () => ({
  getPool: jest.fn(),
}));

const mockedGetPool = jest.mocked(getPool);

function mockPoolClient(query: jest.Mock) {
  mockedGetPool.mockReturnValue({
    connect: jest.fn().mockResolvedValue({ query, release: jest.fn() }),
  } as unknown as ReturnType<typeof getPool>);
}

describe("GET /api/categories", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns categories ordered by name", async () => {
    const query = jest.fn().mockResolvedValue({
      rows: [
        { id: "ac15cb07-0000-4000-8000-000000000001", name: "Retail & Fashion" },
        { id: "c7e04c6a-0000-4000-8000-000000000002", name: "Food & Dining" },
      ],
    });
    mockPoolClient(query);

    const res = await GET(new NextRequest("http://localhost/api/categories"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.categories).toHaveLength(2);
    expect(query).toHaveBeenCalledWith(expect.stringContaining("ORDER BY name"));
  });

  it("returns an empty list when there are no categories", async () => {
    mockPoolClient(jest.fn().mockResolvedValue({ rows: [] }));

    const res = await GET(new NextRequest("http://localhost/api/categories"));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.data.categories).toEqual([]);
  });

  it("returns 500 on database error", async () => {
    mockPoolClient(jest.fn().mockRejectedValue(new Error("db down")));

    const res = await GET(new NextRequest("http://localhost/api/categories"));
    expect(res.status).toBe(500);
  });
});
