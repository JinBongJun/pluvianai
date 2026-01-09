'use client';

import { useState } from 'react';
import { projectsAPI } from '@/lib/api';
import { useRouter } from 'next/navigation';
import { useToast } from '@/components/ToastContainer';

interface Project {
  id: number;
  name: string;
  description: string | null;
  owner_id: number;
  is_active: boolean;
}

interface ProjectSettingsProps {
  projectId: number;
  project: Project | null;
  onUpdate: () => void;
}

export default function ProjectSettings({ projectId, project, onUpdate }: ProjectSettingsProps) {
  const router = useRouter();
  const toast = useToast();
  const [name, setName] = useState(project?.name || '');
  const [description, setDescription] = useState(project?.description || '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const handleUpdate = async () => {
    if (!name.trim()) {
      setError('Project name is required');
      return;
    }

    setLoading(true);
    setError('');

    try {
      await projectsAPI.update(projectId, name, description || undefined);
      onUpdate();
      toast.showToast('Project updated successfully', 'success');
    } catch (err: any) {
      const errorMsg = err.response?.data?.detail || 'Failed to update project';
      setError(errorMsg);
      toast.showToast(errorMsg, 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm('Are you sure you want to delete this project? This action cannot be undone.')) {
      return;
    }

    setLoading(true);
    setError('');

    try {
      await projectsAPI.delete(projectId);
      toast.showToast('Project deleted successfully', 'success');
      router.push('/dashboard');
    } catch (err: any) {
      const errorMsg = err.response?.data?.detail || 'Failed to delete project';
      setError(errorMsg);
      toast.showToast(errorMsg, 'error');
      setLoading(false);
    }
  };

  if (!project) {
    return <div>Loading...</div>;
  }

  return (
    <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-b from-white/5 to-white/0 backdrop-blur-sm p-6 shadow-2xl space-y-6">
      <h2 className="text-lg font-semibold text-white mb-4">Project Settings</h2>

      {error && (
        <div className="bg-red-500/20 border border-red-500/30 text-red-400 px-4 py-3 rounded">
          {error}
        </div>
      )}

      {/* Project Name */}
      <div>
        <label className="block text-sm font-medium text-white mb-1">
          Project Name *
        </label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full bg-white/5 border border-white/10 rounded-md shadow-sm px-3 py-2 text-white placeholder:text-slate-500 focus:ring-purple-500 focus:border-purple-500"
          placeholder="My Project"
          maxLength={255}
        />
      </div>

      {/* Project Description */}
      <div>
        <label className="block text-sm font-medium text-white mb-1">
          Description
        </label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="w-full bg-white/5 border border-white/10 rounded-md shadow-sm px-3 py-2 text-white placeholder:text-slate-500 focus:ring-purple-500 focus:border-purple-500"
          rows={4}
          placeholder="Project description"
          maxLength={1000}
        />
      </div>

      {/* Update Button */}
      <div className="flex gap-2">
        <button
          onClick={handleUpdate}
          disabled={loading}
          className="px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700 disabled:opacity-50 transition-colors"
        >
          {loading ? 'Saving...' : 'Save Changes'}
        </button>
      </div>

      {/* Danger Zone */}
      <div className="border-t border-white/10 pt-6 mt-6">
        <h3 className="text-lg font-semibold text-red-400 mb-4">Danger Zone</h3>
        <div className="bg-red-500/20 border border-red-500/30 rounded-lg p-4">
          <p className="text-sm text-slate-300 mb-4">
            Once you delete a project, there is no going back. Please be certain.
          </p>
          <button
            onClick={() => setShowDeleteConfirm(true)}
            className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors"
          >
            Delete Project
          </button>
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-b from-white/10 to-white/5 backdrop-blur-md p-6 max-w-md w-full shadow-2xl">
            <h3 className="text-lg font-semibold text-red-400 mb-4">Delete Project</h3>
            <p className="text-slate-300 mb-4">
              Are you sure you want to delete "{project.name}"? This action cannot be undone and will delete all associated data.
            </p>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="px-4 py-2 text-slate-300 bg-white/5 border border-white/10 rounded-md hover:bg-white/10 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={loading}
                className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 disabled:opacity-50 transition-colors"
              >
                {loading ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

