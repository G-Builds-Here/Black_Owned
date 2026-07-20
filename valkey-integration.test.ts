/**
 * Valkey Integration Tests
 *
 * Tests Valkey connectivity and configuration using ioredis.
 * Run with: docker compose up -d && npm test -- valkey-integration
 */

import { execSync } from "child_process";

// Dynamically import ioredis only if available
let Redis: typeof import("ioredis").Redis | null = null;

async function getRedisClient() {
  if (!Redis) {
    try {
      const ioredis = await import("ioredis");
      Redis = ioredis.Redis;
    } catch {
      throw new Error("ioredis not installed. Run: npm install ioredis");
    }
  }
  return new Redis({ host: "localhost", port: 6379, lazyConnect: true });
}

describe("Valkey Integration", () => {
  let redis: import("ioredis").Redis | null = null;

  beforeAll(async () => {
    // Ensure container is running
    try {
      execSync("docker compose up -d valkey", {
        encoding: "utf8",
        timeout: 30000,
      });
      // Wait for container to be ready
      for (let i = 0; i < 30; i++) {
        try {
          execSync(
            "docker exec black-owned-valkey valkey-cli ping",
            { encoding: "utf8", timeout: 2000 }
          );
          break;
        } catch {
          await new Promise((r) => setTimeout(r, 1000));
        }
      }
    } catch (error) {
      console.warn("Valkey container not available. Skipping integration tests.");
      return;
    }

    redis = await getRedisClient();
    await redis.connect();
  }, 30000);

  afterAll(async () => {
    if (redis) {
      await redis.quit();
    }
  });

  describe("Configuration", () => {
    it("should have maxmemory-policy set to allkeys-lru", async () => {
      if (!redis) return;
      const result = await redis.config("GET", "maxmemory-policy");
      expect(result[1]).toBe("allkeys-lru");
    });

    it("should have maxmemory set to 268435456", async () => {
      if (!redis) return;
      const result = await redis.config("GET", "maxmemory");
      expect(parseInt(result[1])).toBe(268435456);
    });

    it("should have timeout set to 300", async () => {
      if (!redis) return;
      const result = await redis.config("GET", "timeout");
      expect(parseInt(result[1])).toBe(300);
    });

    it("should have notify-keyspace-events with K and E", async () => {
      if (!redis) return;
      const result = await redis.config("GET", "notify-keyspace-events");
      const events = result[1];
      expect(events).toContain("K");
      expect(events).toContain("E");
    });
  });

  describe("LRU Eviction", () => {
    it("should evict keys under memory pressure", async () => {
      if (!redis) return;

      // Set low memory limit for test
      await redis.config("SET", "maxmemory", "1048576");

      // Get initial eviction count
      const initialInfo = await redis.info("memory");
      const initialEvicted =
        initialInfo.match(/evicted_keys:(\d+)/)?.[1] || "0";

      // Insert keys to trigger eviction
      for (let i = 0; i < 2000; i++) {
        await redis.set(`test:key:${i}`, "x".repeat(1024));
      }

      // Check memory is within limit
      const info = await redis.info("memory");
      const usedMemory = parseInt(
        info.match(/used_memory:(\d+)/)?.[1] || "0"
      );
      expect(usedMemory).toBeLessThanOrEqual(1048576);

      // Verify eviction occurred
      const evictedKeys = parseInt(
        info.match(/evicted_keys:(\d+)/)?.[1] || "0"
      );
      expect(evictedKeys).toBeGreaterThan(parseInt(initialEvicted));

      // Reset memory limit
      await redis.config("SET", "maxmemory", "268435456");
    });
  });
});
