'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import DashboardLayout from '@/components/layout/DashboardLayout';
import Button from '@/components/ui/Button';
import { Users, Search, ArrowLeft, Mail, User as UserIcon, Shield } from 'lucide-react';
import { adminAPI } from '@/lib/api';
import { useToast } from '@/components/ToastContainer';
import LoadingSpinner from '@/components/LoadingSpinner';
import Pagination from '@/components/ui/Pagination';

export default function AdminUsersPage() {
  const router = useRouter();
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [users, setUsers] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalUsers, setTotalUsers] = useState(0);
  const itemsPerPage = 25;

  useEffect(() => {
    const checkAdmin = async () => {
      try {
        const user = await adminAPI.getCurrentUser();
        if (!user.is_superuser) {
          router.push('/admin');
          return;
        }
        setIsAdmin(true);
        loadUsers();
      } catch (error) {
        router.push('/login');
      } finally {
        setLoading(false);
      }
    };

    checkAdmin();
  }, [router]);

  useEffect(() => {
    if (isAdmin) {
      loadUsers();
    }
  }, [currentPage, searchQuery, isAdmin]);

  const loadUsers = async () => {
    try {
      const offset = (currentPage - 1) * itemsPerPage;
      const response = await adminAPI.listUsers({
        limit: itemsPerPage,
        offset,
        search: searchQuery || undefined,
      });
      
      if (response.data) {
        setUsers(Array.isArray(response.data) ? response.data : []);
        setTotalUsers(response.total || 0);
      } else {
        setUsers(Array.isArray(response) ? response : []);
        setTotalUsers(response.length || 0);
      }
    } catch (error: any) {
      toast.showToast(error.response?.data?.detail || 'Failed to load users', 'error');
    }
  };

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center min-h-screen">
          <LoadingSpinner />
        </div>
      </DashboardLayout>
    );
  }

  if (!isAdmin) {
    return null;
  }

  const totalPages = Math.ceil(totalUsers / itemsPerPage);

  return (
    <DashboardLayout>
      <div className="bg-ag-bg min-h-screen p-6">
        <div className="max-w-7xl mx-auto">
          <div className="mb-8">
            <div className="flex items-center justify-between">
              <div>
                <div className="flex items-center gap-3 mb-2">
                  <Users className="h-8 w-8 text-purple-400" />
                  <h1 className="text-4xl font-bold text-white">User Management</h1>
                </div>
                <p className="text-slate-400 mt-2">View and manage all users</p>
              </div>
              <Button
                onClick={() => router.push('/admin')}
                variant="outline"
              >
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Admin
              </Button>
            </div>
          </div>

          {/* Search */}
          <div className="mb-6">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-slate-400" />
              <input
                type="text"
                placeholder="Search by email or name..."
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setCurrentPage(1);
                }}
                className="w-full pl-10 pr-4 py-2 bg-slate-800 border border-white/10 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-purple-500"
              />
            </div>
          </div>

          {/* Users Table */}
          <div className="bg-white/5 rounded-xl border border-white/10 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-white/10">
                <thead className="bg-white/5">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">
                      User
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">
                      Role
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">
                      Created
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-slate-400 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {users.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-6 py-8 text-center text-slate-400">
                        No users found
                      </td>
                    </tr>
                  ) : (
                    users.map((user) => (
                      <tr key={user.id} className="hover:bg-white/5 transition-colors">
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-purple-500/20 flex items-center justify-center">
                              <UserIcon className="h-5 w-5 text-purple-400" />
                            </div>
                            <div>
                              <div className="text-sm font-medium text-white">{user.email}</div>
                              {user.full_name && (
                                <div className="text-sm text-slate-400">{user.full_name}</div>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          {user.is_superuser ? (
                            <span className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium bg-purple-500/20 text-purple-300">
                              <Shield className="h-3 w-3" />
                              Admin
                            </span>
                          ) : (
                            <span className="text-sm text-slate-400">User</span>
                          )}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-400">
                          {user.created_at
                            ? new Date(user.created_at).toLocaleDateString()
                            : '—'}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm">
                          <Button
                            onClick={() => router.push(`/admin/impersonation?userId=${user.id}`)}
                            variant="outline"
                            size="sm"
                          >
                            Impersonate
                          </Button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="px-6 py-4 border-t border-white/10">
                <Pagination
                  currentPage={currentPage}
                  totalPages={totalPages}
                  totalItems={totalUsers}
                  itemsPerPage={itemsPerPage}
                  onPageChange={setCurrentPage}
                />
              </div>
            )}
          </div>

          {/* Stats */}
          <div className="mt-6 text-sm text-slate-400">
            Showing {users.length} of {totalUsers} users
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
