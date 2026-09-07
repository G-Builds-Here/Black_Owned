/**
 * Docker Compose Orchestration Tests
 * Validates that all services start and pass health checks
 */

import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import { execSync } from 'child_process';

const COMPOSE_FILE = 'docker-compose.yml';
const HEALTH_CHECK_TIMEOUT = 60000; // 60 seconds
const SERVICE_STARTUP_DELAY = 10000; // 10 seconds initial delay

const SERVICES = [
  {
    name: 'black-owned-bw-scraper',
    healthUrl: 'http://localhost:8080/health',
    ports: [8080]
  },
  {
    name: 'black-owned-postgres',
    healthCommand: 'pg_isready -U postgres',
    ports: [5432]
  },
  {
    name: 'black-owned-clickhouse',
    healthUrl: 'http://localhost:8123/ping',
    ports: [8123, 9000]
  },
  {
    name: 'black-owned-nats',
    healthCommand: 'wget -qO- http://localhost:8222/healthz',
    ports: [4222, 8222]
  },
  {
    name: 'black-owned-minio',
    healthUrl: 'http://localhost:9002/minio/health/live',
    ports: [9002, 9003]
  },
  {
    name: 'black-owned-valkey',
    healthCommand: 'valkey-cli -p 6379 ping',
    ports: [6379]
  }
];

/**
 * Execute a docker command and return output
 */
function dockerExec(cmd: string): string {
  return execSync(`docker ${cmd}`, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] }).trim();
}

/**
 * Execute a docker-compose command
 */
function composeExec(cmd: string): string {
  return execSync(`docker-compose -f ${COMPOSE_FILE} ${cmd}`, { encoding: 'utf8' }).trim();
}

/**
 * Check if a container is running
 */
function isContainerRunning(containerName: string): boolean {
  try {
    const status = dockerExec(`ps --filter "name=${containerName}" --format "{{.Status}}"`);
    return status.includes('Up');
  } catch {
    return false;
  }
}

/**
 * Get container health status
 */
function getContainerHealth(containerName: string): string {
  try {
    const health = dockerExec(`inspect ${containerName} --format '{{.State.Health.Status}}'`);
    return health;
  } catch {
    return 'unavailable';
  }
}

/**
 * Wait for a container to reach expected health status
 */
function waitForHealth(
  containerName: string,
  expectedStatus: string,
  timeoutMs: number
): boolean {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const status = getContainerHealth(containerName);
    if (status === expectedStatus) {
      return true;
    }
    // Sleep 2 seconds between checks
    execSync('powershell -Command "Start-Sleep -Seconds 2"');
  }
  return false;
}

/**
 * Stop and remove all containers
 */
function tearDown(): void {
  try {
    execSync(
      `docker-compose -f ${COMPOSE_FILE} down -v`,
      { encoding: 'utf8', stdio: 'ignore' }
    );
  } catch {
    // Ignore errors on teardown
  }
}

test.describe('LOC-0056-AC2: Docker Compose Orchestration', () => {
  test.beforeAll(() => {
    // Clean up any existing containers before tests
    tearDown();
  });

  test.afterAll(() => {
    // Clean up after all tests
    tearDown();
  });

  test('should start all services with docker-compose up', () => {
    // Start all services in detached mode
    const output = composeExec('up -d --wait');

    // Verify command succeeded by checking output contains running services
    expect(output).toBeTruthy();

    // Verify each service container is running
    for (const service of SERVICES) {
      expect(isContainerRunning(service.name)).toBe(true);
    }
  });

  test('should have all services pass health checks within 60 seconds', () => {
    const expectedHealth = 'healthy';

    for (const service of SERVICES) {
      const passed = waitForHealth(service.name, expectedHealth, HEALTH_CHECK_TIMEOUT);
      expect(passed).toBe(true);
      expect(getContainerHealth(service.name)).toBe(expectedHealth);
    }
  });

  test('should configure service dependencies correctly', () => {
    const composeConfig = composeExec('config');

    // Verify depends_on is configured
    expect(composeConfig).toContain('depends_on');

    // Verify health check conditions are set
    expect(composeConfig).toContain('condition: service_healthy');

    // Verify bw-scraper depends on nats, postgres, valkey
    const bwScraperSection = composeConfig.substring(
      composeConfig.indexOf('bw-scraper:'),
      composeConfig.indexOf('postgres:', composeConfig.indexOf('bw-scraper:'))
    );
    expect(bwScraperSection).toContain('nats');
    expect(bwScraperSection).toContain('postgres');
    expect(bwScraperSection).toContain('valkey');
  });

  test('should expose correct ports for each service', () => {
    for (const service of SERVICES) {
      for (const port of service.ports) {
        const portOutput = dockerExec(`port ${service.name} ${port}`);
        expect(portOutput).toContain(`${port}`);
      }
    }
  });

  test('should have healthcheck configured for each service', () => {
    for (const service of SERVICES) {
      const healthcheck = dockerExec(`inspect ${service.name} --format '{{.Config.Healthcheck}}'`);
      expect(healthcheck).toBeTruthy();
      expect(healthcheck).not.toContain('<nil>');
    }
  });
});
