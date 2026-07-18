/**
 * Copyright 2026 Black Owned
 *
 * Test: LOC-0032-AC2 - Docker Compose ClickHouse service with health checks, resource limits, restart policy
 * Validates the docker-compose.yml meets AC requirements
 */

import { describe, it, expect, beforeAll } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';

describe('LOC-0032-AC2 Docker Compose Validation', () => {
  const dockerComposePath = path.join(__dirname, '..', 'docker-compose.yml');
  let config: yaml.Document;

  beforeAll(() => {
    const yamlContent = fs.readFileSync(dockerComposePath, 'utf-8');
    config = yaml.load(yamlContent);
  });

  describe('ClickHouse service existence', () => {
    it('should have a clickhouse service defined', () => {
      const typedConfig = config as yaml.Document & { services: Record<string, unknown> };
      expect(typedConfig.services).toBeDefined();
      expect(typedConfig.services).toHaveProperty('clickhouse');
    });
  });

  describe('ClickHouse image', () => {
    it('should use clickhouse/clickhouse-server image', () => {
      const typedConfig = config as yaml.Document & { services: { clickhouse: { image: string } } };
      expect(typedConfig.services.clickhouse.image).toMatch(/clickhouse\/clickhouse-server/);
    });
  });

  describe('Health check configuration', () => {
    it('should have healthcheck defined', () => {
      const typedConfig = config as yaml.Document & { services: { clickhouse: { healthcheck: unknown } } };
      expect(typedConfig.services.clickhouse.healthcheck).toBeDefined();
    });

    it('should have healthcheck test command', () => {
      const typedConfig = config as yaml.Document & { services: { clickhouse: { healthcheck: { test: unknown } } } };
      const testCmd = typedConfig.services.clickhouse.healthcheck.test as string[];
      expect(Array.isArray(testCmd)).toBe(true);
      expect(testCmd).toContain('wget');
      expect(testCmd).toContain('http://localhost:8123/ping');
    });

    it('should have healthcheck interval of 10s', () => {
      const typedConfig = config as yaml.Document & { services: { clickhouse: { healthcheck: { interval: string } } } };
      expect(typedConfig.services.clickhouse.healthcheck.interval).toBe('10s');
    });

    it('should have healthcheck timeout of 5s', () => {
      const typedConfig = config as yaml.Document & { services: { clickhouse: { healthcheck: { timeout: string } } } };
      expect(typedConfig.services.clickhouse.healthcheck.timeout).toBe('5s');
    });

    it('should have healthcheck retries of at least 3', () => {
      const typedConfig = config as yaml.Document & { services: { clickhouse: { healthcheck: { retries: number } } } };
      expect(typedConfig.services.clickhouse.healthcheck.retries).toBeGreaterThanOrEqual(3);
    });

    it('should have healthcheck start_period for initial startup', () => {
      const typedConfig = config as yaml.Document & { services: { clickhouse: { healthcheck: { start_period: string } } } };
      expect(typedConfig.services.clickhouse.healthcheck.start_period).toBeDefined();
    });
  });

  describe('Memory limit configuration', () => {
    it('should have mem_limit set to 4g', () => {
      const typedConfig = config as yaml.Document & { services: { clickhouse: { mem_limit: string | number } } };
      const memLimit = typedConfig.services.clickhouse.mem_limit;
      // Accept both string "4g" and numeric value (4 * 1024 * 1024 * 1024)
      if (typeof memLimit === 'string') {
        expect(memLimit).toBe('4g');
      } else if (typeof memLimit === 'number') {
        expect(memLimit).toBe(4 * 1024 * 1024 * 1024);
      }
    });

    it('should have memswap_limit to prevent swap usage', () => {
      const typedConfig = config as yaml.Document & { services: { clickhouse: { memswap_limit: string | number } } };
      expect(typedConfig.services.clickhouse.memswap_limit).toBeDefined();
    });
  });

  describe('Restart policy', () => {
    it('should have restart policy set to unless-stopped', () => {
      const typedConfig = config as yaml.Document & { services: { clickhouse: { restart: string } } };
      expect(typedConfig.services.clickhouse.restart).toBe('unless-stopped');
    });
  });

  describe('Port configuration', () => {
    it('should expose HTTP port 8123', () => {
      const typedConfig = config as yaml.Document & { services: { clickhouse: { ports: string[] } } };
      const ports = typedConfig.services.clickhouse.ports;
      expect(ports).toContain('8123:8123');
    });

    it('should expose native port 9000', () => {
      const typedConfig = config as yaml.Document & { services: { clickhouse: { ports: string[] } } };
      const ports = typedConfig.services.clickhouse.ports;
      expect(ports).toContain('9000:9000');
    });
  });

  describe('Volume configuration', () => {
    it('should have clickhouse-data volume defined', () => {
      const typedConfig = config as yaml.Document & { volumes: Record<string, unknown> };
      expect(typedConfig.volumes).toBeDefined();
      expect(typedConfig.volumes).toHaveProperty('clickhouse-data');
    });

    it('should mount data volume to container', () => {
      const typedConfig = config as yaml.Document & { services: { clickhouse: { volumes: string[] } } };
      const volumes = typedConfig.services.clickhouse.volumes;
      expect(volumes).toContainEqual(expect.stringContaining('clickhouse-data:/var/lib/clickhouse'));
    });
  });

  describe('Container name', () => {
    it('should have a consistent container name', () => {
      const typedConfig = config as yaml.Document & { services: { clickhouse: { container_name: string } } };
      expect(typedConfig.services.clickhouse.container_name).toBeDefined();
      expect(typedConfig.services.clickhouse.container_name).toContain('clickhouse');
    });
  });
});
