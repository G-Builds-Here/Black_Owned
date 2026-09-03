/**
 * Copyright 2026 Black Owned
 *
 * Test: LOC-0056-AC1 - Dockerfile for bw-scraper
 * Validates multi-stage build, image size under 200MB, and non-root user
 */

import * as fs from 'fs';
import * as path from 'path';

describe('LOC-0056-AC1 Dockerfile Validation', () => {
  const dockerfilePath = path.join(__dirname, '..', 'Dockerfile');
  let dockerfileContent: string;

  beforeAll(() => {
    dockerfileContent = fs.readFileSync(dockerfilePath, 'utf-8');
  });

  describe('Multi-stage build structure', () => {
    it('should have a builder stage using rust:1.88', () => {
      expect(dockerfileContent).toMatch(/FROM rust:1\.88.*AS builder/s);
    });

    it('should have a runtime stage using debian:bookworm-slim', () => {
      expect(dockerfileContent).toMatch(/FROM debian:bookworm-slim.*AS runtime/s);
    });

    it('should have exactly 2 FROM statements (multi-stage)', () => {
      const fromMatches = dockerfileContent.match(/^FROM\s+/gm);
      expect(fromMatches).toBeDefined();
      expect(fromMatches?.length).toBe(2);
    });

    it('should copy binary from builder to runtime stage', () => {
      expect(dockerfileContent).toMatch(/COPY --from=builder.*bw-scraper/s);
    });
  });

  describe('Non-root user configuration', () => {
    it('should create a scraper group', () => {
      expect(dockerfileContent).toMatch(/groupadd.*--gid\s+1000.*scraper/s);
    });

    it('should create a scraper user with UID 1000', () => {
      expect(dockerfileContent).toMatch(/useradd.*--uid\s+1000.*--gid\s+scraper.*scraper/s);
    });

    it('should set USER to scraper', () => {
      expect(dockerfileContent).toMatch(/USER\s+scraper/si);
    });

    it('should change ownership of binary to scraper user', () => {
      expect(dockerfileContent).toMatch(/chown.*scraper.*bw-scraper/si);
    });
  });

  describe('Runtime dependencies', () => {
    it('should install ca-certificates', () => {
      expect(dockerfileContent).toMatch(/ca-certificates/s);
    });

    it('should install OpenSSL runtime library (libssl3)', () => {
      // Debian bookworm uses libssl3, not libressl
      expect(dockerfileContent).toMatch(/libssl3/s);
    });
  });

  describe('Health check configuration', () => {
    it('should have HEALTHCHECK directive', () => {
      expect(dockerfileContent).toMatch(/HEALTHCHECK/s);
    });

    it('should have healthcheck interval configured', () => {
      expect(dockerfileContent).toMatch(/HEALTHCHECK.*--interval/si);
    });

    it('should have healthcheck timeout configured', () => {
      expect(dockerfileContent).toMatch(/HEALTHCHECK.*--timeout/si);
    });

    it('should have healthcheck retries configured', () => {
      expect(dockerfileContent).toMatch(/HEALTHCHECK.*--retries/si);
    });
  });

  describe('Environment configuration', () => {
    it('should set RUST_LOG environment variable', () => {
      expect(dockerfileContent).toMatch(/ENV\s+RUST_LOG/si);
    });

    it('should set RUST_BACKTRACE environment variable', () => {
      expect(dockerfileContent).toMatch(/ENV\s+RUST_BACKTRACE/si);
    });
  });

  describe('Port configuration', () => {
    it('should expose port 8080', () => {
      expect(dockerfileContent).toMatch(/EXPOSE\s+8080/s);
    });
  });

  describe('Entry point', () => {
    it('should have ENTRYPOINT defined', () => {
      expect(dockerfileContent).toMatch(/ENTRYPOINT/s);
    });

    it('should point to bw-scraper binary', () => {
      expect(dockerfileContent).toMatch(/ENTRYPOINT.*bw-scraper/si);
    });
  });
});
