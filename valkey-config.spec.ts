/**
 * Valkey Configuration Unit Tests
 *
 * Validates docker-compose.yml configuration without requiring a running container.
 * Run with: npm test -- valkey-config.spec
 */

import { readFileSync } from "fs";
import { join } from "path";
import yaml from "js-yaml";

describe("Valkey Docker Compose Configuration", () => {
  let config: any;

  beforeAll(() => {
    const composePath = join(__dirname, "docker-compose.yml");
    const content = readFileSync(composePath, "utf8");
    config = yaml.load(content) as any;
  });

  describe("Service Configuration", () => {
    it("should define a valkey service", () => {
      expect(config.services).toBeDefined();
      expect(config.services.valkey).toBeDefined();
    });

    it("should use Valkey 7.2+ image", () => {
      const image = config.services.valkey.image;
      expect(image).toMatch(/^valkey\/valkey:7\./);
    });

    it("should configure maxmemory-policy as allkeys-lru", () => {
      const args = config.services.valkey.command;
      const maxmemoryPolicyIndex = args.indexOf("--maxmemory-policy");
      expect(maxmemoryPolicyIndex).toBeGreaterThanOrEqual(0);
      expect(args[maxmemoryPolicyIndex + 1]).toBe("allkeys-lru");
    });

    it("should configure maxmemory as 268435456 (256MB)", () => {
      const args = config.services.valkey.command;
      const maxmemoryIndex = args.indexOf("--maxmemory");
      expect(maxmemoryIndex).toBeGreaterThanOrEqual(0);
      expect(args[maxmemoryIndex + 1]).toBe("268435456");
    });

    it("should configure timeout as 300", () => {
      const args = config.services.valkey.command;
      const timeoutIndex = args.indexOf("--timeout");
      expect(timeoutIndex).toBeGreaterThanOrEqual(0);
      expect(args[timeoutIndex + 1]).toBe("300");
    });

    it("should configure notify-keyspace-events with K and E", () => {
      const args = config.services.valkey.command;
      const notifyIndex = args.indexOf("--notify-keyspace-events");
      expect(notifyIndex).toBeGreaterThanOrEqual(0);
      const events = args[notifyIndex + 1];
      expect(events).toContain("K");
      expect(events).toContain("E");
    });

    it("should expose port 6379", () => {
      expect(config.services.valkey.ports).toContainEqual("6379:6379");
    });

    it("should have a healthcheck configured", () => {
      expect(config.services.valkey.healthcheck).toBeDefined();
      expect(config.services.valkey.healthcheck.test).toContain("ping");
    });

    it("should have a data volume for persistence", () => {
      expect(config.services.valkey.volumes).toContainEqual(
        expect.stringContaining("/data")
      );
      expect(config.volumes).toBeDefined();
      expect(config.volumes["valkey-data"]).toBeDefined();
    });
  });
});
