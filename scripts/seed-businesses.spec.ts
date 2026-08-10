/**
 * Seed Businesses Script Tests
 *
 * Verifies that the seed script respects foreign key constraints
 * and produces valid data with no constraint violations.
 */

import { describe, it, expect, jest, beforeEach, afterEach } from "@jest/globals";

// Mock all dependencies before importing
jest.mock("../src/utils/business-seeder", () => ({
  seedBusinesses: jest.fn(),
  countTestBusinesses: jest.fn(),
  printCategoryDistribution: jest.fn(),
}));

jest.mock("../src/lib/db/business-repository", () => ({
  initializeBusinessSchema: jest.fn(),
  getTableName: jest.fn(() => "businesses"),
}));

jest.mock("../src/lib/db/user-repository", () => ({
  initializeUserSchema: jest.fn(),
  findByEmail: jest.fn(),
  create: jest.fn(),
}));

jest.mock("../src/lib/auth/auth-service", () => ({
  hashPassword: jest.fn(() => Promise.resolve("mock-hash")),
}));

// Mock pg Pool
const mockPoolConnect = jest.fn();
const mockPoolEnd = jest.fn();

jest.mock("pg", () => ({
  Pool: jest.fn(() => ({
    connect: mockPoolConnect,
    end: mockPoolEnd,
  })),
}));

import { seedBusinessesScript } from "./seed-businesses";
import * as businessSeeder from "../src/utils/business-seeder";
import * as businessRepo from "../src/lib/db/business-repository";
import * as userRepo from "../src/lib/db/user-repository";
import { Pool } from "pg";

describe("Seed Businesses Script - Foreign Key Constraints", () => {
  const mockClient = {
    query: jest.fn(),
    release: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();

    // Reset mock implementations
    mockPoolConnect.mockReturnValue(mockClient);
    mockPoolEnd.mockResolvedValue(undefined);

    // Mock findByEmail to return null (user doesn't exist)
    (userRepo.findByEmail as jest.Mock).mockResolvedValue(null);

    // Mock create user
    (userRepo.create as jest.Mock).mockResolvedValue({
      id: "test-user-uuid",
      email: "bws-test-seeder@bws-test.com",
    });

    // Mock countTestBusinesses
    (businessSeeder.countTestBusinesses as jest.Mock).mockResolvedValue(0);

    // Mock seedBusinesses
    (businessSeeder.seedBusinesses as jest.Mock).mockResolvedValue({
      created: 20,
      skipped: 0,
      total: 20,
    });

    // Mock getTableName
    (businessRepo.getTableName as jest.Mock).mockReturnValue("businesses");
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("verifies foreign key integrity after seeding", async () => {
    // Mock the FK check query to return 0 violations
    mockClient.query.mockImplementation((query: string) => {
      if (query.includes("SELECT COUNT(*) as violation_count")) {
        return Promise.resolve({ rows: [{ violation_count: "0" }] });
      }
      return Promise.resolve({ rows: [] });
    });

    // Capture console output
    const consoleSpy = jest.spyOn(console, "log").mockImplementation();

    await seedBusinessesScript();

    // Verify FK check query was executed
    expect(mockClient.query).toHaveBeenCalledWith(
      expect.stringContaining("SELECT COUNT(*) as violation_count")
    );
    expect(mockClient.query).toHaveBeenCalledWith(
      expect.stringContaining("FROM businesses b")
    );
    expect(mockClient.query).toHaveBeenCalledWith(
      expect.stringContaining("WHERE NOT EXISTS (SELECT 1 FROM users u WHERE u.id = b.owner_id)")
    );

    consoleSpy.mockRestore();
  });

  it("fails when foreign key violations are detected", async () => {
    // Mock the FK check query to return violations
    mockClient.query.mockImplementation((query: string) => {
      if (query.includes("SELECT COUNT(*) as violation_count")) {
        return Promise.resolve({ rows: [{ violation_count: "3" }] });
      }
      return Promise.resolve({ rows: [] });
    });

    // Mock process.exit
    const exitSpy = jest.spyOn(process, "exit").mockImplementation((() => {
      throw new Error("process.exit called");
    }) as unknown as () => never);

    const consoleSpy = jest.spyOn(console, "log").mockImplementation();
    const errorSpy = jest.spyOn(console, "error").mockImplementation();

    // Should throw because process.exit is called
    await expect(seedBusinessesScript()).rejects.toThrow("process.exit called");

    // Verify violation was logged
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("Found 3 foreign key violations"));

    consoleSpy.mockRestore();
    errorSpy.mockRestore();
    exitSpy.mockRestore();
  });

  it("passes when no foreign key violations exist", async () => {
    // Mock the FK check query to return 0 violations
    mockClient.query.mockImplementation((query: string) => {
      if (query.includes("SELECT COUNT(*) as violation_count")) {
        return Promise.resolve({ rows: [{ violation_count: "0" }] });
      }
      return Promise.resolve({ rows: [] });
    });

    const consoleSpy = jest.spyOn(console, "log").mockImplementation();

    await seedBusinessesScript();

    // Verify success message was logged
    expect(consoleSpy).toHaveBeenCalledWith("[PASS] All foreign key relationships are valid");

    consoleSpy.mockRestore();
  });

  it("uses correct table name from getTableName", async () => {
    // Set up schema in environment
    process.env.POSTGRES_SCHEMA = "public";

    (businessRepo.getTableName as jest.Mock).mockReturnValue("public.businesses");

    mockClient.query.mockImplementation((query: string) => {
      if (query.includes("SELECT COUNT(*) as violation_count")) {
        return Promise.resolve({ rows: [{ violation_count: "0" }] });
      }
      return Promise.resolve({ rows: [] });
    });

    const consoleSpy = jest.spyOn(console, "log").mockImplementation();

    await seedBusinessesScript();

    // Verify the query uses the correct table name
    expect(mockClient.query).toHaveBeenCalledWith(
      expect.stringContaining("FROM public.businesses b")
    );

    consoleSpy.mockRestore();
    delete process.env.POSTGRES_SCHEMA;
  });
});
