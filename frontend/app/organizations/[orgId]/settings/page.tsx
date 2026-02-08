'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import useSWR from 'swr';
import OrgLayout from '@/components/layout/OrgLayout';
import { Button } from '@/components/ui/Button';
import { organizationsAPI } from '@/lib/api';
import { useToast } from '@/components/ToastContainer';
import { Settings, Trash2, AlertTriangle } from 'lucide-react';

export default function OrgSettingsPage() {
  const router = useRouter();
  const params = useParams();
  const toast = useToast();
  const orgId = (Array.isArray(params?.orgId) ? params.orgId[0] : params?.orgId) as string;

  const [orgName, setOrgName] = useState('');
  const [saving, setSaving] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');

  const { data: org, mutate: refetchOrg } = useSWR(orgId ? ['organization', orgId] : null, async () => {
    const data = await organizationsAPI.get(orgId, { includeStats: false });
    setOrgName(data.name || '');
    return data;
  });

  const handleSave = async () => {
    if (!orgName.trim()) {
      toast.showToast('Organization name cannot be empty', 'warning');
      return;
    }

    setSaving(true);
    try {
      await organizationsAPI.update(orgId, { name: orgName });
      toast.showToast('Organization updated', 'success');
      refetchOrg();
    } catch (error: any) {
      toast.showToast(error.response?.data?.detail || 'Failed to update organization', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (deleteConfirmText !== org?.name) {
      toast.showToast('Please type the organization name to confirm', 'warning');
      return;
    }

    try {
      await organizationsAPI.delete(orgId);
      toast.showToast('Organization deleted', 'success');
      router.push('/organizations');
    } catch (error: any) {
      toast.showToast(error.response?.data?.detail || 'Failed to delete organization', 'error');
    }
  };

  return (
    <OrgLayout
      orgId={orgId}
      breadcrumb={[
        { label: 'Organizations', href: '/organizations' },
        { label: org?.name || 'Organization', href: `/organizations/${orgId}/projects` },
        { label: 'Settings' },
      ]}
    >
      <div className="max-w-2xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-white flex items-center gap-3">
            <Settings className="h-8 w-8 text-ag-accent" />
            Organization Settings
          </h1>
          <p className="text-slate-400 mt-2">Manage your organization settings</p>
        </div>

        {/* General Settings */}
        <div className="rounded-xl border border-white/10 bg-white/5 p-6 mb-8">
          <h2 className="text-lg font-semibold text-white mb-6">General</h2>
          
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-400 mb-2">
                Organization Name
              </label>
              <input
                type="text"
                value={orgName}
                onChange={(e) => setOrgName(e.target.value)}
                className="w-full bg-black/40 border border-white/10 rounded-lg px-4 py-2 text-white focus:border-ag-accent focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-400 mb-2">
                Organization ID
              </label>
              <input
                type="text"
                value={orgId}
                disabled
                className="w-full bg-black/20 border border-white/5 rounded-lg px-4 py-2 text-slate-500 cursor-not-allowed"
              />
            </div>
          </div>

          <div className="mt-6">
            <Button onClick={handleSave} disabled={saving}>
              {saving ? 'Saving...' : 'Save Changes'}
            </Button>
          </div>
        </div>

        {/* Danger Zone */}
        <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-6">
          <h2 className="text-lg font-semibold text-red-400 mb-2 flex items-center gap-2">
            <AlertTriangle className="h-5 w-5" />
            Danger Zone
          </h2>
          <p className="text-sm text-slate-400 mb-4">
            Once you delete an organization, there is no going back. Please be certain.
          </p>

          {!showDeleteConfirm ? (
            <Button
              variant="secondary"
              onClick={() => setShowDeleteConfirm(true)}
              className="border-red-500/30 text-red-400 hover:bg-red-500/10"
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Delete Organization
            </Button>
          ) : (
            <div className="space-y-4">
              <p className="text-sm text-red-400">
                Type <strong>{org?.name}</strong> to confirm deletion:
              </p>
              <input
                type="text"
                value={deleteConfirmText}
                onChange={(e) => setDeleteConfirmText(e.target.value)}
                className="w-full bg-black/40 border border-red-500/30 rounded-lg px-4 py-2 text-white focus:border-red-500 focus:outline-none"
                placeholder="Type organization name"
              />
              <div className="flex gap-3">
                <Button
                  variant="secondary"
                  onClick={() => {
                    setShowDeleteConfirm(false);
                    setDeleteConfirmText('');
                  }}
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleDelete}
                  className="bg-red-500 hover:bg-red-600"
                  disabled={deleteConfirmText !== org?.name}
                >
                  Delete Organization
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </OrgLayout>
  );
}
