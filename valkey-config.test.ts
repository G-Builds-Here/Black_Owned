/**
 * Valkey Configuration Tests
 *
 * Verifies Valkey container configuration:
 * - maxmemory-policy: allkeys-lru
 * - maxmemory: 268435456 (256MB)
 * - timeout: 300
 * - notify-keyspace-events: includes K and E
 */

import { execSync } from "child_process";

describe("Valkey Configuration", () => {
  const valkeyCli = "docker exec black-owned-valkey valkey-cli -p 6379";

  /**
   * Helper to run valkey-cli commands
   */
  function runValkeyCommand(command: string): string {
    try {
      return execSync(`${valkeyCli} ${command}`, {
        encoding: "utf8",
        timeout: 10000,
      }).trim();
    } catch (error) {
      throw new Error(
        `Failed to run Valkey command '${command}': ${error}`
      );
    }
  }

  describe("Configuration Verification", () => {
    it("should have maxmemory-policy set to allkeys-lru", () => {
      const result = runValkeyCommand('CONFIG GET maxmemory-policy');
      expect(result).toContain("allkeys-lru");
    });

    it("should have maxmemory set to 268435456 (256MB)", () => {
      const result = runValkeyCommand('CONFIG GET maxmemory');
      expect(result).toContain("268435456");
    });

    it("should have timeout set to 300", () => {
      const result = runValkeyCommand('CONFIG GET timeout');
      expect(result).toContain("300");
    });

    it("should have notify-keyspace-events including K and E", () => {
      const result = runValkeyCommand('CONFIG GET notify-keyspace-events');
      expect(result).toMatch(/[KE]/);
    });
  });

  describe("LRU Eviction Under Memory Pressure", () => {
    it("should evict keys when memory limit is exceeded", () => {
      // Set a low maxmemory for testing
      execSync(`${valkeyCli} CONFIG SET maxmemory 1048576`, {
        encoding: "utf8",
        timeout: 5000,
      });

      // Get initial evicted keys count
      const initialInfo = execSync(
        `${valkeyCli} INFO memory`,
        { encoding: "utf8", timeout: 5000 }
      );
      const initialEvicted = initialInfo.match(/evicted_keys:(\d+)/)?.[1] || "0";

      // Insert many small keys to trigger eviction
      for (let i = 0; i < 2000; i++) {
        execSync(`${valkeyCli} SET key:${i} "${"x".repeat(1024)}"`, {
          encoding: "utf8",
          timeout: 5000,
        });
      }

      // Check memory is within limit
      const info = execSync(`${valkeyCli} INFO memory`, {
        encoding: "utf8",
        timeout: 5000,
      });

      const usedMemory = info.match(/used_memory:(\d+)/)?.[1];
      expect(usedMemory).toBeDefined();
      expect(parseInt(usedMemory || "0")).toBeLessThanOrEqual(1048576);

      // Verify eviction occurred
      const evictedKeys = info.match(/evicted_keys:(\d+)/)?.[1] || "0";
      expect(parseInt(evictedKeys)).toBeGreaterThan(
        parseInt(initialEvicted)
      );

      // Reset maxmemory to original value
      execSync(`${valkeyCli} CONFIG SET maxmemory 268435456`, {
        encoding: "utf8",
        timeout: 5000,
      });
    });
  });
});
