'use client';

import { useState, useEffect } from 'react';
import { projectMembersAPI } from '@/lib/api';
import { useToast } from '@/components/ToastContainer';

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

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-semibold text-gray-900">Team Members</h3>
        {canManage && (
          <button
            onClick={() => setShowAddModal(true)}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 text-sm"
          >
            Add Member
          </button>
        )}
      </div>

      <div className="space-y-2">
        {members.map((member) => (
          <div
            key={member.id || member.user_id}
            className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
          >
            <div className="flex-1">
              <p className="font-medium text-gray-900">
                {member.user_name || member.user_email}
              </p>
              <p className="text-sm text-gray-600">{member.user_email}</p>
            </div>
            <div className="flex items-center gap-2">
              {canManage && member.role !== 'owner' ? (
                <>
                  <select
                    value={member.role}
                    onChange={(e) =>
                      handleUpdateRole(
                        member.user_id,
                        e.target.value as 'admin' | 'member' | 'viewer'
                      )
                    }
                    className="text-sm border-gray-300 rounded-md"
                  >
                    <option value="admin">Admin</option>
                    <option value="member">Member</option>
                    <option value="viewer">Viewer</option>
                  </select>
                  <button
                    onClick={() => handleRemoveMember(member.user_id)}
                    className="px-3 py-1 text-sm text-red-600 hover:text-red-700"
                  >
                    Remove
                  </button>
                </>
              ) : (
                <span
                  className={`px-2 py-1 text-xs rounded ${
                    member.role === 'owner'
                      ? 'bg-purple-100 text-purple-700'
                      : member.role === 'admin'
                      ? 'bg-blue-100 text-blue-700'
                      : member.role === 'member'
                      ? 'bg-green-100 text-green-700'
                      : 'bg-gray-100 text-gray-700'
                  }`}
                >
                  {member.role}
                </span>
              )}
            </div>
          </div>
        ))}
      </div>

      {showAddModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full">
            <h3 className="text-lg font-semibold mb-4">Add Team Member</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Email
                </label>
                <input
                  type="email"
                  value={newMemberEmail}
                  onChange={(e) => setNewMemberEmail(e.target.value)}
                  className="w-full border-gray-300 rounded-md shadow-sm"
                  placeholder="user@example.com"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Role
                </label>
                <select
                  value={newMemberRole}
                  onChange={(e) =>
                    setNewMemberRole(e.target.value as 'admin' | 'member' | 'viewer')
                  }
                  className="w-full border-gray-300 rounded-md shadow-sm"
                >
                  <option value="admin">Admin</option>
                  <option value="member">Member</option>
                  <option value="viewer">Viewer</option>
                </select>
              </div>
              <div className="flex gap-2 justify-end">
                <button
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200"
                >
                  Cancel
                </button>
                <button
                  onClick={handleAddMember}
                  className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
                >
                  Add
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

