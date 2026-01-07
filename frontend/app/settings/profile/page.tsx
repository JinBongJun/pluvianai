'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import DashboardLayout from '@/components/layout/DashboardLayout';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Modal from '@/components/ui/Modal';
import { settingsAPI } from '@/lib/api';
import { useToast } from '@/components/ToastContainer';
import Avatar from '@/components/ui/Avatar';
import { User, Trash2, Save } from 'lucide-react';

export default function ProfilePage() {
  const router = useRouter();
  const toast = useToast();
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [fullName, setFullName] = useState('');
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem('access_token');
    if (!token) {
      router.push('/login');
      return;
    }

    loadProfile();
  }, [router]);

  const loadProfile = async () => {
    try {
      const data = await settingsAPI.getProfile();
      setProfile(data);
      setFullName(data.full_name || '');
    } catch (error: any) {
      console.error('Failed to load profile:', error);
      toast.showToast(error.response?.data?.detail || 'Failed to load profile', 'error');
      if (error.response?.status === 401) {
        router.push('/login');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!fullName.trim()) {
      toast.showToast('Name cannot be empty', 'warning');
      return;
    }

    setSaving(true);
    try {
      const updated = await settingsAPI.updateProfile({ full_name: fullName });
      setProfile(updated);
      toast.showToast('Profile updated successfully', 'success');
    } catch (error: any) {
      console.error('Failed to update profile:', error);
      toast.showToast(error.response?.data?.detail || 'Failed to update profile', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteAccount = async () => {
    if (!deletePassword) {
      toast.showToast('Please enter your password to confirm', 'warning');
      return;
    }

    if (!confirm('Are you sure you want to delete your account? This action cannot be undone.')) {
      return;
    }

    setDeleting(true);
    try {
      await settingsAPI.deleteAccount(deletePassword);
      toast.showToast('Account deleted successfully', 'success');
      localStorage.removeItem('access_token');
      localStorage.removeItem('refresh_token');
      router.push('/login');
    } catch (error: any) {
      console.error('Failed to delete account:', error);
      toast.showToast(error.response?.data?.detail || 'Failed to delete account', 'error');
      setDeletePassword('');
    } finally {
      setDeleting(false);
    }
  };

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-black"></div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Profile Settings</h1>
          <p className="text-gray-600 mt-1">Manage your profile information</p>
        </div>

        {/* Profile Information */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex items-start gap-6">
            <div className="flex-shrink-0">
              <Avatar name={profile?.full_name || profile?.email} email={profile?.email} size="lg" />
            </div>
            <div className="flex-1">
              <h2 className="text-xl font-semibold text-gray-900 mb-6">Profile Information</h2>
              
              <div className="space-y-4 max-w-md">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Email
                  </label>
                  <Input
                    type="email"
                    value={profile?.email || ''}
                    disabled
                    className="bg-gray-50"
                  />
                  <p className="text-xs text-gray-500 mt-1">Email cannot be changed</p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Full Name
                  </label>
                  <Input
                    type="text"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Enter your full name"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Member Since
                  </label>
                  <Input
                    type="text"
                    value={profile?.created_at ? new Date(profile.created_at).toLocaleDateString() : ''}
                    disabled
                    className="bg-gray-50"
                  />
                </div>

                <div className="flex gap-3 pt-2">
                  <Button
                    onClick={handleSave}
                    disabled={saving || fullName === (profile?.full_name || '')}
                    className="flex items-center gap-2"
                  >
                    <Save className="h-4 w-4" />
                    {saving ? 'Saving...' : 'Save Changes'}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Danger Zone */}
        <div className="bg-white rounded-lg shadow-sm border border-red-200 p-6">
          <h2 className="text-xl font-semibold text-red-900 mb-4">Danger Zone</h2>
          <p className="text-sm text-gray-600 mb-4">
            Once you delete your account, there is no going back. Please be certain.
          </p>
          <Button
            variant="danger"
            onClick={() => setShowDeleteModal(true)}
            className="flex items-center gap-2"
          >
            <Trash2 className="h-4 w-4" />
            Delete Account
          </Button>
        </div>

        {/* Delete Account Modal */}
        <Modal
          isOpen={showDeleteModal}
          onClose={() => {
            setShowDeleteModal(false);
            setDeletePassword('');
          }}
          title="Delete Account"
        >
          <div className="space-y-4">
            <p className="text-sm text-gray-600">
              This will permanently delete your account and all associated data. This action cannot be undone.
            </p>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Enter your password to confirm
              </label>
              <Input
                type="password"
                value={deletePassword}
                onChange={(e) => setDeletePassword(e.target.value)}
                placeholder="Your password"
                className="w-full"
              />
            </div>
            <div className="flex gap-3 justify-end pt-4">
              <Button
                variant="secondary"
                onClick={() => {
                  setShowDeleteModal(false);
                  setDeletePassword('');
                }}
              >
                Cancel
              </Button>
              <Button
                variant="danger"
                onClick={handleDeleteAccount}
                disabled={!deletePassword || deleting}
              >
                {deleting ? 'Deleting...' : 'Delete Account'}
              </Button>
            </div>
          </div>
        </Modal>
      </div>
    </DashboardLayout>
  );
}

