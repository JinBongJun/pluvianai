'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { organizationsAPI } from '@/lib/api';
import { useToast } from '@/components/ToastContainer';

export default function NewOrganizationPage() {
  const router = useRouter();
  const toast = useToast();
  const [name, setName] = useState('');
  const [type, setType] = useState('personal');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!name.trim()) {
      setError('Organization name is required');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const org = await organizationsAPI.create({
        name: name.trim(),
        type: type || undefined,
      });
      
      toast.showToast('Organization created successfully', 'success');
      router.push(`/organizations/${org.id}/projects`);
    } catch (err: any) {
      const errorMessage = err.response?.data?.detail || err.message || 'Failed to create organization';
      setError(errorMessage);
      toast.showToast(errorMessage, 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      {/* Header */}
      <div className="border-b border-gray-800">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-green-500">⚡</span>
            <span className="text-gray-400">/</span>
            <span>Organizations</span>
            <span className="text-gray-400">/</span>
            <span>New</span>
          </div>
          <div className="flex items-center gap-4">
            <button className="text-gray-400 hover:text-white">Feedback</button>
            <button className="text-gray-400 hover:text-white">🔍</button>
            <button className="text-gray-400 hover:text-white">❓</button>
            <button className="text-gray-400 hover:text-white">💡</button>
            <div className="w-8 h-8 rounded-full bg-purple-500"></div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="container mx-auto px-4 py-8 max-w-2xl">
        <h1 className="text-3xl font-bold mb-2">Create a new organization</h1>
        <p className="text-gray-400 mb-8">
          Organizations are a way to group your projects. Each organization
          can be configured with different team members and billing settings.
        </p>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Name Field */}
          <div>
            <label className="block text-sm font-medium mb-2">
              Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Organization name"
              className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
              required
              maxLength={255}
              disabled={loading}
            />
            <p className="mt-1 text-sm text-gray-400">
              What's the name of your company or team? You can change this later.
            </p>
          </div>

          {/* Type Field */}
          <div>
            <label className="block text-sm font-medium mb-2">Type</label>
            <select
              value={type}
              onChange={(e) => setType(e.target.value)}
              className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
              disabled={loading}
            >
              <option value="personal">Personal</option>
              <option value="startup">Startup</option>
              <option value="company">Company</option>
              <option value="agency">Agency</option>
              <option value="educational">Educational</option>
              <option value="na">N/A</option>
            </select>
            <p className="mt-1 text-sm text-gray-400">
              What best describes your organization?
            </p>
          </div>

          {/* Info Messages */}
          <div className="bg-blue-900/20 border border-blue-800 rounded-lg p-4">
            <p className="text-sm text-blue-300">
              ℹ️  Your organization will start on the Free plan. You can upgrade
              anytime from Settings &gt; Billing.
            </p>
          </div>

          <div className="bg-blue-900/20 border border-blue-800 rounded-lg p-4">
            <p className="text-sm text-blue-300">
              ℹ️  You&apos;ll be the owner of this organization. You can invite team
              members and transfer ownership later from Settings &gt; Team.
            </p>
          </div>

          {/* Error Message */}
          {error && (
            <div className="bg-red-900/20 border border-red-800 rounded-lg p-4">
              <p className="text-sm text-red-300">{error}</p>
            </div>
          )}

          {/* Buttons */}
          <div className="flex justify-end gap-4">
            <button
              type="button"
              onClick={() => router.push('/organizations')}
              className="px-4 py-2 border border-gray-700 rounded-lg hover:bg-gray-800 transition-colors"
              disabled={loading}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!name.trim() || loading}
              className="px-4 py-2 bg-green-600 rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? 'Creating...' : 'Create organization'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
