'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import Badge from './Badge';
import { Button } from './Button';
import { Dropdown, DropdownItem } from './Dropdown';
import { Input } from './Input';
import { Toast, useToast } from './Toast';
import { User, UserRole, UserStatus } from '@/types/user';

/**
 * User data prop for the table (excludes sensitive fields)
 */
export interface UserTableRow {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  status: UserStatus;
  createdAt: string;
}

/**
 * API response for paginated users
 */
interface UsersApiResponse {
  success: boolean;
  data?: {
    users: UserTableRow[];
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
  };
  error?: string;
}

/**
 * Role update request
 */
interface RoleUpdateRequest {
  userId: string;
  newRole: UserRole;
  changedBy?: string;
}

const ROLE_OPTIONS: { key: string; label: string; value: UserRole }[] = [
  { key: 'user', label: 'User', value: 'user' },
  { key: 'business_owner', label: 'Business Owner', value: 'business_owner' },
  { key: 'admin', label: 'Admin', value: 'admin' },
];

const STATUS_BADGE_VARIANT: Record<UserStatus, 'success' | 'warning' | 'error'> = {
  active: 'success',
  inactive: 'warning',
  suspended: 'error',
};

interface UserTableProps {
  /** API base URL for fetching users */
  apiUrl?: string;
  /** Admin user identifier for role change events */
  adminUser?: string;
}

export function UserTable({ apiUrl = '/api/users', adminUser = 'admin' }: UserTableProps) {
  const [users, setUsers] = useState<UserTableRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [totalPages, setTotalPages] = useState(1);
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [updatingUserId, setUpdatingUserId] = useState<string | null>(null);
  const { addToast } = useToast();

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchTerm);
    }, 300);

    return () => clearTimeout(timer);
  }, [searchTerm]);

  // Fetch users when page or search changes
  const fetchUsers = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams({
        page: page.toString(),
        pageSize: pageSize.toString(),
      });

      if (debouncedSearch) {
        params.set('emailSearch', debouncedSearch);
      }

      const response = await fetch(`${apiUrl}?${params.toString()}`);
      const result: UsersApiResponse = await response.json();

      if (!result.success) {
        throw new Error(result.error || 'Failed to fetch users');
      }

      setUsers(result.data.users);
      setTotalPages(result.data.totalPages);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      setError(errorMessage);
      addToast(`Failed to load users: ${errorMessage}`, { variant: 'error' });
    } finally {
      setLoading(false);
    }
  }, [apiUrl, page, pageSize, debouncedSearch, addToast]);

  // Initial fetch and re-fetch on debounced search
  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  // Reset to page 1 when search changes
  useEffect(() => {
    setPage(1);
  }, [debouncedSearch]);

  // Handle role change
  const handleRoleChange = useCallback(async (userId: string, newRole: UserRole) => {
    setUpdatingUserId(userId);

    try {
      const response = await fetch(`${apiUrl}/role`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId,
          newRole,
          changedBy: adminUser,
        }),
      });

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error || 'Failed to update role');
      }

      // Update local state with new role
      setUsers((prevUsers) =>
        prevUsers.map((user) =>
          user.id === userId ? { ...user, role: newRole } : user
        )
      );

      addToast('Role updated', { variant: 'success' });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      addToast(`Failed to update role: ${errorMessage}`, { variant: 'error' });
    } finally {
      setUpdatingUserId(null);
    }
  }, [apiUrl, adminUser, addToast]);

  // Get role dropdown items for a user
  const getRoleDropdownItems = useCallback((userId: string, currentRole: UserRole): DropdownItem[] => {
    return ROLE_OPTIONS.map((option) => ({
      key: option.value,
      label: option.label,
      disabled: option.value === currentRole,
      onClick: () => handleRoleChange(userId, option.value),
    }));
  }, [handleRoleChange]);

  // Format date
  const formatDate = (dateString: string): string => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  // Render role badge
  const renderRoleBadge = (role: UserRole): React.ReactNode => {
    const roleLabels: Record<UserRole, string> = {
      user: 'User',
      business_owner: 'Business Owner',
      admin: 'Admin',
    };

    return (
      <Badge variant="primary" size="sm">
        {roleLabels[role]}
      </Badge>
    );
  };

  // Render status badge
  const renderStatusBadge = (status: UserStatus): React.ReactNode => {
    const statusLabels: Record<UserStatus, string> = {
      active: 'Active',
      inactive: 'Inactive',
      suspended: 'Suspended',
    };

    return (
      <Badge variant={STATUS_BADGE_VARIANT[status]} size="sm">
        {statusLabels[status]}
      </Badge>
    );
  };

  // Render pagination controls
  const renderPagination = (): React.ReactNode => {
    if (totalPages <= 1) return null;

    const pages: (number | string)[] = [];
    const maxVisible = 5;

    if (totalPages <= maxVisible) {
      for (let i = 1; i <= totalPages; i++) {
        pages.push(i);
      }
    } else {
      if (page <= 3) {
        pages.push(1, 2, 3, 4, '...', totalPages);
      } else if (page >= totalPages - 2) {
        pages.push(1, '...', totalPages - 3, totalPages - 2, totalPages - 1, totalPages);
      } else {
        pages.push(1, '...', page - 1, page, page + 1, '...', totalPages);
      }
    }

    return (
      <div className="flex items-center justify-between mt-4">
        <Button
          variant="secondary"
          size="sm"
          onClick={() => setPage((p) => Math.max(1, p - 1))}
          disabled={page === 1}
        >
          Previous
        </Button>
        <div className="flex items-center gap-1">
          {pages.map((p, idx) =>
            p === '...' ? (
              <span key={`ellipsis-${idx}`} className="px-2">...</span>
            ) : (
              <Button
                key={p}
                variant={p === page ? 'primary' : 'secondary'}
                size="sm"
                onClick={() => setPage(p as number)}
              >
                {p}
              </Button>
            )
          )}
        </div>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
          disabled={page === totalPages}
        >
          Next
        </Button>
      </div>
    );
  };

  return (
    <div className="w-full">
      {/* Search Input */}
      <div className="mb-4">
        <Input
          placeholder="Search by email..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="max-w-md"
        />
        {debouncedSearch && (
          <div className="mt-2">
            <Badge variant="info" size="sm" pill>
              Search: {debouncedSearch}
            </Badge>
          </div>
        )}
      </div>

      {/* Error State */}
      {error && !loading && (
        <div className="bg-heritage-crimson/10 border border-heritage-crimson/20 text-heritage-crimson px-4 py-3 rounded-lg mb-4">
          {error}
        </div>
      )}

      {/* Loading State */}
      {loading && (
        <div className="text-center py-8 text-neutral-500">Loading users...</div>
      )}

      {/* Table */}
      {!loading && !error && users.length === 0 && (
        <div className="text-center py-8 text-neutral-500">No users found</div>
      )}

      {!loading && !error && users.length > 0 && (
        <>
          <div className="overflow-x-auto border border-neutral-200 rounded-lg">
            <table className="w-full">
              <thead className="bg-neutral-50 border-b border-neutral-200">
                <tr>
                  <th className="text-left px-4 py-3 font-semibold text-neutral-700">Name</th>
                  <th className="text-left px-4 py-3 font-semibold text-neutral-700">Email</th>
                  <th className="text-left px-4 py-3 font-semibold text-neutral-700">Role</th>
                  <th className="text-left px-4 py-3 font-semibold text-neutral-700">Status</th>
                  <th className="text-left px-4 py-3 font-semibold text-neutral-700">Joined</th>
                  <th className="text-right px-4 py-3 font-semibold text-neutral-700">Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr key={user.id} className="border-b border-neutral-100 hover:bg-neutral-50">
                    <td className="px-4 py-3">{user.name}</td>
                    <td className="px-4 py-3 text-neutral-600">{user.email}</td>
                    <td className="px-4 py-3">
                      <Dropdown
                        trigger={renderRoleBadge(user.role)}
                        items={getRoleDropdownItems(user.id, user.role)}
                        position="bottom-start"
                        minWidth="140px"
                      />
                    </td>
                    <td className="px-4 py-3">{renderStatusBadge(user.status)}</td>
                    <td className="px-4 py-3 text-neutral-600">{formatDate(user.createdAt)}</td>
                    <td className="px-4 py-3 text-right">
                      {updatingUserId === user.id ? (
                        <span className="text-sm text-neutral-500">Updating...</span>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div className="mt-4 text-sm text-neutral-600">
            Page {page} of {totalPages}
          </div>
          {renderPagination()}
        </>
      )}
    </div>
  );
}

export default UserTable;
