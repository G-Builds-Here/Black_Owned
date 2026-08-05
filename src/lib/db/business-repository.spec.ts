/**
 * Business Repository Unit Tests
 */

import { getPool } from "./user-repository";
import { hashPassword } from "../auth/auth-service";
import { initializeBusinessSchema, createBusiness, findBusinessById, findBusinessesByOwnerId, normalizePhoneNumber } from "./business-repository";

describe("Business Repository", () => {
  const testEmailPrefix = `bizrepo-${Date.now()}`;

  async function createTestUser(): Promise<{ id: string; email: string }> {
    const client = await getPool().connect();
    try {
      const email = `${testEmailPrefix}-${Math.random().toString(36).substring(7)}@example.com`;
      const passwordHash = await hashPassword("TestPass123!");
      const result = await client.query(
        "INSERT INTO users (email, password_hash, name) VALUES ($1, $2, $3) RETURNING id, email",
        [email, passwordHash, "Test User"]
      );
      return { id: result.rows[0].id, email: result.rows[0].email };
    } finally {
      client.release();
    }
  }

  async function cleanupUser(email: string): Promise<void> {
    const client = await getPool().connect();
    try {
      await client.query("DELETE FROM users WHERE email = $1", [email]);
    } finally {
      client.release();
    }
  }

  async function cleanupBusinesses(ownerId: string): Promise<void> {
    const client = await getPool().connect();
    try {
      await client.query("DELETE FROM businesses WHERE owner_id = $1", [ownerId]);
    } finally {
      client.release();
    }
  }

  describe("createBusiness", () => {
    it("creates a business with unverified status", async () => {
      const user = await createTestUser();

      try {
        const client = await getPool().connect();
        try {
          await initializeBusinessSchema(client);
          const business = await createBusiness(client, user.id, "Test Business", "Test description", "cat-1");

          expect(business.id).toBeDefined();
          expect(business.ownerId).toBe(user.id);
          expect(business.name).toBe("Test Business");
          expect(business.description).toBe("Test description");
          expect(business.categoryId).toBe("cat-1");
          expect(business.verificationStatus).toBe("unverified");
          expect(business.createdAt).toBeInstanceOf(Date);
          expect(business.updatedAt).toBeInstanceOf(Date);
        } finally {
          client.release();
        }
      } finally {
        await cleanupUser(user.email);
      }
    });

    it("creates a business without description", async () => {
      const user = await createTestUser();

      try {
        const client = await getPool().connect();
        try {
          await initializeBusinessSchema(client);
          const business = await createBusiness(client, user.id, "Test Business No Desc", undefined, "cat-2");

          expect(business.name).toBe("Test Business No Desc");
          expect(business.description).toBeUndefined();
        } finally {
          client.release();
        }
      } finally {
        await cleanupUser(user.email);
      }
    });
  });

  describe("findBusinessById", () => {
    it("finds a business by ID", async () => {
      const user = await createTestUser();

      try {
        const client = await getPool().connect();
        try {
          await initializeBusinessSchema(client);
          const business = await createBusiness(client, user.id, "Find Test Business", "Desc", "cat-3");
          const found = await findBusinessById(client, business.id);

          expect(found).toBeDefined();
          expect(found?.id).toBe(business.id);
          expect(found?.name).toBe("Find Test Business");
        } finally {
          client.release();
        }
      } finally {
        await cleanupUser(user.email);
      }
    });

    it("returns undefined for non-existent business", async () => {
      const client = await getPool().connect();
      try {
        const result = await findBusinessById(client, "00000000-0000-0000-0000-000000000000");
        expect(result).toBeUndefined();
      } finally {
        client.release();
      }
    });
  });

  describe("findBusinessesByOwnerId", () => {
    it("finds all businesses for a user", async () => {
      const user = await createTestUser();

      try {
        const client = await getPool().connect();
        try {
          await initializeBusinessSchema(client);
          await createBusiness(client, user.id, "Business 1", "Desc 1", "cat-1");
          await createBusiness(client, user.id, "Business 2", "Desc 2", "cat-2");

          const businesses = await findBusinessesByOwnerId(client, user.id);

          expect(businesses.length).toBe(2);
          expect(businesses.map((b) => b.name)).toEqual(expect.arrayContaining(["Business 1", "Business 2"]));
        } finally {
          client.release();
        }
      } finally {
        await cleanupUser(user.email);
      }
    });

    it("returns empty array when user has no businesses", async () => {
      const user = await createTestUser();

      try {
        const client = await getPool().connect();
        try {
          const businesses = await findBusinessesByOwnerId(client, user.id);
          expect(businesses.length).toBe(0);
        } finally {
          client.release();
        }
      } finally {
        await cleanupUser(user.email);
      }
    });
  });
});

describe("normalizePhoneNumber", () => {
  it("removes parentheses and dashes", () => {
    expect(normalizePhoneNumber("(555) 123-4567")).toBe("5551234567");
  });

  it("removes spaces", () => {
    expect(normalizePhoneNumber("555 123 4567")).toBe("5551234567");
  });

  it("handles country code", () => {
    // Strips leading "1" for 11-digit US numbers to enable exact matching
    expect(normalizePhoneNumber("+1-555-123-4567")).toBe("5551234567");
  });

  it("handles plain digits", () => {
    expect(normalizePhoneNumber("5551234567")).toBe("5551234567");
  });

  it("trims whitespace", () => {
    expect(normalizePhoneNumber("  (555) 123-4567  ")).toBe("5551234567");
  });

  it("handles dots as separator", () => {
    expect(normalizePhoneNumber("555.123.4567")).toBe("5551234567");
  });

  it("returns empty string for empty input", () => {
    expect(normalizePhoneNumber("")).toBe("");
  });

  it("returns empty string for whitespace only", () => {
    expect(normalizePhoneNumber("   ")).toBe("");
  });
});
