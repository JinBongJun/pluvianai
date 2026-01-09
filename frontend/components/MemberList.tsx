'use client';

import { useState, useEffect } from 'react';
import { projectMembersAPI } from '@/lib/api';
import { useToast } from '@/components/ToastContainer';
import MemberActivity from './MemberActivity';
import MemberInvite from './MemberInvite';
import { ChevronDown, ChevronUp, Eye, Settings, Users, Trash2, FileText, BarChart3 } from 'lucide-react';

interface Member {
  id: number;
  user_id: number;
  user_email: string;
  user_name: string | null;
  role: 'owner' | 'admin' | 'member' | 'viewer';
  created_at: string;
}

interface MemberListProps {
  projectId: number;
  canManage: boolean; // owner or admin
}

export default function MemberList({ projectId, canManage }: MemberListProps) {
  const toast = useToast();
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [newMemberEmail, setNewMemberEmail] = useState('');
  const [newMemberRole, setNewMemberRole] = useState<'admin' | 'member' | 'viewer'>('member');
  const [expandedMembers, setExpandedMembers] = useState<Set<number>>(new Set());

  useEffect(() => {
    loadMembers();
  }, [projectId]);

  const loadMembers = async () => {
    try {
      const data = await projectMembersAPI.list(projectId);
      setMembers(data);
    } catch (error) {
      console.error('Failed to load members:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAddMember = async () => {
    if (!newMemberEmail) {
      toast.showToast('Email is required', 'warning');
      return;
    }
    
    try {
      await projectMembersAPI.add(projectId, newMemberEmail, newMemberRole);
      setNewMemberEmail('');
      setNewMemberRole('member');
      setShowAddModal(false);
      toast.showToast('Member added successfully', 'success');
      loadMembers();
    } catch (error: any) {
      toast.showToast(error.response?.data?.detail || 'Failed to add member', 'error');
    }
  };

  const handleRemoveMember = async (userId: number) => {
    if (!confirm('Are you sure you want to remove this member?')) return;
    
    try {
      await projectMembersAPI.remove(projectId, userId);
      toast.showToast('Member removed successfully', 'success');
      loadMembers();
    } catch (error: any) {
      toast.showToast(error.response?.data?.detail || 'Failed to remove member', 'error');
    }
  };

  const handleUpdateRole = async (userId: number, newRole: 'admin' | 'member' | 'viewer') => {
    try {
      await projectMembersAPI.updateRole(projectId, userId, newRole);
      toast.showToast('Role updated successfully', 'success');
      loadMembers();
    } catch (error: any) {
      toast.showToast(error.response?.data?.detail || 'Failed to update role', 'error');
    }
  };

  if (loading) {
    return <div className="text-center py-4">Loading members...</div>;
  }

  const roleDescriptions = {
    owner: 'Full control: Can delete project, manage all settings and members',
    admin: 'Can manage settings and members, but cannot delete project',
    member: 'Can view data and make API calls, but cannot change settings',
    viewer: 'Read-only access: Can only view project data'
  };

  const roleFeatures = {
    owner: [
      { icon: Eye, label: 'View all data', available: true },
      { icon: Settings, label: 'Manage settings', available: true },
      { icon: Users, label: 'Manage members', available: true },
      { icon: Trash2, label: 'Delete project', available: true },
      { icon: FileText, label: 'Generate reports', available: true },
      { icon: BarChart3, label: 'View analytics', available: true },
    ],
    admin: [
      { icon: Eye, label: 'View all data', available: true },
      { icon: Settings, label: 'Manage settings', available: true },
      { icon: Users, label: 'Manage members', available: true },
      { icon: Trash2, label: 'Delete project', available: false },
      { icon: FileText, label: 'Generate reports', available: true },
      { icon: BarChart3, label: 'View analytics', available: true },
    ],
    member: [
      { icon: Eye, label: 'View all data', available: true },
      { icon: Settings, label: 'Manage settings', available: false },
      { icon: Users, label: 'Manage members', available: false },
      { icon: Trash2, label: 'Delete project', available: false },
      { icon: FileText, label: 'Generate reports', available: true },
      { icon: BarChart3, label: 'View analytics', available: true },
    ],
    viewer: [
      { icon: Eye, label: 'View all data', available: true },
      { icon: Settings, label: 'Manage settings', available: false },
      { icon: Users, label: 'Manage members', available: false },
      { icon: Trash2, label: 'Delete project', available: false },
      { icon: FileText, label: 'Generate reports', available: false },
      { icon: BarChart3, label: 'View analytics', available: true },
    ],
  };

  const toggleMemberExpanded = (userId: number) => {
    const newExpanded = new Set(expandedMembers);
    if (newExpanded.has(userId)) {
      newExpanded.delete(userId);
    } else {
      newExpanded.add(userId);
    }
    setExpandedMembers(newExpanded);
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <div>
          <h3 className="text-lg font-semibold text-white">Team Members</h3>
          <p className="text-sm text-slate-400 mt-1">
            Manage who can access this project and their permissions
          </p>
        </div>
        {canManage && (
          <div className="flex items-center gap-2">
            <MemberInvite projectId={projectId} />
            <button
              onClick={() => setShowAddModal(true)}
              className="px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700 text-sm transition-colors"
            >
              Add Member
            </button>
          </div>
        )}
      </div>

      <div className="space-y-2">
        {members.map((member) => {
          const isExpanded = expandedMembers.has(member.user_id);
          const features = roleFeatures[member.role as keyof typeof roleFeatures] || [];
          
          return (
            <div
              key={member.id || member.user_id}
              className="bg-white/5 rounded-lg border border-white/10 overflow-hidden"
            >
              <div
                className="flex items-center justify-between p-3 hover:bg-white/10 transition-colors cursor-pointer"
                onClick={() => toggleMemberExpanded(member.user_id)}
              >
                <div className="flex-1">
                  <p className="font-medium text-white">
                    {member.user_name || member.user_email}
                  </p>
                  <p className="text-sm text-slate-400">{member.user_email}</p>
                </div>
                <div className="flex items-center gap-3">
                  <div className="flex flex-col items-end">
                    <span
                      className={`px-2 py-1 text-xs font-medium rounded capitalize ${
                        member.role === 'owner'
                          ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30'
                          : member.role === 'admin'
                          ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                          : member.role === 'member'
                          ? 'bg-green-500/20 text-green-300 border border-green-500/30'
                          : 'bg-slate-500/20 text-slate-300 border border-slate-500/30'
                      }`}
                      title={roleDescriptions[member.role as keyof typeof roleDescriptions]}
                    >
                      {member.role}
                    </span>
                    {canManage && member.role !== 'owner' && (
                      <div className="flex items-center gap-2 mt-2" onClick={(e) => e.stopPropagation()}>
                        <select
                          value={member.role}
                          onChange={(e) =>
                            handleUpdateRole(
                              member.user_id,
                              e.target.value as 'admin' | 'member' | 'viewer'
                            )
                          }
                          className="text-xs bg-white/5 border border-white/10 rounded-md px-2 py-1 text-white focus:ring-purple-500 focus:border-purple-500"
                          title="Change role"
                        >
                          <option value="admin" className="bg-[#0B0C15]">Admin</option>
                          <option value="member" className="bg-[#0B0C15]">Member</option>
                          <option value="viewer" className="bg-[#0B0C15]">Viewer</option>
                        </select>
                        <button
                          onClick={() => handleRemoveMember(member.user_id)}
                          className="px-2 py-1 text-xs text-red-400 hover:text-red-300 hover:bg-red-500/20 rounded transition-colors"
                          title="Remove member"
                        >
                          Remove
                        </button>
                      </div>
                    )}
                  </div>
                  <button className="text-slate-400 hover:text-white transition-colors">
                    {isExpanded ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
                  </button>
                </div>
              </div>
              
              {isExpanded && (
                <div className="border-t border-white/10 p-4 space-y-4">
                  {/* Role Features */}
                  <div>
                    <h4 className="text-sm font-medium text-white mb-2">Accessible Features</h4>
                    <div className="grid grid-cols-2 gap-2">
                      {features.map((feature, idx) => {
                        const Icon = feature.icon;
                        return (
                          <div
                            key={idx}
                            className={`flex items-center gap-2 p-2 rounded ${
                              feature.available
                                ? 'bg-green-500/10 text-green-400'
                                : 'bg-slate-500/10 text-slate-500'
                            }`}
                          >
                            <Icon className="h-4 w-4" />
                            <span className="text-xs">{feature.label}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                  
                  {/* Member Activity */}
                  <div>
                    <h4 className="text-sm font-medium text-white mb-2">Activity</h4>
                    <MemberActivity
                      projectId={projectId}
                      userId={member.user_id}
                      userEmail={member.user_email}
                      userName={member.user_name}
                    />
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {showAddModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-[9999] p-4">
          <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-b from-white/10 to-white/5 backdrop-blur-md p-6 max-w-md w-full max-h-[90vh] overflow-y-auto shadow-2xl">
            <h3 className="text-lg font-semibold text-white mb-2">Add Team Member</h3>
            <p className="text-sm text-slate-400 mb-4">
              The user must already have an AgentGuard account with this email address.
            </p>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-white mb-1">
                  Email Address
                </label>
                <input
                  type="email"
                  value={newMemberEmail}
                  onChange={(e) => setNewMemberEmail(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-md shadow-sm px-3 py-2 text-white placeholder:text-slate-500 focus:ring-purple-500 focus:border-purple-500"
                  placeholder="user@example.com"
                  onKeyPress={(e) => {
                    if (e.key === 'Enter') {
                      handleAddMember();
                    }
                  }}
                />
                <p className="text-xs text-slate-400 mt-1">
                  User must be registered with this email
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium text-white mb-1">
                  Role
                </label>
                <select
                  value={newMemberRole}
                  onChange={(e) =>
                    setNewMemberRole(e.target.value as 'admin' | 'member' | 'viewer')
                  }
                  className="w-full bg-white/5 border border-white/10 rounded-md shadow-sm px-3 py-2 text-white focus:ring-purple-500 focus:border-purple-500"
                >
                  <option value="admin" className="bg-[#0B0C15] text-white">Admin - Manage settings and members</option>
                  <option value="member" className="bg-[#0B0C15] text-white">Member - View data and make API calls</option>
                  <option value="viewer" className="bg-[#0B0C15] text-white">Viewer - Read-only access</option>
                </select>
                <p className="text-xs text-slate-400 mt-1">
                  {roleDescriptions[newMemberRole]}
                </p>
              </div>
              <div className="flex gap-2 justify-end pt-2">
                <button
                  onClick={() => {
                    setShowAddModal(false);
                    setNewMemberEmail('');
                    setNewMemberRole('member');
                  }}
                  className="px-4 py-2 text-slate-300 bg-white/5 border border-white/10 rounded-md hover:bg-white/10 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleAddMember}
                  className="px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700 transition-colors"
                >
                  Add Member
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

