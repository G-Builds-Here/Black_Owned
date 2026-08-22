/**
 * Copyright (c) 2026 Black Owned. All rights reserved.
 *
 * @file Cargo.toml configuration tests for bw-scraper
 * @description Validates edition 2021 and feature flag configuration per LOC-0070-AC3
 */

import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * Simple TOML parser for Cargo.toml files
 * Extracts key sections: workspace.package, package, dependencies, features
 */
function parseCargoToml(content: string): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  let currentSection: string | null = null;
  const lines = content.split('\n');

  // Helper to parse inline table: { key = "value", ... }
  function parseInlineTable(str: string): Record<string, unknown> {
    const obj: Record<string, unknown> = {};
    const inner = str.replace(/^\{\s*/, '').replace(/\s*\}$/, '');
    // Split by comma, but respect nested structures
    const parts: string[] = [];
    let depth = 0;
    let current = '';
    for (const char of inner) {
      if (char === '{' || char === '[') depth++;
      if (char === '}' || char === ']') depth--;
      if (char === ',' && depth === 0) {
        parts.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    if (current.trim()) parts.push(current.trim());

    for (const part of parts) {
      const kvMatch = part.match(/^(\w+)\s*=\s*(.+)$/);
      if (kvMatch) {
        const [, k, v] = kvMatch;
        if (v.startsWith('"') && v.endsWith('"')) {
          obj[k] = v.slice(1, -1);
        } else if (v.startsWith('[') && v.endsWith(']')) {
          const items = v.slice(1, -1)
            .split(',')
            .map((s: string) => s.trim())
            .filter((s: string) => s)
            .map((s: string) => {
              if (s.startsWith('"') && s.endsWith('"')) {
                return s.slice(1, -1);
              }
              return s;
            });
          obj[k] = items;
        } else if (v === 'true') {
          obj[k] = true;
        } else if (v === 'false') {
          obj[k] = false;
        } else if (/^\d+$/.test(v)) {
          obj[k] = parseInt(v, 10);
        } else {
          obj[k] = v;
        }
      }
    }
    return obj;
  }

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    // Section header
    const sectionMatch = trimmed.match(/^\[([^\]]+)\]$/);
    if (sectionMatch) {
      currentSection = sectionMatch[1];
      const parts = currentSection.split('.');
      let obj: unknown = result;
      for (let i = 0; i < parts.length - 1; i++) {
        const key = parts[i];
        if (!(obj as Record<string, unknown>)[key]) {
          (obj as Record<string, unknown>)[key] = {};
        }
        obj = (obj as Record<string, unknown>)[key];
      }
      const lastKey = parts[parts.length - 1];
      (obj as Record<string, unknown>)[lastKey] = {};
      continue;
    }

    // Key-value pair (handle nested keys like edition.workspace)
    const kvMatch = trimmed.match(/^([\w.]+)\s*=\s*(.+)$/);
    if (kvMatch && currentSection) {
      const [, keyPath, value] = kvMatch;
      const parts = currentSection.split('.');
      let obj: unknown = result;
      for (let i = 0; i < parts.length; i++) {
        if (!(obj as Record<string, unknown>)[parts[i]]) {
          (obj as Record<string, unknown>)[parts[i]] = {};
        }
        obj = (obj as Record<string, unknown>)[parts[i]];
      }
      // Parse value
      let parsedValue: unknown;
      if (value.startsWith('{') && value.endsWith('}')) {
        parsedValue = parseInlineTable(value);
      } else if (value.startsWith('"') && value.endsWith('"')) {
        parsedValue = value.slice(1, -1);
      } else if (value.startsWith('[') && value.endsWith(']')) {
        const items = value.slice(1, -1)
          .split(',')
          .map((s: string) => s.trim())
          .filter((s: string) => s)
          .map((s: string) => {
            if (s.startsWith('"') && s.endsWith('"')) {
              return s.slice(1, -1);
            }
            return s;
          });
        parsedValue = items;
      } else if (value === 'true') {
        parsedValue = true;
      } else if (value === 'false') {
        parsedValue = false;
      } else if (/^\d+$/.test(value)) {
        parsedValue = parseInt(value, 10);
      } else {
        parsedValue = value;
      }
      // Handle nested key path (e.g., edition.workspace)
      const keyParts = keyPath.split('.');
      let keyObj: unknown = obj;
      for (let i = 0; i < keyParts.length - 1; i++) {
        if (!(keyObj as Record<string, unknown>)[keyParts[i]]) {
          (keyObj as Record<string, unknown>)[keyParts[i]] = {};
        }
        keyObj = (keyObj as Record<string, unknown>)[keyParts[i]];
      }
      (keyObj as Record<string, unknown>)[keyParts[keyParts.length - 1]] = parsedValue;
    }
  }

  return result;
}

describe('Cargo Configuration', () => {
  const cargoPath = join(__dirname, 'Cargo.toml');
  const rootCargoPath = join(__dirname, '..', 'Cargo.toml');

  let scraperCargo: Record<string, unknown>;
  let rootCargo: Record<string, unknown>;

  beforeAll(() => {
    scraperCargo = parseCargoToml(readFileSync(cargoPath, 'utf-8'));
    rootCargo = parseCargoToml(readFileSync(rootCargoPath, 'utf-8'));
  });

  describe('Workspace Edition Configuration', () => {
    it('should specify edition 2021 in workspace Cargo.toml', () => {
      const edition = (rootCargo.workspace as Record<string, unknown>).package as Record<string, unknown>;
      expect(edition.edition).toBe('2021');
    });

    it('should reference workspace edition in bw-scraper Cargo.toml', () => {
      const pkg = scraperCargo.package as Record<string, unknown>;
      const edition = pkg.edition as Record<string, unknown>;
      expect(edition.workspace).toBe(true);
    });
  });

  describe('Feature Flag Configuration', () => {
    it('should define scraper feature for optional scraper component', () => {
      const features = scraperCargo.features as Record<string, unknown>;
      expect(features.scraper).toEqual([]);
    });

    it('should define api feature with axum dependency', () => {
      const features = scraperCargo.features as Record<string, unknown>;
      expect(features.api).toEqual(['axum', 'tokio/net']);
    });

    it('should set default features to include scraper, api, and importer', () => {
      const features = scraperCargo.features as Record<string, unknown>;
      expect(features.default).toEqual(['scraper', 'api', 'importer']);
    });

    it('should mark axum as optional dependency', () => {
      const deps = scraperCargo.dependencies as Record<string, unknown>;
      const axum = deps.axum as Record<string, unknown>;
      expect(axum.optional).toBe(true);
    });
  });

  describe('Feature-Dependency Alignment', () => {
    it('should have axum dependency when api feature is enabled', () => {
      const deps = scraperCargo.dependencies as Record<string, unknown>;
      const axum = deps.axum as Record<string, unknown>;
      expect(axum).toBeDefined();
      expect(axum.version).toBe('0.7');
    });

    it('should include axum macros feature for API functionality', () => {
      const deps = scraperCargo.dependencies as Record<string, unknown>;
      const axum = deps.axum as Record<string, unknown>;
      expect(axum.features).toEqual(['macros']);
    });
  });
});
