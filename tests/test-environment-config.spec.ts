/**
 * LOC-0056-AC4: Environment configuration via .env
 * QA Tests for service connectivity and environment variable validation
 */

import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { parse as parseYAML } from 'yaml';

const REPO_ROOT = join(__dirname, '..', '..');
const ENV_FILE = join(REPO_ROOT, '.env');
const ENV_EXAMPLE_FILE = join(REPO_ROOT, '.env.example');
const COMPOSE_FILE = join(REPO_ROOT, 'docker-compose.yml');

/**
 * Test: .env file exists with required configuration variables
 */
describe('LOC-0056-AC4: Environment Configuration', () => {
  describe('.env file validation', () => {
    test('.env file exists at repository root', () => {
      const exists = existsSync(ENV_FILE);
      expect(exists).toBe(true);
    });

    test('.env.example file exists for documentation', () => {
      const exists = existsSync(ENV_EXAMPLE_FILE);
      expect(exists).toBe(true);
    });

    test('.env file contains PostgreSQL configuration', () => {
      const content = readFileSync(ENV_FILE, 'utf-8');
      expect(content).toContain('POSTGRES_HOST');
      expect(content).toContain('POSTGRES_PORT');
      expect(content).toContain('POSTGRES_DB');
      expect(content).toContain('POSTGRES_USER');
      expect(content).toContain('POSTGRES_PASSWORD');
    });

    test('.env file contains NATS configuration', () => {
      const content = readFileSync(ENV_FILE, 'utf-8');
      expect(content).toContain('NATS_HOST');
      expect(content).toContain('NATS_CLIENT_PORT');
    });

    test('.env file contains ClickHouse configuration', () => {
      const content = readFileSync(ENV_FILE, 'utf-8');
      expect(content).toContain('CLICKHOUSE_HOST');
      expect(content).toContain('CLICKHOUSE_PORT');
      expect(content).toContain('CLICKHOUSE_HTTP_PORT');
      expect(content).toContain('CLICKHOUSE_TCP_PORT');
    });

    test('.env file contains Valkey/Redis configuration', () => {
      const content = readFileSync(ENV_FILE, 'utf-8');
      expect(content).toContain('VALKEY_HOST');
      expect(content).toContain('VALKEY_PORT');
    });

    test('.env file contains DATABASE_URL for service connections', () => {
      const content = readFileSync(ENV_FILE, 'utf-8');
      expect(content).toContain('DATABASE_URL');
    });
  });

  describe('docker-compose.yml security validation', () => {
    let composeContent: string;
    let composeConfig: any;

    beforeAll(() => {
      composeContent = readFileSync(COMPOSE_FILE, 'utf-8');
      composeConfig = parseYAML(composeContent);
    });

    test('docker-compose.yml does not contain hardcoded PostgreSQL password', () => {
      // Check that POSTGRES_PASSWORD is not hardcoded in the compose file
      const passwordPattern = /POSTGRES_PASSWORD:\s*[^\$\{]/;
      const match = composeContent.match(passwordPattern);
      expect(match).toBeNull();
    });

    test('docker-compose.yml does not contain hardcoded DATABASE_URL with credentials', () => {
      // Check that DATABASE_URL does not contain embedded passwords
      const urlPattern = /DATABASE_URL:\s*["']?postgresql:\/\/[^:]+:[^@]+@/;
      const match = composeContent.match(urlPattern);
      expect(match).toBeNull();
    });

    test('docker-compose.yml does not contain hardcoded JWT_SECRET', () => {
      const secretPattern = /JWT_SECRET:\s*[^\$\{][^"\n]{8,}/;
      const match = composeContent.match(secretPattern);
      expect(match).toBeNull();
    });

    test('docker-compose.yml uses environment variable references', () => {
      // Verify that sensitive values use ${VAR} or $VAR syntax
      const envVarPattern = /\$\{?[A-Z_]+(?:_[A-Z_]+)*\}?/;
      expect(envVarPattern.test(composeContent)).toBe(true);
    });

    test('docker-compose.yml services are defined', () => {
      expect(composeConfig).toBeDefined();
      expect(composeConfig.services).toBeDefined();
      expect(Object.keys(composeConfig.services).length).toBeGreaterThan(0);
    });

    test('docker-compose.yml contains expected services', () => {
      const services = Object.keys(composeConfig.services || {});
      expect(services).toContain('clickhouse');
      expect(services).toContain('nats');
      expect(services).toContain('valkey');
    });
  });

  describe('Environment variable consistency', () => {
    test('.env.example documents all variables in .env', () => {
      const envContent = readFileSync(ENV_FILE, 'utf-8');
      const envExampleContent = readFileSync(ENV_EXAMPLE_FILE, 'utf-8');

      // Extract variable names from .env
      const envVars = envContent.match(/^[A-Z_]+=/gm)?.map(v => v.slice(0, -1)) || [];

      // Verify each variable is documented in .env.example
      envVars.forEach(varName => {
        expect(envExampleContent).toContain(`${varName}=`);
      });
    });

    test('Environment variables follow naming convention', () => {
      const content = readFileSync(ENV_FILE, 'utf-8');
      const lines = content.split('\n').filter(l => l.includes('='));

      lines.forEach(line => {
        const match = line.match(/^([A-Z_]+)=/);
        if (match) {
          expect(match[1]).toMatch(/^[A-Z][A-Z_]*$/);
        }
      });
    });
  });

  describe('Service connectivity configuration', () => {
    test('PostgreSQL connection string is properly formatted', () => {
      const content = readFileSync(ENV_FILE, 'utf-8');
      const dbUrlMatch = content.match(/DATABASE_URL=([^$\n]+)/);
      if (dbUrlMatch) {
        expect(dbUrlMatch[1]).toMatch(/^postgresql:\/\/[^:]+:[^@]+@[^:]+:\d+\/\w+$/);
      }
    });

    test('All service hosts are configurable via environment', () => {
      const content = readFileSync(ENV_FILE, 'utf-8');

      // Each service should have a _HOST variable
      expect(content).toMatch(/POSTGRES_HOST=/);
      expect(content).toMatch(/NATS_HOST=/);
      expect(content).toMatch(/CLICKHOUSE_HOST=/);
      expect(content).toMatch(/VALKEY_HOST=/);
    });

    test('All service ports are configurable via environment', () => {
      const content = readFileSync(ENV_FILE, 'utf-8');

      // Each service should have a _PORT variable
      expect(content).toMatch(/POSTGRES_PORT=/);
      expect(content).toMatch(/NATS_CLIENT_PORT=/);
      expect(content).toMatch(/CLICKHOUSE_PORT=/);
      expect(content).toMatch(/CLICKHOUSE_HTTP_PORT=/);
      expect(content).toMatch(/CLICKHOUSE_TCP_PORT=/);
      expect(content).toMatch(/VALKEY_PORT=/);
    });
  });
});
