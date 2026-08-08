/**
 * Scrape Jobs API Route Tests
 */

import { NextRequest } from "next/server";
import { GET } from "./route";

// Mock the job repository
jest.mock("@/lib/db/job-repository", () => ({
  getAllJobs: jest.fn(),
}));

const { getAllJobs } = require("@/lib/db/job-repository");

describe("GET /api/admin/scrape-jobs", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns jobs as JSON array with 200 OK", async () => {
    const mockJobs = [
    {
      id: "1",
      title: "Software Engineer",
      company: "Tech Corp",
      location: "New York, NY",
      description: "Full-stack developer position",
      url: "https://example.com/job1",
      status: "pending",
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      id: "2",
      title: "Data Scientist",
      company: "Data Inc",
      location: "San Francisco, CA",
      description: "ML engineer role",
      url: "https://example.com/job2",
      status: "completed",
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ];

    getAllJobs.mockResolvedValue(mockJobs);

    const request = new NextRequest("http://localhost:3000/api/admin/scrape-jobs");
    const response = await GET(request);

    expect(response.status).toBe(200);

    const body = await response.json();
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBe(2);
    expect(body[0].title).toBe("Software Engineer");
    expect(body[1].company).toBe("Data Inc");
  });

  it("returns empty array when no jobs", async () => {
    getAllJobs.mockResolvedValue([]);

    const request = new NextRequest("http://localhost:3000/api/admin/scrape-jobs");
    const response = await GET(request);

    expect(response.status).toBe(200);

    const body = await response.json();
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBe(0);
  });

  it("returns 500 on error", async () => {
    getAllJobs.mockRejectedValue(new Error("Database connection failed"));

    const request = new NextRequest("http://localhost:3000/api/admin/scrape-jobs");
    const response = await GET(request);

    expect(response.status).toBe(500);

    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body.error).toBe("Internal server error");
  });
});
