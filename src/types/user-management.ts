/**
 * User Management Types
 *
 * Defines types for user management, role assignment, and status tracking.
 */

/**
 * User roles in the system
 */
export type UserRole = 'user' | 'business_owner' | 'admin';

/**
 * User status values
 */
export type UserStatus = 'active' | 'inactive' | 'suspended';

/**
 * Extended user record with role and status
 */
export interface UserWithRole {
  id: string;
  email: string;
  displayName: string;
  role: UserRole;
  status: UserStatus;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Input for creating a user
 */
export interface CreateUserInput {
  email: string;
  password: string;
  displayName: string;
  role?: UserRole;
}

/**
 * Input for updating a user's role
 */
export interface UpdateUserRoleInput {
  userId: string;
  role: UserRole;
}

/**
 * Input for updating a user's status
 */
export interface UpdateUserStatusInput {
  userId: string;
  status: UserStatus;
}

/**
 * Input for paginated user listing
 */
export interface GetUserListInput {
  page: number;
  pageSize: number;
  emailSearch?: string;
}

/**
 * Paginated user list result
 */
export interface UserListResult {
  users: UserWithRole[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

/**
 * NATS payload for role changed event
 */
export interface RoleChangedEvent {
  userId: string;
  oldRole: UserRole;
  newRole: UserRole;
  changedBy: string;
  timestamp: string;
}

/**
 * NATS subject for role change events
 */
export const ROLE_CHANGED_SUBJECT = 'user.role_changed';

/**
 * Validate user role
 */
export function isValidRole(role: string): role is UserRole {
  return ['user', 'business_owner', 'admin'].includes(role);
}

/**
 * Validate user status
 */
export function isValidStatus(status: string): status is UserStatus {
  return ['active', 'inactive', 'suspended'].includes(status);
}

/**
 * Get display label for role
 */
export function getRoleLabel(role: UserRole): string {
  const labels: Record<UserRole, string> = {
    user: 'User',
    business_owner: 'Business Owner',
    admin: 'Admin',
  };
  return labels[role];
}

/**
 * Get display label for status
 */
export function getStatusLabel(status: UserStatus): string {
  const labels: Record<UserStatus, string> = {
    active: 'Active',
    inactive: 'Inactive',
    suspended: 'Suspended',
  };
  return labels[status];
}

/**
 * Get status color variant for UI
 */
export function getStatusVariant(status: UserStatus): 'success' | 'warning' | 'error' | 'default' {
  const variants: Record<UserStatus, 'success' | 'warning' | 'error' | 'default'> = {
    active: 'success',
    inactive: 'default',
    suspended: 'error',
  };
  return variants[status];
}
