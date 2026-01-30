'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import useSWR from 'swr';
import OrgLayout from '@/components/layout/OrgLayout';
import Button from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';
import { organizationsAPI } from '@/lib/api';
import { useToast } from '@/components/ToastContainer';
import { Users, Mail, Shield, Trash2, UserPlus } from 'lucide-react';

interface Member {
  id: number;
  user_id: number;
  email: string;
  full_name: string;
  role: 'owner' | 'admin' | 'member' | 'viewer';
  joined_at: string;
}

export default function TeamPage() {
  const router = useRouter();
  const params = useParams();
  const toast = useToast();
  const orgId = (Array.isArray(params?.orgId) ? params.orgId[0] : params?.orgId) as string;

  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<'admin' | 'member' | 'viewer'>('member');
  const [inviting, setInviting] = useState(false);

  const { data: org } = useSWR(orgId ? ['organization', orgId] : null, () =>
    organizationsAPI.get(orgId, { includeStats: false }),
  );

  const { data: members, mutate: refetchMembers } = useSWR<Member[]>(
    orgId ? ['organization-members', orgId] : null,
    () => organizationsAPI.listMembers(orgId),
  );

  useEffect(() => {
    const token = localStorage.getItem('access_token');
    if (!token) {
      router.push('/login');
    }
  }, [router]);

  const handleInvite = async () => {
    if (!inviteEmail.trim()) {
      toast.showToast('Please enter an email address', 'warning');
      return;
    }

    setInviting(true);
    try {
      await organizationsAPI.inviteMember(orgId, { email: inviteEmail, role: inviteRole });
      toast.showToast('Invitation sent successfully', 'success');
      setInviteEmail('');
      refetchMembers();
    } catch (error: any) {
      toast.showToast(error.response?.data?.detail || 'Failed to send invitation', 'error');
    } finally {
      setInviting(false);
    }
  };

  const handleRemoveMember = async (memberId: number) => {
    if (!confirm('Are you sure you want to remove this member?')) return;

    try {
      await organizationsAPI.removeMember(orgId, memberId);
      toast.showToast('Member removed', 'success');
      refetchMembers();
    } catch (error: any) {
      toast.showToast(error.response?.data?.detail || 'Failed to remove member', 'error');
    }
  };

  const getRoleBadge = (role: string) => {
    switch (role) {
      case 'owner':
        return <Badge variant="info">Owner</Badge>;
      case 'admin':
        return <Badge variant="success">Admin</Badge>;
      case 'member':
        return <Badge variant="default">Member</Badge>;
      case 'viewer':
        return <Badge variant="warning">Viewer</Badge>;
      default:
        return <Badge variant="default">{role}</Badge>;
    }
  };

  return (
    <OrgLayout
      orgId={orgId}
      breadcrumb={[
        { label: 'Organizations', href: '/organizations' },
        { label: org?.name || 'Organization', href: `/organizations/${orgId}/projects` },
        { label: 'Team' },
      ]}
    >
      <div className="max-w-4xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-white flex items-center gap-3">
            <Users className="h-8 w-8 text-ag-accent" />
            Team Members
          </h1>
          <p className="text-slate-400 mt-2">Manage who has access to this organization</p>
        </div>

        {/* Invite Form */}
        <div className="rounded-xl border border-white/10 bg-white/5 p-6 mb-8">
          <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
            <UserPlus className="h-5 w-5" />
            Invite New Member
          </h2>
          <div className="flex gap-4">
            <input
              type="email"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              placeholder="Email address"
              className="flex-1 bg-black/40 border border-white/10 rounded-lg px-4 py-2 text-white placeholder:text-slate-500 focus:border-ag-accent focus:outline-none"
            />
            <select
              value={inviteRole}
              onChange={(e) => setInviteRole(e.target.value as 'admin' | 'member' | 'viewer')}
              className="bg-black/40 border border-white/10 rounded-lg px-4 py-2 text-white focus:border-ag-accent focus:outline-none"
            >
              <option value="admin">Admin</option>
              <option value="member">Member</option>
              <option value="viewer">Viewer</option>
            </select>
            <Button onClick={handleInvite} disabled={inviting}>
              {inviting ? 'Sending...' : 'Invite'}
            </Button>
          </div>
        </div>

        {/* Members List */}
        <div className="rounded-xl border border-white/10 bg-white/5 overflow-hidden">
          <div className="p-4 bg-white/5 border-b border-white/10">
            <h2 className="font-semibold text-white">
              {members?.length || 0} Members
            </h2>
          </div>
          <div className="divide-y divide-white/5">
            {members?.map((member) => (
              <div key={member.id} className="p-4 flex items-center justify-between hover:bg-white/5 transition-colors">
                <div className="flex items-center gap-4">
                  <div className="h-10 w-10 rounded-full bg-ag-primary/30 flex items-center justify-center text-white font-semibold">
                    {member.full_name?.charAt(0) || member.email.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <div className="text-white font-medium">{member.full_name || 'Unnamed User'}</div>
                    <div className="text-sm text-slate-400 flex items-center gap-1">
                      <Mail className="h-3 w-3" />
                      {member.email}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {getRoleBadge(member.role)}
                  {member.role !== 'owner' && (
                    <button
                      onClick={() => handleRemoveMember(member.id)}
                      className="p-2 text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-lg transition-colors"
                      title="Remove member"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </div>
            ))}
            {(!members || members.length === 0) && (
              <div className="p-8 text-center text-slate-400">
                No members yet. Invite someone to get started.
              </div>
            )}
          </div>
        </div>
      </div>
    </OrgLayout>
  );
}
