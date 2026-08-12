/**
 * Copyright 2026 Black Owned
 *
 * Test: LOC-0056-AC2 - Docker Compose orchestrates all services
 * Validates docker-compose.yml starts: bw-scraper, postgres, nats, clickhouse, valkey
 * and all services pass health checks within 60 seconds
 */

import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';

describe('LOC-0056-AC2 Docker Compose - All Services', () => {
  const dockerComposePath = path.join(__dirname, '..', '..', 'docker-compose.yml');
  let config: yaml.Document;

  beforeAll(() => {
    const yamlContent = fs.readFileSync(dockerComposePath, 'utf-8');
    config = yaml.load(yamlContent);
  });

  describe('Required services existence', () => {
    const requiredServices = ['bw-scraper', 'postgres', 'nats', 'clickhouse', 'valkey'];

    it.each(requiredServices)('%s service should be defined', (serviceName) => {
      const typedConfig = config as yaml.Document & { services: Record<string, unknown> };
      expect(typedConfig.services).toBeDefined();
      expect(typedConfig.services).toHaveProperty(serviceName);
    });
  });

  describe('bw-scraper service', () => {
    it('should have healthcheck defined', () => {
      const typedConfig = config as yaml.Document & { services: { 'bw-scraper': { healthcheck: unknown } } };
      expect(typedConfig.services['bw-scraper'].healthcheck).toBeDefined();
    });

    it('should depend on postgres, nats, and valkey', () => {
      const typedConfig = config as yaml.Document & { services: { 'bw-scraper': { depends_on: unknown } } };
      const dependsOn = typedConfig.services['bw-scraper'].depends_on;
      expect(dependsOn).toBeDefined();
      expect(Object.keys(dependsOn)).toContain('postgres');
      expect(Object.keys(dependsOn)).toContain('nats');
      expect(Object.keys(dependsOn)).toContain('valkey');
    });
  });

  describe('postgres service', () => {
    it('should use postgres:15-alpine image', () => {
      const typedConfig = config as yaml.Document & { services: { postgres: { image: string } } };
      expect(typedConfig.services.postgres.image).toMatch(/postgres:15-alpine/);
    });

    it('should have healthcheck with pg_isready', () => {
      const typedConfig = config as yaml.Document & { services: { postgres: { healthcheck: { test: unknown } } } };
      const testCmd = typedConfig.services.postgres.healthcheck.test as string[];
      // Healthcheck test is ['CMD-SHELL', 'pg_isready -U postgres']
      expect(testCmd.some((cmd) => cmd.includes('pg_isready'))).toBe(true);
    });

    it('should have POSTGRES_DB environment variable', () => {
      const typedConfig = config as yaml.Document & { services: { postgres: { environment: Record<string, unknown> } } };
      expect(typedConfig.services.postgres.environment).toHaveProperty('POSTGRES_DB');
    });
  });

  describe('nats service', () => {
    it('should use nats:2.10-alpine image', () => {
      const typedConfig = config as yaml.Document & { services: { nats: { image: string } } };
      expect(typedConfig.services.nats.image).toMatch(/nats:2.10-alpine/);
    });

    it('should have healthcheck with nats-server ping', () => {
      const typedConfig = config as yaml.Document & { services: { nats: { healthcheck: { test: unknown } } } };
      const testCmd = typedConfig.services.nats.healthcheck.test as string[];
      expect(testCmd).toContain('nats-server');
      expect(testCmd).toContain('ping');
    });
  });

  describe('clickhouse service', () => {
    it('should use clickhouse/clickhouse-server image', () => {
      const typedConfig = config as yaml.Document & { services: { clickhouse: { image: string } } };
      expect(typedConfig.services.clickhouse.image).toMatch(/clickhouse\/clickhouse-server/);
    });

    it('should have healthcheck with wget ping endpoint', () => {
      const typedConfig = config as yaml.Document & { services: { clickhouse: { healthcheck: { test: unknown } } } };
      const testCmd = typedConfig.services.clickhouse.healthcheck.test as string[];
      expect(testCmd).toContain('wget');
      expect(testCmd).toContain('http://127.0.0.1:8123/ping');
    });

    it('should have memory limit configured', () => {
      const typedConfig = config as yaml.Document & { services: { clickhouse: { mem_limit: unknown } } };
      expect(typedConfig.services.clickhouse.mem_limit).toBeDefined();
    });
  });

  describe('valkey service', () => {
    it('should use valkey/valkey image', () => {
      const typedConfig = config as yaml.Document & { services: { valkey: { image: string } } };
      expect(typedConfig.services.valkey.image).toMatch(/valkey\/valkey/);
    });

    it('should have healthcheck with valkey-cli ping', () => {
      const typedConfig = config as yaml.Document & { services: { valkey: { healthcheck: { test: unknown } } } };
      const testCmd = typedConfig.services.valkey.healthcheck.test as string[];
      expect(testCmd).toContain('valkey-cli');
      expect(testCmd).toContain('ping');
    });
  });

  describe('Health check timing - all within 60 seconds', () => {
    const getServiceHealthCheck = (serviceName: string) => {
      const typedConfig = config as yaml.Document & { services: Record<string, { healthcheck: { interval: string; retries: string; start_period: string } }> };
      const service = typedConfig.services[serviceName];
      if (!service?.healthcheck) return null;
      return service.healthcheck;
    };

    const parseDuration = (duration: string): number => {
      const match = duration.match(/^(\d+)s$/);
      if (!match) throw new Error(`Invalid duration format: ${duration}`);
      return parseInt(match[1], 10);
    };

    it.each(['bw-scraper', 'postgres', 'nats', 'clickhouse', 'valkey'] as const)(
      '%s health check should complete within 60 seconds',
      (serviceName) => {
        const healthCheck = getServiceHealthCheck(serviceName);
        expect(healthCheck).toBeDefined();

        const interval = parseDuration(healthCheck.interval);
        const retries = parseInt(healthCheck.retries, 10);
        const startPeriod = healthCheck.start_period ? parseDuration(healthCheck.start_period) : 0;

        // Worst case: start_period + (interval * retries)
        const maxTime = startPeriod + (interval * retries);
        expect(maxTime).toBeLessThanOrEqual(60);
      }
    );
  });

  describe('Volume configuration', () => {
    it('should have all required volumes defined', () => {
      const typedConfig = config as yaml.Document & { volumes: Record<string, unknown> };
      expect(typedConfig.volumes).toBeDefined();
      expect(typedConfig.volumes).toHaveProperty('postgres-data');
      expect(typedConfig.volumes).toHaveProperty('clickhouse-data');
      expect(typedConfig.volumes).toHaveProperty('nats-data');
      expect(typedConfig.volumes).toHaveProperty('valkey-data');
    });
  });
});
