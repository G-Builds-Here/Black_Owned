/**
 * Copyright 2026 Black Owned
 *
 * Test: LOC-0032-AC1 - SQL validation for ClickHouse table definitions
 * Validates the migration SQL file meets AC requirements without requiring runtime
 */

import { describe, it, expect, beforeAll } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

interface TableDefinition {
  name: string;
  hasReplacingMergeTree: boolean;
  hasOrderBy: boolean;
  hasVersionColumn: boolean;
  orderByClause: string;
}

describe('LOC-0032-AC1 SQL Validation', () => {
  const sqlPath = path.join(__dirname, '001_create_tables.sql');
  let sqlContent: string;

  beforeAll(() => {
    sqlContent = fs.readFileSync(sqlPath, 'utf-8');
  });

  const requiredTables = [
    'businesses',
    'reviews',
    'users',
    'verification_requests',
    'messages',
    'analytics_events',
    'categories'
  ];

  describe('Table existence in SQL', () => {
    it.each(requiredTables)('should have CREATE TABLE statement for %s', (tableName) => {
      const pattern = new RegExp(`CREATE\\s+TABLE\\s+IF\\s+NOT\\s+EXISTS\\s+${tableName}`, 'i');
      expect(sqlContent).toMatch(pattern);
    });
  });

  describe('Engine validation', () => {
    it.each(requiredTables)('should use ReplacingMergeTree engine for %s', (tableName) => {
      // Find the table definition block
      const tableRegex = new RegExp(
        `CREATE\\s+TABLE\\s+IF\\s+NOT\\s+EXISTS\\s+${tableName}[\\s\\S]*?ENGINE\\s*=\\s*(\\w+)`,
        'i'
      );
      const match = sqlContent.match(tableRegex);
      expect(match).not.toBeNull();
      expect(match![1].toLowerCase()).toBe('replacingmergetree');
    });
  });

  describe('ORDER BY validation', () => {
    it.each(requiredTables)('should have ORDER BY clause for %s', (tableName) => {
      const tableRegex = new RegExp(
        `CREATE\\s+TABLE\\s+IF\\s+NOT\\s+EXISTS\\s+${tableName}[\\s\\S]*?ORDER\\s+BY\\s+([^;]+)`,
        'i'
      );
      const match = sqlContent.match(tableRegex);
      expect(match).not.toBeNull();
      const orderByClause = match![1].trim();
      expect(orderByClause).not.toBe('');
      expect(orderByClause).not.toBe('0');
    });
  });

  describe('_version column presence', () => {
    it.each(requiredTables)('should have _version UInt64 column for %s', (tableName) => {
      const tableRegex = new RegExp(
        `CREATE\\s+TABLE\\s+IF\\s+NOT\\s+EXISTS\\s+${tableName}[\\s\\S]*?_version\\s+UInt64`,
        'i'
      );
      expect(sqlContent).toMatch(tableRegex);
    });
  });

  describe('Complete table structure validation', () => {
    it('should validate all 7 tables have complete ReplacingMergeTree structure', () => {
      const results: TableDefinition[] = [];

      requiredTables.forEach(tableName => {
        const tableRegex = new RegExp(
          `CREATE\\s+TABLE\\s+IF\\s+NOT\\s+EXISTS\\s+${tableName}[\\s\\S]*?ENGINE\\s*=\\s*(\\w+)[\\s\\S]*?ORDER\\s+BY\\s+([^;]+)`,
          'i'
        );
        const match = sqlContent.match(tableRegex);

        const hasVersion = new RegExp(
          `CREATE\\s+TABLE\\s+IF\\s+NOT\\s+EXISTS\\s+${tableName}[\\s\\S]*?_version\\s+UInt64`,
          'i'
        ).test(sqlContent);

        results.push({
          name: tableName,
          hasReplacingMergeTree: match ? match[1].toLowerCase() === 'replacingmergetree' : false,
          hasOrderBy: match ? match[2].trim() !== '' && match[2].trim() !== '0' : false,
          hasVersionColumn: hasVersion,
          orderByClause: match ? match[2].trim() : ''
        });
      });

      // Assert all tables pass
      results.forEach(table => {
        expect(table.hasReplacingMergeTree).toBe(true);
        expect(table.hasOrderBy).toBe(true);
        expect(table.hasVersionColumn).toBe(true);
      });

      // Summary counts
      expect(results).toHaveLength(7);
      expect(results.filter(r => r.hasReplacingMergeTree).length).toBe(7);
      expect(results.filter(r => r.hasOrderBy).length).toBe(7);
      expect(results.filter(r => r.hasVersionColumn).length).toBe(7);
    });
  });

  describe('Specific ORDER BY expectations', () => {
    it('businesses table should ORDER BY id', () => {
      const match = sqlContent.match(/CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+businesses[\s\S]*?ORDER\s+BY\s+([^;]+)/i);
      expect(match).not.toBeNull();
      expect(match![1].trim()).toBe('id');
    });

    it('reviews table should ORDER BY id', () => {
      const match = sqlContent.match(/CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+reviews[\s\S]*?ORDER\s+BY\s+([^;]+)/i);
      expect(match).not.toBeNull();
      expect(match![1].trim()).toBe('id');
    });

    it('users table should ORDER BY id', () => {
      const match = sqlContent.match(/CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+users[\s\S]*?ORDER\s+BY\s+([^;]+)/i);
      expect(match).not.toBeNull();
      expect(match![1].trim()).toBe('id');
    });

    it('verification_requests table should ORDER BY id', () => {
      const match = sqlContent.match(/CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+verification_requests[\s\S]*?ORDER\s+BY\s+([^;]+)/i);
      expect(match).not.toBeNull();
      expect(match![1].trim()).toBe('id');
    });

    it('messages table should ORDER BY id', () => {
      const match = sqlContent.match(/CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+messages[\s\S]*?ORDER\s+BY\s+([^;]+)/i);
      expect(match).not.toBeNull();
      expect(match![1].trim()).toBe('id');
    });

    it('analytics_events table should ORDER BY id', () => {
      const match = sqlContent.match(/CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+analytics_events[\s\S]*?ORDER\s+BY\s+([^;]+)/i);
      expect(match).not.toBeNull();
      expect(match![1].trim()).toBe('id');
    });

    it('categories table should ORDER BY id', () => {
      const match = sqlContent.match(/CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+categories[\s\S]*?ORDER\s+BY\s+([^;]+)/i);
      expect(match).not.toBeNull();
      expect(match![1].trim()).toBe('id');
    });
  });
});
