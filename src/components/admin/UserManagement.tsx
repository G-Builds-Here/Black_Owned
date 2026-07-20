/**
 * User Management Component
 *
 * Admin panel for managing users with pagination, email search, and role assignment.
 */

'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  UserWithRole,
  UserRole,
  UserStatus,
  getRoleLabel,
  getStatusLabel,
  getStatusVariant,
} from '@/types/user-management';
import { Card, Badge, Button, Input, Dropdown, DropdownItem, Tabs, TabPanel, Toast } from '@/components/ui';

/**
 * User table row props
 */
interface UserRowProps {
  user: UserWithRole;
  onRoleChange: (userId: string, newRole: UserRole) => Promise<void>;
  onStatusChange: (userId: string, newStatus: UserStatus) => Promise<void>;
}

/**
 * User management page props
 */
interface UserManagementProps {
  initialUsers?: UserWithRole[];
  initialTotal?: number;
}

/**
 * User row component with role/status management
 */
const UserRow: React.FC<UserRowProps> = ({ user, onRoleChange, onStatusChange }) => {
  const [isEditingRole, setIsEditingRole] = useState(false);
  const [isEditingStatus, setIsEditingStatus] = useState(false);
  const [tempRole, setTempRole] = useState(user.role);
  const [tempStatus, setTempStatus] = useState(user.status);
  const [isSaving, setIsSaving] = useState(false);

  const handleRoleChange = async () => {
    if (tempRole === user.role) {
      setIsEditingRole(false);
      return;
    }

    setIsSaving(true);
    try {
      await onRoleChange(user.id, tempRole);
      setIsEditingRole(false);
    } catch (error) {
      console.error('Failed to update role:', error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleStatusChange = async () => {
    if (tempStatus === user.status) {
      setIsEditingStatus(false);
      return;
    }

    setIsSaving(true);
    try {
      await onStatusChange(user.id, tempStatus);
      setIsEditingStatus(false);
    } catch (error) {
      console.error('Failed to update status:', error);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <tr className="border-b border-neutral-200 hover:bg-neutral-50">
      <td className="px-4 py-3">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-heritage-royal/10 rounded-full flex items-center justify-center">
            <span className="text-sm font-medium text-heritage-royal">
              {user.displayName.charAt(0).toUpperCase()}
            </span>
          </div>
          <div>
            <p className="font-medium text-neutral-800">{user.displayName}</p>
            <p className="text-sm text-neutral-500">{user.email}</p>
          </div>
        </div>
      </td>
      <td className="px-4 py-3">
        {isEditingRole ? (
          <div className="flex items-center gap-2">
            <Dropdown
              trigger={<Badge variant="default" size="sm">{getRoleLabel(tempRole)}</Badge>}
              items={[
                { key: 'user', label: 'User', onClick: () => setTempRole('user') },
                { key: 'business_owner', label: 'Business Owner', onClick: () => setTempRole('business_owner') },
                { key: 'admin', label: 'Admin', onClick: () => setTempRole('admin') },
              ]}
              position="bottom-start"
            />
            <div className="flex gap-1">
              <Button
                variant="primary"
                size="sm"
                onClick={handleRoleChange}
                disabled={isSaving}
              >
                Save
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setTempRole(user.role);
                  setIsEditingRole(false);
                }}
              >
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <Badge variant="default" size="sm">
            {getRoleLabel(user.role)}
          </Badge>
        )}
      </td>
      <td className="px-4 py-3">
        {isEditingStatus ? (
          <div className="flex items-center gap-2">
            <Dropdown
              trigger={<Badge variant={getStatusVariant(tempStatus)} size="sm">{getStatusLabel(tempStatus)}</Badge>}
              items={[
                { key: 'active', label: 'Active', onClick: () => setTempStatus('active') },
                { key: 'inactive', label: 'Inactive', onClick: () => setTempStatus('inactive') },
                { key: 'suspended', label: 'Suspended', onClick: () => setTempStatus('suspended') },
              ]}
              position="bottom-start"
            />
            <div className="flex gap-1">
              <Button
                variant="primary"
                size="sm"
                onClick={handleStatusChange}
                disabled={isSaving}
              >
                Save
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setTempStatus(user.status);
                  setIsEditingStatus(false);
                }}
              >
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <Badge variant={getStatusVariant(user.status)} size="sm">
            {getStatusLabel(user.status)}
          </Badge>
        )}
      </td>
      <td className="px-4 py-3 text-sm text-neutral-500">
        {new Date(user.createdAt).toLocaleDateString()}
      </td>
      <td className="px-4 py-3">
        <div className="flex gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsEditingRole(!isEditingRole)}
          >
            Edit Role
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsEditingStatus(!isEditingStatus)}
          >
            Edit Status
          </Button>
        </div>
      </td>
    </tr>
  );
};

/**
 * User Management Component
 */
export default function UserManagement({
  initialUsers = [],
  initialTotal = 0,
}: UserManagementProps) {
  const [users, setUsers] = useState<UserWithRole[]>(initialUsers);
  const [total, setTotal] = useState(initialTotal);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Debounce search input
  useEffect(() => {
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    if (searchTerm) {
      searchTimeoutRef.current = setTimeout(() => {
        setDebouncedSearch(searchTerm);
      }, 300);
    } else {
      setDebouncedSearch('');
    }

    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, [searchTerm]);

  // Fetch users when page or search changes
  useEffect(() => {
    const fetchUsers = async () => {
      setIsLoading(true);
      try {
        const params = new URLSearchParams({
          page: page.toString(),
          pageSize: pageSize.toString(),
        });

        if (debouncedSearch) {
          params.set('search', debouncedSearch);
        }

        const response = await fetch(`/api/users?${params}`);
        const result = await response.json();

        if (result.success) {
          setUsers(result.data.users);
          setTotal(result.data.total);
        }
      } catch (error) {
        console.error('Failed to fetch users:', error);
        setToast({ message: 'Failed to load users', type: 'error' });
      } finally {
        setIsLoading(false);
      }
    };

    fetchUsers();
  }, [page, debouncedSearch, pageSize]);

  const handleRoleChange = useCallback(async (userId: string, newRole: UserRole) => {
    try {
      const response = await fetch('/api/users/role', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ userId, role: newRole }),
      });

      const result = await response.json();

      if (result.success) {
        // Update local state
        setUsers((prev) =>
          prev.map((u) => (u.id === userId ? { ...u, role: newRole } : u))
        );
        setToast({ message: 'Role updated successfully', type: 'success' });
      } else {
        setToast({ message: result.error || 'Failed to update role', type: 'error' });
      }
    } catch (error) {
      console.error('Failed to update role:', error);
      setToast({ message: 'Failed to update role', type: 'error' });
    }
  }, []);

  const handleStatusChange = useCallback(async (userId: string, newStatus: UserStatus) => {
    try {
      const response = await fetch('/api/users/status', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ userId, status: newStatus }),
      });

      const result = await response.json();

      if (result.success) {
        // Update local state
        setUsers((prev) =>
          prev.map((u) => (u.id === userId ? { ...u, status: newStatus } : u))
        );
        setToast({ message: 'Status updated successfully', type: 'success' });
      } else {
        setToast({ message: result.error || 'Failed to update status', type: 'error' });
      }
    } catch (error) {
      console.error('Failed to update status:', error);
      setToast({ message: 'Failed to update status', type: 'error' });
    }
  }, []);

  const totalPages = Math.ceil(total / pageSize);

  return (
    <div className="space-y-6">
      {/* Toast notification */}
      {toast && (
        <Toast
          message={toast.message}
          variant={toast.type}
          onClose={() => setToast(null)}
        />
      )}

      {/* Search and filters */}
      <Card variant="elevated" padding="lg">
        <div className="flex items-center justify-between">
          <div className="flex-1 max-w-md">
            <Input
              placeholder="Search by email..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full"
            />
            {debouncedSearch && (
              <div className="mt-2 flex items-center gap-2">
                <Badge variant="primary" size="sm">
                  Filtered: {debouncedSearch}
                </Badge>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setSearchTerm('');
                    setDebouncedSearch('');
                    setPage(1);
                  }}
                >
                  Clear
                </Button>
              </div>
            )}
          </div>
          <div className="text-sm text-neutral-500">
            Showing {users.length} of {total} users
          </div>
        </div>
      </Card>

      {/* User table */}
      <Card variant="elevated" padding="0">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-neutral-50 border-b border-neutral-200">
              <tr>
                <th className="px-4 py-3 text-left text-sm font-semibold text-neutral-700">
                  User
                </th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-neutral-700">
                  Role
                </th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-neutral-700">
                  Status
                </th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-neutral-700">
                  Joined
                </th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-neutral-700">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-neutral-500">
                    Loading...
                  </td>
                </tr>
              ) : users.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-neutral-500">
                    No users found
                  </td>
                </tr>
              ) : (
                users.map((user) => (
                  <UserRow
                    key={user.id}
                    user={user}
                    onRoleChange={handleRoleChange}
                    onStatusChange={handleStatusChange}
                  />
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 0 && (
          <div className="flex items-center justify-between px-4 py-4 border-t border-neutral-200">
            <div className="text-sm text-neutral-600">
              Page {page} of {totalPages}
            </div>
            <div className="flex gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
              >
                Previous
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
