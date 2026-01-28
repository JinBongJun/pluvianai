'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import DashboardLayout from '@/components/layout/DashboardLayout';
import Button from '@/components/ui/Button';
import { Shield, Search, User, X, AlertTriangle } from 'lucide-react';
import { adminAPI } from '@/lib/api';
import { useToast } from '@/components/ToastContainer';
import LoadingSpinner from '@/components/LoadingSpinner';
import Modal from '@/components/ui/Modal';

export default function ImpersonationPage() {
  const router = useRouter();
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [users, setUsers] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedUser, setSelectedUser] = useState<any>(null);
  const [showImpersonateModal, setShowImpersonateModal] = useState(false);
  const [impersonationReason, setImpersonationReason] = useState('');
  const [isImpersonating, setIsImpersonating] = useState(false);
  const [activeSessions, setActiveSessions] = useState<any[]>([]);

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
        loadActiveSessions();
      } catch (error) {
        router.push('/login');
      } finally {
        setLoading(false);
      }
    };

    checkAdmin();
  }, [router]);

  const loadUsers = async () => {
    try {
      const userList = await adminAPI.listUsers({ limit: 100 });
      setUsers(Array.isArray(userList) ? userList : []);
    } catch (error: any) {
      toast.showToast(error.response?.data?.detail || 'Failed to load users', 'error');
    }
  };

  const loadActiveSessions = async () => {
    try {
      // In production, this would fetch active sessions
      // For now, we'll show empty
      setActiveSessions([]);
    } catch (error) {
      // Ignore errors
    }
  };

  const handleImpersonate = async () => {
    if (!selectedUser) return;

    setIsImpersonating(true);
    try {
      const result = await adminAPI.startImpersonation(selectedUser.id, {
        reason: impersonationReason || 'Support request',
        duration_minutes: 60,
      });

      toast.showToast('Impersonation session started', 'success');
      
      // Store session info and redirect
      localStorage.setItem('impersonation_session_id', result.session_id);
      localStorage.setItem('impersonation_target_user_id', String(selectedUser.id));
      localStorage.setItem('impersonation_admin_user_id', String(result.admin_user_id));
      
      // Redirect to user's dashboard
      router.push(`/dashboard`);
    } catch (error: any) {
      toast.showToast(error.response?.data?.detail || 'Failed to start impersonation', 'error');
    } finally {
      setIsImpersonating(false);
      setShowImpersonateModal(false);
      setSelectedUser(null);
      setImpersonationReason('');
    }
  };

  const handleEndImpersonation = async (sessionId: string) => {
    try {
      await adminAPI.endImpersonation(sessionId);
      toast.showToast('Impersonation session ended', 'success');
      loadActiveSessions();
    } catch (error: any) {
      toast.showToast(error.response?.data?.detail || 'Failed to end impersonation', 'error');
    }
  };

  const filteredUsers = users.filter((user) => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      user.email?.toLowerCase().includes(query) ||
      user.full_name?.toLowerCase().includes(query) ||
      String(user.id).includes(query)
    );
  });

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

  return (
    <DashboardLayout>
      <div className="bg-[#000314] min-h-screen p-6">
        <div className="max-w-6xl mx-auto">
          <div className="mb-8">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-4xl font-bold text-white mb-2">User Impersonation</h1>
                <p className="text-slate-400">
                  Temporarily access user accounts for debugging and support
                </p>
              </div>
              <Button
                onClick={() => router.push('/admin')}
                variant="outline"
              >
                ← Back to Admin
              </Button>
            </div>
          </div>

          {/* Warning Banner */}
          <div className="mb-6 p-4 bg-yellow-500/10 border border-yellow-500/20 rounded-lg">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-yellow-400 flex-shrink-0 mt-0.5" />
              <div>
                <h3 className="font-semibold text-yellow-300 mb-1">Security Notice</h3>
                <p className="text-sm text-yellow-200">
                  All impersonation sessions are fully audited and logged. Use this feature responsibly
                  and only for legitimate support or debugging purposes.
                </p>
              </div>
            </div>
          </div>

          {/* Active Sessions */}
          {activeSessions.length > 0 && (
            <div className="mb-6 bg-white/5 rounded-xl border border-white/10 p-6">
              <h2 className="text-lg font-semibold text-white mb-4">Active Sessions</h2>
              <div className="space-y-2">
                {activeSessions.map((session) => (
                  <div
                    key={session.session_id}
                    className="flex items-center justify-between p-3 bg-slate-800/50 rounded-lg border border-white/5"
                  >
                    <div>
                      <p className="text-sm text-white">
                        User ID: {session.target_user_id} | Started: {new Date(session.created_at).toLocaleString()}
                      </p>
                      {session.reason && (
                        <p className="text-xs text-slate-400 mt-1">Reason: {session.reason}</p>
                      )}
                    </div>
                    <Button
                      onClick={() => handleEndImpersonation(session.session_id)}
                      variant="outline"
                      size="sm"
                    >
                      End Session
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* User Search */}
          <div className="mb-6 bg-white/5 rounded-xl border border-white/10 p-6">
            <div className="flex items-center gap-4 mb-4">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search by email, name, or user ID..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 bg-slate-800 border border-white/10 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-ag-accent"
                />
              </div>
            </div>

            {/* User List */}
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {filteredUsers.length === 0 ? (
                <div className="text-center py-8 text-slate-400">
                  {searchQuery ? 'No users found' : 'No users available'}
                </div>
              ) : (
                filteredUsers.map((user) => (
                  <div
                    key={user.id}
                    className="flex items-center justify-between p-4 bg-slate-800/50 rounded-lg border border-white/5 hover:bg-slate-800/70 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-ag-accent/20 flex items-center justify-center">
                        <User className="h-5 w-5 text-ag-accent" />
                      </div>
                      <div>
                        <p className="font-medium text-white">{user.email}</p>
                        {user.full_name && (
                          <p className="text-sm text-slate-400">{user.full_name}</p>
                        )}
                        <p className="text-xs text-slate-500">ID: {user.id}</p>
                      </div>
                    </div>
                    <Button
                      onClick={() => {
                        setSelectedUser(user);
                        setShowImpersonateModal(true);
                      }}
                      size="sm"
                    >
                      <Shield className="h-4 w-4 mr-2" />
                      Impersonate
                    </Button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Impersonation Modal */}
        <Modal
          isOpen={showImpersonateModal}
          onClose={() => {
            setShowImpersonateModal(false);
            setSelectedUser(null);
            setImpersonationReason('');
          }}
          size="md"
        >
          {selectedUser && (
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-xl font-semibold text-white">Start Impersonation</h3>
                <button
                  onClick={() => {
                    setShowImpersonateModal(false);
                    setSelectedUser(null);
                    setImpersonationReason('');
                  }}
                  className="text-slate-400 hover:text-white"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="mb-4 p-3 bg-slate-800/50 rounded-lg">
                <p className="text-sm text-slate-400 mb-1">Target User</p>
                <p className="text-white font-medium">{selectedUser.email}</p>
                {selectedUser.full_name && (
                  <p className="text-sm text-slate-300">{selectedUser.full_name}</p>
                )}
              </div>

              <div className="mb-4">
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Reason (Required)
                </label>
                <textarea
                  value={impersonationReason}
                  onChange={(e) => setImpersonationReason(e.target.value)}
                  placeholder="e.g., User reported issue with billing, need to verify account status..."
                  className="w-full px-4 py-2 bg-slate-800 border border-white/10 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-ag-accent min-h-[100px]"
                  required
                />
              </div>

              <div className="mb-4 p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-lg">
                <p className="text-xs text-yellow-200">
                  ⚠️ This session will be logged and audited. Duration: 60 minutes (default)
                </p>
              </div>

              <div className="flex gap-3">
                <Button
                  onClick={() => {
                    setShowImpersonateModal(false);
                    setSelectedUser(null);
                    setImpersonationReason('');
                  }}
                  variant="outline"
                  className="flex-1"
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleImpersonate}
                  disabled={!impersonationReason.trim() || isImpersonating}
                  className="flex-1"
                >
                  {isImpersonating ? 'Starting...' : 'Start Impersonation'}
                </Button>
              </div>
            </div>
          )}
        </Modal>
      </div>
    </DashboardLayout>
  );
}
