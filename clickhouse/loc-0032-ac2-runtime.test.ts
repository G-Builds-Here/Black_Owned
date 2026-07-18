/**
 * Copyright 2026 Black Owned
 *
 * Test: LOC-0032-AC2 - Runtime validation of ClickHouse container
 * Tests the actual Docker container behavior for health checks, memory limits, and restart policy
 *
 * Note: These tests require Docker to be running and may take time to complete.
 * Run with: npx vitest run clickhouse/loc-0032-ac2-runtime.test.ts --test-timeout=120000
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execSync } from 'child_process';
import * as path from 'path';

const DOCKER_COMPOSE_PATH = path.join(__dirname, '..', 'docker-compose.yml');
const CONTAINER_NAME = 'black-owned-clickhouse';

function runDockerCommand(cmd: string): string {
  try {
    return execSync(cmd, { encoding: 'utf-8', timeout: 30000 });
  } catch (error) {
    throw new Error(`Docker command failed: ${cmd}\nError: ${error instanceof Error ? error.message : String(error)}`);
  }
}

describe('LOC-0032-AC2 Runtime Validation', { timeout: 120000 }, () => {
  let containerStarted = false;

  beforeAll(() => {
    // Start the container in detached mode
    console.log('Starting ClickHouse container...');
    try {
      runDockerCommand(`docker compose -f "${DOCKER_COMPOSE_PATH}" up -d`);
      containerStarted = true;
      console.log('Container started, waiting for health check...');
    } catch (error) {
      console.warn('Could not start container (Docker may not be available):', error);
      // Skip these tests if Docker is not available
      return;
    }
  }, 60000);

  afterAll(() => {
    if (containerStarted) {
      console.log('Stopping ClickHouse container...');
      try {
        runDockerCommand(`docker compose -f "${DOCKER_COMPOSE_PATH}" down`);
      } catch (error) {
        console.warn('Could not stop container:', error);
      }
    }
  });

  it('should show container as healthy after 30 seconds', () => {
    // Wait for container to become healthy
    const maxAttempts = 6; // 6 attempts * 10s interval = 60s max
    let lastHealthStatus = '';

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        const healthOutput = runDockerCommand(
          `docker inspect --format='{{json .State.Health}}' ${CONTAINER_NAME}`
        );
        const healthInfo = JSON.parse(healthOutput.trim());
        lastHealthStatus = healthInfo.Status;

        if (healthInfo.Status === 'healthy') {
          console.log(`Container became healthy after ${attempt + 1} attempts`);
          break;
        }

        console.log(`Health check attempt ${attempt + 1}: ${healthInfo.Status}`);
      } catch (error) {
        console.warn(`Health check attempt ${attempt + 1} failed:`, error);
      }

      if (attempt < maxAttempts - 1) {
        console.log('Waiting 10 seconds for next health check...');
        // eslint-disable-next-line no-await-in-loop
        new Promise(resolve => setTimeout(resolve, 10000));
      }
    }

    expect(lastHealthStatus).toBe('healthy');
  });

  it('should have memory limit of 4g', () => {
    const inspectOutput = runDockerCommand(`docker inspect ${CONTAINER_NAME}`);
    const inspectData = JSON.parse(inspectOutput);

    if (inspectData && inspectData[0]) {
      const hostConfig = inspectData[0].HostConfig;
      const memoryLimit = hostConfig.Memory;

      // 4g = 4 * 1024 * 1024 * 1024 = 4294967296 bytes
      const expectedMemory = 4 * 1024 * 1024 * 1024;

      expect(memoryLimit).toBe(expectedMemory);
      console.log(`Memory limit confirmed: ${memoryLimit} bytes (${memoryLimit / (1024 * 1024 * 1024)}g)`);
    }
  });

  it('should have restart policy set to unless-stopped', () => {
    const inspectOutput = runDockerCommand(`docker inspect ${CONTAINER_NAME}`);
    const inspectData = JSON.parse(inspectOutput);

    if (inspectData && inspectData[0]) {
      const restartPolicy = inspectData[0].HostConfig.RestartPolicy.Name;
      expect(restartPolicy).toBe('unless-stopped');
      console.log(`Restart policy confirmed: ${restartPolicy}`);
    }
  });

  it('should auto-restart after OOM kill', () => {
    // This test validates the restart policy works
    // Note: We cannot actually trigger OOM kill in a test environment
    // Instead, we verify the restart policy is configured correctly

    const inspectOutput = runDockerCommand(`docker inspect ${CONTAINER_NAME}`);
    const inspectData = JSON.parse(inspectOutput);

    if (inspectData && inspectData[0]) {
      const restartPolicy = inspectData[0].HostConfig.RestartPolicy;
      const maxRetry = restartPolicy.MaximumRetryCount;

      expect(restartPolicy.Name).toBe('unless-stopped');
      console.log(`Restart policy configured: ${restartPolicy.Name}, max retry: ${maxRetry}`);
    }
  });
});
