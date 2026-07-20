/**
 * User Management Repository Tests
 *
 * Tests for user management repository with PostgreSQL integration.
 */

import {
  initializeUserManagementSchema,
  updateUserRole,
  updateUserStatus,
  findByIdWithRole,
  getUsersPaginated,
} from './user-management-repository';
import { create as createUser, findByEmail, closePool } from './user-repository';
import { hashPassword } from '../auth/auth-service';
import { UserRole, UserStatus } from '../../types/user-management';

describe('User Management Repository', () => {
  beforeAll(async () => {
    // Initialize schema
    await initializeUserManagementSchema();
  });

  afterAll(async () => {
    await closePool();
  });

  beforeEach(async () => {
    // Clean up test data
    const { getPool } = await import('./user-repository');
    const client = await getPool().connect();
    try {
      await client.query("DELETE FROM users WHERE email LIKE 'test-%'");
    } finally {
      client.release();
    }
  });

  describe('updateUserRole', () => {
    it('should update user role successfully', async () => {
      const passwordHash = await hashPassword('TestPassword123!');
      const user = await createUser(
        'test-role@example.com',
        passwordHash,
        'Test User'
      );

      const updated = await updateUserRole(user.id, 'admin' as UserRole);

      expect(updated).toBeTruthy();
      expect(updated?.role).toBe('admin');
    });

    it('should return null for non-existent user', async () => {
      const result = await updateUserRole('00000000-0000-0000-0000-000000000000', 'admin' as UserRole);
      expect(result).toBeNull();
    });
  });

  describe('updateUserStatus', () => {
    it('should update user status successfully', async () => {
      const passwordHash = await hashPassword('TestPassword123!');
      const user = await createUser(
        'test-status@example.com',
        passwordHash,
        'Test User'
      );

      const updated = await updateUserStatus(user.id, 'suspended' as UserStatus);

      expect(updated).toBeTruthy();
      expect(updated?.status).toBe('suspended');
    });

    it('should return null for non-existent user', async () => {
      const result = await updateUserStatus('00000000-0000-0000-0000-000000000000', 'suspended' as UserStatus);
      expect(result).toBeNull();
    });
  });

  describe('findByIdWithRole', () => {
    it('should return user with role and status', async () => {
      const passwordHash = await hashPassword('TestPassword123!');
      const user = await createUser(
        'test-find@example.com',
        passwordHash,
        'Test User'
      );

      // Update role and status
      await updateUserRole(user.id, 'business_owner' as UserRole);
      await updateUserStatus(user.id, 'inactive' as UserStatus);

      const found = await findByIdWithRole(user.id);

      expect(found).toBeTruthy();
      expect(found?.email).toBe('test-find@example.com');
      expect(found?.role).toBe('business_owner');
      expect(found?.status).toBe('inactive');
    });

    it('should return null for non-existent user', async () => {
      const result = await findByIdWithRole('00000000-0000-0000-0000-000000000000');
      expect(result).toBeNull();
    });
  });

  describe('getUsersPaginated', () => {
    it('should return paginated users', async () => {
      // Create test users
      for (let i = 0; i < 25; i++) {
        const passwordHash = await hashPassword('TestPassword123!');
        await createUser(
          `test-paginate-${i}@example.com`,
          passwordHash,
          `Test User ${i}`
        );
      }

      const result = await getUsersPaginated({
        page: 1,
        pageSize: 10,
      });

      expect(result.users.length).toBe(10);
      expect(result.total).toBe(25);
      expect(result.page).toBe(1);
      expect(result.pageSize).toBe(10);
      expect(result.totalPages).toBe(3);
    });

    it('should filter by email search', async () => {
      // Create test users
      const passwordHash = await hashPassword('TestPassword123!');
      await createUser('john.doe@example.com', passwordHash, 'John Doe');
      await createUser('jane.smith@example.com', passwordHash, 'Jane Smith');
      await createUser('bob.johnson@example.com', passwordHash, 'Bob Johnson');

      const result = await getUsersPaginated({
        page: 1,
        pageSize: 10,
        emailSearch: 'john',
      });

      expect(result.users.length).toBe(2);
      expect(result.total).toBe(2);
      expect(result.users.every((u) => u.email.includes('john'))).toBe(true);
    });

    it('should handle empty result set', async () => {
      const result = await getUsersPaginated({
        page: 1,
        pageSize: 10,
        emailSearch: 'nonexistent@example.com',
      });

      expect(result.users.length).toBe(0);
      expect(result.total).toBe(0);
      expect(result.totalPages).toBe(0);
    });

    it('should handle pagination correctly', async () => {
      // Create test users
      for (let i = 0; i < 25; i++) {
        const passwordHash = await hashPassword('TestPassword123!');
        await createUser(
          `test-page-${i}@example.com`,
          passwordHash,
          `Test User ${i}`
        );
      }

      const page1 = await getUsersPaginated({ page: 1, pageSize: 10 });
      const page2 = await getUsersPaginated({ page: 2, pageSize: 10 });
      const page3 = await getUsersPaginated({ page: 3, pageSize: 10 });

      expect(page1.users.length).toBe(10);
      expect(page2.users.length).toBe(10);
      expect(page3.users.length).toBe(5);
    });
  });
});
